import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { Doc, Id } from "./_generated/dataModel";
import {
  internalMutation,
  mutation,
  MutationCtx,
  query,
  QueryCtx,
} from "./_generated/server";
import { getLoggedInUserHelper, requireUser } from "./auth";
import { words } from "./data/allWords";
import { getEloDelta } from "./lib/elo";
import {
  applyGuess,
  countRevealed,
  deriveState,
  InvalidGuessError,
  maskWord,
  pickRandomWord,
  RANKED_TURN_TIMEOUT_MS,
} from "./lib/game";
import { bumpStats, displayName } from "./lib/utils";

/** Clients heartbeat every ~10s; entries silent for longer are ignored. */
export const QUEUE_STALE_MS = 30_000;
/** Extra time the sweeper waits past a deadline before resolving a match. */
const SWEEP_GRACE_MS = 15_000;

type EndReason = NonNullable<Doc<"matches">["endReason"]>;
type Player = Doc<"matchPlayers">;

export async function getActivePlayerFor(ctx: QueryCtx, userId: Id<"users">) {
  return await ctx.db
    .query("matchPlayers")
    .withIndex("by_user_active_ended", (q) => q.eq("userId", userId).eq("active", true))
    .first();
}

async function getPlayers(ctx: QueryCtx, matchId: Id<"matches">) {
  const players = await ctx.db
    .query("matchPlayers")
    .withIndex("by_match", (q) => q.eq("matchId", matchId))
    .collect();
  if (players.length !== 2) throw new Error(`Match ${matchId} has ${players.length} players`);
  return players as [Player, Player];
}

async function scheduleTurnTimeout(ctx: MutationCtx, playerId: Id<"matchPlayers">, lastGuessAt: number) {
  return await ctx.scheduler.runAfter(RANKED_TURN_TIMEOUT_MS, internal.ranked.turnTimeout, {
    playerId,
    lastGuessAt,
  });
}

/**
 * Ends a match: applies Elo and stats to both players, cancels their turn
 * timers and records how it ended. Every completion path goes through here.
 * `runningTimer` is the player whose timer is executing this code (a
 * scheduled function can't cancel itself).
 */
async function finishMatch(
  ctx: MutationCtx,
  matchId: Id<"matches">,
  winnerUserId: Id<"users">,
  endReason: EndReason,
  runningTimer?: Id<"matchPlayers">,
) {
  const match = await ctx.db.get(matchId);
  if (!match || match.status !== "active") return;
  const players = await getPlayers(ctx, matchId);
  const winner = players.find((p) => p.userId === winnerUserId)!;
  const loser = players.find((p) => p.userId !== winnerUserId)!;

  const [winnerUser, loserUser] = await Promise.all([
    ctx.db.get(winner.userId),
    ctx.db.get(loser.userId),
  ]);
  // Live ratings, so concurrent matches never compute from stale values.
  const winnerElo = winnerUser?.elo ?? winner.eloBefore;
  const loserElo = loserUser?.elo ?? loser.eloBefore;
  const delta = getEloDelta(winnerElo, loserElo, true);
  const now = Date.now();

  for (const [player, user, eloBefore, opponentEloBefore, change, won] of [
    [winner, winnerUser, winnerElo, loserElo, delta, true],
    [loser, loserUser, loserElo, winnerElo, -delta, false],
  ] as const) {
    if (player.timeoutJobId && player._id !== runningTimer) {
      await ctx.scheduler.cancel(player.timeoutJobId);
    }
    const eloAfter = eloBefore + change;
    await ctx.db.patch(player._id, {
      active: false,
      result: won ? "won" : "lost",
      eloBefore,
      opponentEloBefore,
      eloAfter,
      endedAt: now,
      timeoutJobId: undefined,
    });
    if (user && !user.deletedAt) {
      await ctx.db.patch(user._id, {
        elo: eloAfter,
        peakElo: Math.max(user.peakElo, eloAfter),
        ranked: bumpStats(user.ranked, won),
        lastSeenAt: now,
      });
    }
  }

  await ctx.db.patch(matchId, {
    status: "finished",
    endedAt: now,
    winnerId: winnerUserId,
    endReason,
  });
}

/** Removes a match nobody played. Nobody's rating changes. */
async function cancelMatch(ctx: MutationCtx, matchId: Id<"matches">, runningTimer?: Id<"matchPlayers">) {
  for (const player of await getPlayers(ctx, matchId)) {
    if (player.timeoutJobId && player._id !== runningTimer) {
      await ctx.scheduler.cancel(player.timeoutJobId);
    }
    await ctx.db.delete(player._id);
  }
  await ctx.db.delete(matchId);
}

/** Resigns the user's match in progress, if any (also used on account deletion). */
export async function forfeitActiveMatch(ctx: MutationCtx, userId: Id<"users">) {
  const player = await getActivePlayerFor(ctx, userId);
  if (player) await finishMatch(ctx, player.matchId, player.opponentId, "forfeit");
}

function isStale(entry: Doc<"matchQueue">, now: number) {
  return now - entry.lastHeartbeat > QUEUE_STALE_MS;
}

/* -------------------------------------------------------------------------- */
/*                                 Matchmaking                                */
/* -------------------------------------------------------------------------- */

export const enterMatchmaking = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    if (await getActivePlayerFor(ctx, user._id)) {
      throw new ConvexError("You are already in a match");
    }

    const now = Date.now();
    const own = await ctx.db
      .query("matchQueue")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .first();
    if (own) {
      await ctx.db.patch(own._id, { lastHeartbeat: now });
      return { status: "queued" as const };
    }

    // Live entries only, closest rating first, so matches are as fair as the
    // queue allows.
    const candidates = (
      await ctx.db
        .query("matchQueue")
        .withIndex("by_heartbeat", (q) => q.gte("lastHeartbeat", now - QUEUE_STALE_MS))
        .collect()
    ).sort((a, b) => Math.abs(a.elo - user.elo) - Math.abs(b.elo - user.elo));

    for (const entry of candidates) {
      await ctx.db.delete(entry._id);
      const opponent = await ctx.db.get(entry.userId);
      if (!opponent || opponent.deletedAt || (await getActivePlayerFor(ctx, opponent._id))) {
        continue;
      }

      const matchId = await ctx.db.insert("matches", {
        word: pickRandomWord(words),
        status: "active",
        startedAt: now,
      });
      for (const [me, them] of [
        [opponent, user],
        [user, opponent],
      ] as const) {
        const playerId = await ctx.db.insert("matchPlayers", {
          matchId,
          userId: me._id,
          opponentId: them._id,
          guesses: [],
          mistakes: 0,
          lastGuessAt: now,
          active: true,
          eloBefore: me.elo,
          opponentEloBefore: them.elo,
        });
        // A player who never moves runs out of time like any other turn.
        await ctx.db.patch(playerId, {
          timeoutJobId: await scheduleTurnTimeout(ctx, playerId, now),
        });
      }
      return { status: "matched" as const, matchId };
    }

    await ctx.db.insert("matchQueue", {
      userId: user._id,
      elo: user.elo,
      joinedAt: now,
      lastHeartbeat: now,
    });
    return { status: "queued" as const };
  },
});

/** Keeps the caller's queue entry alive while they wait for an opponent. */
export const queueHeartbeat = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await getLoggedInUserHelper(ctx);
    if (!user) return false;
    const entry = await ctx.db
      .query("matchQueue")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .first();
    if (!entry) return false;
    await ctx.db.patch(entry._id, { lastHeartbeat: Date.now() });
    return true;
  },
});

export async function leaveQueue(ctx: MutationCtx, userId: Id<"users">) {
  const entries = await ctx.db
    .query("matchQueue")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  for (const entry of entries) await ctx.db.delete(entry._id);
}

export const exitMatchmaking = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await getLoggedInUserHelper(ctx);
    if (user) await leaveQueue(ctx, user._id);
  },
});

export const queueInfo = query({
  args: {},
  handler: async (ctx) => {
    const user = await getLoggedInUserHelper(ctx);
    if (!user) return { isInQueue: false, queueEntryTime: undefined, playersSearching: 0 };

    const own = await ctx.db
      .query("matchQueue")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .first();
    const live = await ctx.db
      .query("matchQueue")
      .withIndex("by_heartbeat", (q) => q.gte("lastHeartbeat", Date.now() - QUEUE_STALE_MS))
      .collect();

    return {
      isInQueue: !!own,
      queueEntryTime: own?.joinedAt,
      playersSearching: live.filter((e) => e.userId !== user._id).length,
    };
  },
});

/* -------------------------------------------------------------------------- */
/*                                  Gameplay                                  */
/* -------------------------------------------------------------------------- */

/**
 * The signed-in user's match in progress. The opponent's progress is reduced
 * to counts so it can't leak letters of the word.
 */
export const getActiveMatch = query({
  args: {},
  handler: async (ctx) => {
    const user = await getLoggedInUserHelper(ctx);
    if (!user) return null;
    const me = await getActivePlayerFor(ctx, user._id);
    if (!me) return null;
    const match = await ctx.db.get(me.matchId);
    if (!match) return null;
    const them = (await getPlayers(ctx, match._id)).find((p) => p._id !== me._id)!;
    const opponent = await ctx.db.get(them.userId);
    const state = deriveState(match.word, me.guesses);

    return {
      _id: match._id,
      startTime: match.startedAt,
      wordLength: match.word.length,
      displayWord: maskWord(match.word, me.guesses),
      guessedLetters: state.guessedLetters,
      correctGuesses: state.correctGuesses,
      wrongGuesses: state.wrongGuesses,
      attempts: state.attempts,
      mistakes: state.mistakes,
      lastUpdate: me.lastGuessAt,
      deadline: me.lastGuessAt + RANKED_TURN_TIMEOUT_MS,
      revealed: countRevealed(match.word, me.guesses),
      myElo: user.elo,
      opponent: {
        name: displayName(opponent),
        elo: opponent?.elo ?? them.eloBefore,
        image: opponent?.image,
        attempts: them.guesses.length,
        mistakes: them.mistakes,
        revealed: countRevealed(match.word, them.guesses),
        lastUpdate: them.lastGuessAt,
      },
    };
  },
});

export const makeGuess = mutation({
  args: { guess: v.string() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const me = await getActivePlayerFor(ctx, user._id);
    if (!me) throw new ConvexError("No active match found");
    const match = (await ctx.db.get(me.matchId))!;

    let outcome;
    try {
      outcome = applyGuess(deriveState(match.word, me.guesses), args.guess);
    } catch (e) {
      if (e instanceof InvalidGuessError) throw new ConvexError(e.message);
      throw e;
    }

    const now = Date.now();
    await ctx.db.patch(me._id, {
      guesses: outcome.guessedLetters,
      mistakes: outcome.mistakes,
      lastGuessAt: now,
    });

    if (outcome.isCompleted) {
      // Solving wins; running out of lives hands the win to the opponent.
      await finishMatch(
        ctx,
        match._id,
        outcome.isWon ? me.userId : me.opponentId,
        outcome.isWon ? "solved" : "failed",
      );
      return { isCorrect: outcome.isCorrect, isCompleted: true, isWon: outcome.isWon };
    }

    if (me.timeoutJobId) await ctx.scheduler.cancel(me.timeoutJobId);
    await ctx.db.patch(me._id, { timeoutJobId: await scheduleTurnTimeout(ctx, me._id, now) });
    return { isCorrect: outcome.isCorrect, isCompleted: false, isWon: false };
  },
});

/** Resign the current match. The opponent wins. */
export const forfeitMatch = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    await forfeitActiveMatch(ctx, user._id);
  },
});

/** Summary of the signed-in user's most recently finished match. */
export const getLastMatchResult = query({
  args: {},
  handler: async (ctx) => {
    const user = await getLoggedInUserHelper(ctx);
    if (!user) return null;
    const me = await ctx.db
      .query("matchPlayers")
      .withIndex("by_user_active_ended", (q) => q.eq("userId", user._id).eq("active", false))
      .order("desc")
      .first();
    if (!me) return null;
    const [match, opponent] = await Promise.all([ctx.db.get(me.matchId), ctx.db.get(me.opponentId)]);
    if (!match) return null;

    const eloAfter = me.eloAfter ?? me.eloBefore;
    return {
      _id: match._id,
      word: match.word,
      won: me.result === "won",
      endReason: match.endReason,
      endTime: match.endedAt ?? match.startedAt,
      eloChange: eloAfter - me.eloBefore,
      eloAfter,
      guessedLetters: me.guesses,
      attempts: me.guesses.length,
      mistakes: me.mistakes,
      opponentName: displayName(opponent),
    };
  },
});

/* -------------------------------------------------------------------------- */
/*                                   Timers                                   */
/* -------------------------------------------------------------------------- */

/**
 * A player's turn ran out. If neither player ever moved the match is
 * cancelled; otherwise the silent player loses.
 */
export const turnTimeout = internalMutation({
  args: { playerId: v.id("matchPlayers"), lastGuessAt: v.number() },
  handler: async (ctx, { playerId, lastGuessAt }) => {
    const player = await ctx.db.get(playerId);
    if (!player || !player.active || player.lastGuessAt !== lastGuessAt) return;
    const [a, b] = await getPlayers(ctx, player.matchId);
    if (a.guesses.length === 0 && b.guesses.length === 0) {
      await cancelMatch(ctx, player.matchId, playerId);
    } else {
      await finishMatch(ctx, player.matchId, player.opponentId, "timeout", playerId);
    }
  },
});

/** Cron: removes queue entries whose owners stopped heartbeating. */
export const purgeStaleQueue = internalMutation({
  args: {},
  handler: async (ctx) => {
    const stale = await ctx.db
      .query("matchQueue")
      .withIndex("by_heartbeat", (q) => q.lt("lastHeartbeat", Date.now() - QUEUE_STALE_MS))
      .collect();
    for (const entry of stale) await ctx.db.delete(entry._id);
  },
});

/**
 * Cron safety net: resolves matches whose turn timers were lost so no player
 * gets stuck in a match that never ends.
 */
export const sweepExpiredMatches = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const active = await ctx.db
      .query("matches")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .take(200);

    for (const match of active) {
      const players = await getPlayers(ctx, match._id);
      const expired = players.filter(
        (p) => now > p.lastGuessAt + RANKED_TURN_TIMEOUT_MS + SWEEP_GRACE_MS,
      );
      if (expired.length === 0) continue;
      if (players.every((p) => p.guesses.length === 0)) {
        await cancelMatch(ctx, match._id);
        continue;
      }
      // Whoever went quiet first loses.
      const loser = expired.sort((x, y) => x.lastGuessAt - y.lastGuessAt)[0];
      await finishMatch(ctx, match._id, loser.opponentId, "timeout");
    }
  },
});
