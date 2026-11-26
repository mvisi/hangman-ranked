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
  InvalidGuessError,
  maskWord,
  pickRandomWord,
  RANKED_TURN_TIMEOUT_MS,
} from "./lib/game";
import { DELETED_USER_NAME } from "./lib/username";
import { getUpdatedStats } from "./lib/utils";

/** Clients heartbeat every ~10s; entries silent for longer are ignored. */
export const QUEUE_STALE_MS = 30_000;
/** Extra time the sweeper waits past a deadline before resolving a match. */
const SWEEP_GRACE_MS = 15_000;

type Side = 1 | 2;
type EndReason = NonNullable<Doc<"rankedMatches">["endReason"]>;

const other = (side: Side): Side => (side === 1 ? 2 : 1);

function sideOf(match: Doc<"rankedMatches">, userId: Id<"users">): Side {
  return match.userId1 === userId ? 1 : 2;
}

/** Reads one player's half of a match document. */
function sideState(match: Doc<"rankedMatches">, side: Side) {
  return side === 1
    ? {
        userId: match.userId1,
        userName: match.userName1,
        userElo: match.userElo1,
        guessedLetters: match.guessedLetters1,
        correctGuesses: match.correctGuesses1,
        wrongGuesses: match.wrongGuesses1,
        attempts: match.attempts1,
        mistakes: match.mistakes1,
        lastUpdate: match.lastUpdateFrom1,
        timeoutScheduleId: match.timeoutScheduleIdFor1,
      }
    : {
        userId: match.userId2,
        userName: match.userName2,
        userElo: match.userElo2,
        guessedLetters: match.guessedLetters2,
        correctGuesses: match.correctGuesses2,
        wrongGuesses: match.wrongGuesses2,
        attempts: match.attempts2,
        mistakes: match.mistakes2,
        lastUpdate: match.lastUpdateFrom2,
        timeoutScheduleId: match.timeoutScheduleIdFor2,
      };
}

type SideUpdate = {
  guessedLetters: string[];
  correctGuesses: string[];
  wrongGuesses: string[];
  attempts: number;
  mistakes: number;
  lastUpdate: number;
  timeoutScheduleId: Id<"_scheduled_functions"> | undefined;
};

/** Builds a patch for one player's half of a match document. */
function sidePatch(side: Side, u: SideUpdate): Partial<Doc<"rankedMatches">> {
  return side === 1
    ? {
        guessedLetters1: u.guessedLetters,
        correctGuesses1: u.correctGuesses,
        wrongGuesses1: u.wrongGuesses,
        attempts1: u.attempts,
        mistakes1: u.mistakes,
        lastUpdateFrom1: u.lastUpdate,
        timeoutScheduleIdFor1: u.timeoutScheduleId,
      }
    : {
        guessedLetters2: u.guessedLetters,
        correctGuesses2: u.correctGuesses,
        wrongGuesses2: u.wrongGuesses,
        attempts2: u.attempts,
        mistakes2: u.mistakes,
        lastUpdateFrom2: u.lastUpdate,
        timeoutScheduleIdFor2: u.timeoutScheduleId,
      };
}

/** Current public name of a user, falling back to a snapshot. */
export function displayName(user: Doc<"users"> | null, fallback: string) {
  if (!user) return fallback;
  if (user.status === "deleted") return DELETED_USER_NAME;
  return user.name ?? fallback;
}

export async function getActiveMatchFor(ctx: QueryCtx, userId: Id<"users">) {
  const [asUser1, asUser2] = await Promise.all([
    ctx.db
      .query("rankedMatches")
      .withIndex("by_user1_completion", (q) =>
        q.eq("userId1", userId).eq("isCompleted", false),
      )
      .first(),
    ctx.db
      .query("rankedMatches")
      .withIndex("by_user2_completion", (q) =>
        q.eq("userId2", userId).eq("isCompleted", false),
      )
      .first(),
  ]);
  return asUser1 ?? asUser2;
}

function isQueueEntryStale(entry: Doc<"matchQueue">, now: number) {
  return now - (entry.lastHeartbeat ?? entry._creationTime) > QUEUE_STALE_MS;
}

/**
 * Ends a match: applies Elo and stats to both players, cancels any pending
 * timeouts and records how the match ended. Every completion path goes
 * through here so the bookkeeping can't drift.
 */
export async function finishMatch(
  ctx: MutationCtx,
  match: Doc<"rankedMatches">,
  winnerSide: Side,
  endReason: EndReason,
  extraPatch: Partial<Doc<"rankedMatches">> = {},
  /** Side whose turn timer is the job running this code (it can't cancel itself). */
  runningTimerSide?: Side,
) {
  const [user1, user2] = await Promise.all([
    ctx.db.get(match.userId1),
    ctx.db.get(match.userId2),
  ]);
  // Use live ratings so simultaneous matches can't compute from stale values.
  const elo1 = user1?.elo ?? match.userElo1;
  const elo2 = user2?.elo ?? match.userElo2;
  const eloChange = getEloDelta(elo1, elo2, winnerSide === 1);

  if (user1) {
    await ctx.db.patch(user1._id, {
      elo: elo1 + eloChange,
      userStats: getUpdatedStats(user1, winnerSide === 1),
    });
  }
  if (user2) {
    await ctx.db.patch(user2._id, {
      elo: elo2 - eloChange,
      userStats: getUpdatedStats(user2, winnerSide === 2),
    });
  }

  const timers = [
    runningTimerSide === 1 ? undefined : match.timeoutScheduleIdFor1,
    runningTimerSide === 2 ? undefined : match.timeoutScheduleIdFor2,
  ];
  for (const id of timers) {
    if (id) await ctx.scheduler.cancel(id);
  }

  const winner = winnerSide === 1 ? user1 : user2;
  const now = Date.now();
  await ctx.db.patch(match._id, {
    ...extraPatch,
    isCompleted: true,
    isAbandoned: endReason === "timeout" || endReason === "forfeit",
    endReason,
    endTime: now,
    totalTime: now - match.startTime,
    winnerId: winner?._id ?? (winnerSide === 1 ? match.userId1 : match.userId2),
    winner: displayName(
      winner,
      winnerSide === 1 ? match.userName1 : match.userName2,
    ),
    eloChange,
    // Record the ratings the change was computed from, so
    // `userElo + eloChange` is always the rating after the match.
    userElo1: elo1,
    userElo2: elo2,
    timeoutScheduleIdFor1: undefined,
    timeoutScheduleIdFor2: undefined,
  });
}

/* -------------------------------------------------------------------------- */
/*                                 Matchmaking                                */
/* -------------------------------------------------------------------------- */

export const enterMatchmaking = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    if (await getActiveMatchFor(ctx, user._id)) {
      throw new ConvexError("You are already in a match");
    }

    const now = Date.now();
    const queue = await ctx.db.query("matchQueue").collect();

    const ownEntry = queue.find((entry) => entry.userId === user._id);
    if (ownEntry) {
      await ctx.db.patch(ownEntry._id, { lastHeartbeat: now });
      return { status: "queued" as const };
    }

    // Closest rating first, so matches are as fair as the queue allows.
    const candidates = [];
    for (const entry of queue) {
      if (isQueueEntryStale(entry, now)) {
        await ctx.db.delete(entry._id);
      } else {
        candidates.push(entry);
      }
    }
    candidates.sort(
      (a, b) => Math.abs(a.userElo - user.elo) - Math.abs(b.userElo - user.elo),
    );

    for (const entry of candidates) {
      await ctx.db.delete(entry._id);
      const opponent = await ctx.db.get(entry.userId);
      if (
        !opponent ||
        opponent.status === "deleted" ||
        (await getActiveMatchFor(ctx, opponent._id))
      ) {
        continue;
      }

      const matchId = await ctx.db.insert("rankedMatches", {
        userId1: opponent._id,
        userId2: user._id,
        userName1: opponent.name ?? "Unknown",
        userName2: user.name ?? "Unknown",
        userElo1: opponent.elo,
        userElo2: user.elo,
        word: pickRandomWord(words),
        guessedLetters1: [],
        guessedLetters2: [],
        correctGuesses1: [],
        correctGuesses2: [],
        wrongGuesses1: [],
        wrongGuesses2: [],
        attempts1: 0,
        attempts2: 0,
        mistakes1: 0,
        mistakes2: 0,
        startTime: now,
        lastUpdateFrom1: now,
        lastUpdateFrom2: now,
        isCompleted: false,
        isAbandoned: false,
      });

      // If a player never makes a move, they lose (or the match is dropped
      // when nobody moved at all).
      await ctx.scheduler.runAfter(
        RANKED_TURN_TIMEOUT_MS,
        internal.ranked.timeoutStaleDelete,
        { matchId, lastUpdate: now },
      );
      return { status: "matched" as const, matchId };
    }

    await ctx.db.insert("matchQueue", {
      userId: user._id,
      userName: user.name ?? "Unknown",
      userElo: user.elo,
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

export const exitMatchmaking = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await getLoggedInUserHelper(ctx);
    if (!user) return;
    const entries = await ctx.db
      .query("matchQueue")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    for (const entry of entries) {
      await ctx.db.delete(entry._id);
    }
  },
});

export const queueInfo = query({
  args: {},
  handler: async (ctx) => {
    const user = await getLoggedInUserHelper(ctx);
    if (!user) {
      return { isInQueue: false, queueEntryTime: undefined, playersSearching: 0 };
    }
    const now = Date.now();
    const queue = await ctx.db.query("matchQueue").collect();
    const own = queue.find((entry) => entry.userId === user._id);
    const playersSearching = queue.filter(
      (entry) => entry.userId !== user._id && !isQueueEntryStale(entry, now),
    ).length;

    return {
      isInQueue: !!own,
      queueEntryTime: own?._creationTime,
      playersSearching,
    };
  },
});

/* -------------------------------------------------------------------------- */
/*                                  Gameplay                                  */
/* -------------------------------------------------------------------------- */

/**
 * The signed-in user's match in progress. Only the player's own guesses are
 * returned: the opponent's progress is reduced to counts so it can't leak
 * letters of the word.
 */
export const getActiveMatch = query({
  args: {},
  handler: async (ctx) => {
    const user = await getLoggedInUserHelper(ctx);
    if (!user) return null;
    const match = await getActiveMatchFor(ctx, user._id);
    if (!match) return null;

    const mySide = sideOf(match, user._id);
    const me = sideState(match, mySide);
    const them = sideState(match, other(mySide));
    const opponent = await ctx.db.get(them.userId);

    return {
      _id: match._id,
      startTime: match.startTime,
      wordLength: match.word.length,
      displayWord: maskWord(match.word, me.guessedLetters),
      guessedLetters: me.guessedLetters,
      correctGuesses: me.correctGuesses,
      wrongGuesses: me.wrongGuesses,
      attempts: me.attempts,
      mistakes: me.mistakes,
      lastUpdate: me.lastUpdate,
      deadline: me.lastUpdate + RANKED_TURN_TIMEOUT_MS,
      revealed: countRevealed(match.word, me.guessedLetters),
      myElo: user.elo,
      opponent: {
        name: displayName(opponent, them.userName),
        elo: opponent?.elo ?? them.userElo,
        image: opponent?.image,
        attempts: them.attempts,
        mistakes: them.mistakes,
        revealed: countRevealed(match.word, them.guessedLetters),
        lastUpdate: them.lastUpdate,
      },
    };
  },
});

export const makeGuess = mutation({
  args: { guess: v.string() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const match = await getActiveMatchFor(ctx, user._id);
    if (!match) {
      throw new ConvexError("No active match found");
    }

    const side = sideOf(match, user._id);
    const me = sideState(match, side);

    let outcome;
    try {
      outcome = applyGuess({ word: match.word, ...me }, args.guess);
    } catch (e) {
      if (e instanceof InvalidGuessError) throw new ConvexError(e.message);
      throw e;
    }

    const now = Date.now();
    const update: SideUpdate = {
      guessedLetters: outcome.guessedLetters,
      correctGuesses: outcome.correctGuesses,
      wrongGuesses: outcome.wrongGuesses,
      attempts: outcome.attempts,
      mistakes: outcome.mistakes,
      lastUpdate: now,
      timeoutScheduleId: undefined,
    };

    if (outcome.isCompleted) {
      // Solving the word wins; running out of lives hands the win over.
      await finishMatch(
        ctx,
        match,
        outcome.isWon ? side : other(side),
        outcome.isWon ? "solved" : "failed",
        sidePatch(side, update),
      );
      return { isCorrect: outcome.isCorrect, isCompleted: true, isWon: outcome.isWon };
    }

    if (me.timeoutScheduleId) {
      await ctx.scheduler.cancel(me.timeoutScheduleId);
    }
    update.timeoutScheduleId = await ctx.scheduler.runAfter(
      RANKED_TURN_TIMEOUT_MS,
      internal.ranked.timeoutSchedule,
      { gameId: match._id, lastUpdate: now, userId: user._id },
    );
    await ctx.db.patch(match._id, sidePatch(side, update));
    return { isCorrect: outcome.isCorrect, isCompleted: false, isWon: false };
  },
});

/** Resign the current match. The opponent wins. */
export const forfeitMatch = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const match = await getActiveMatchFor(ctx, user._id);
    if (!match) return;
    await finishMatch(ctx, match, other(sideOf(match, user._id)), "forfeit");
  },
});

/** Summary of the signed-in user's most recently finished match. */
export const getLastMatchResult = query({
  args: {},
  handler: async (ctx) => {
    const user = await getLoggedInUserHelper(ctx);
    if (!user) return null;

    const [asUser1, asUser2] = await Promise.all([
      ctx.db
        .query("rankedMatches")
        .withIndex("by_user1_completion", (q) =>
          q.eq("userId1", user._id).eq("isCompleted", true),
        )
        .order("desc")
        .first(),
      ctx.db
        .query("rankedMatches")
        .withIndex("by_user2_completion", (q) =>
          q.eq("userId2", user._id).eq("isCompleted", true),
        )
        .order("desc")
        .first(),
    ]);
    const match =
      asUser1 && asUser2
        ? (asUser1.endTime ?? 0) > (asUser2.endTime ?? 0)
          ? asUser1
          : asUser2
        : (asUser1 ?? asUser2);
    if (!match) return null;

    const side = sideOf(match, user._id);
    const me = sideState(match, side);
    const them = sideState(match, other(side));
    const opponent = await ctx.db.get(them.userId);
    const eloChange =
      side === 1 ? (match.eloChange ?? 0) : -(match.eloChange ?? 0);

    return {
      _id: match._id,
      word: match.word,
      won: match.winnerId === user._id,
      endReason: match.endReason,
      endTime: match.endTime ?? match._creationTime,
      eloChange,
      eloAfter: me.userElo + eloChange,
      guessedLetters: me.guessedLetters,
      attempts: me.attempts,
      mistakes: me.mistakes,
      opponentName: displayName(opponent, them.userName),
    };
  },
});

/* -------------------------------------------------------------------------- */
/*                              Scheduled cleanup                             */
/* -------------------------------------------------------------------------- */

export const timeoutSchedule = internalMutation({
  args: {
    gameId: v.id("rankedMatches"),
    lastUpdate: v.number(),
    userId: v.id("users"),
    // Legacy arguments from older deployments; no longer needed.
    isUser1: v.optional(v.boolean()),
    opponentId: v.optional(v.id("users")),
    opponentName: v.optional(v.string()),
  },
  handler: async (ctx, { gameId, lastUpdate, userId }) => {
    const match = await ctx.db.get(gameId);
    if (!match || match.isCompleted) return;
    const side = sideOf(match, userId);
    // The player has moved since this timeout was scheduled.
    if (sideState(match, side).lastUpdate !== lastUpdate) return;
    await finishMatch(ctx, match, other(side), "timeout", {}, side);
  },
});

/**
 * Runs one turn-length after a match starts: drops the match if nobody moved,
 * or times out the player who never made a move.
 */
export const timeoutStaleDelete = internalMutation({
  args: {
    matchId: v.id("rankedMatches"),
    // Kept for compatibility with already-scheduled jobs; idleness is now
    // judged by move count, which can't collide with the start timestamp.
    lastUpdate: v.number(),
  },
  handler: async (ctx, { matchId }) => {
    const match = await ctx.db.get(matchId);
    if (!match || match.isCompleted) return;

    const idle1 = match.attempts1 === 0;
    const idle2 = match.attempts2 === 0;

    if (idle1 && idle2) {
      await ctx.db.delete(matchId);
    } else if (idle1 !== idle2) {
      // Exactly one player never moved: they lose.
      await finishMatch(ctx, match, idle1 ? 2 : 1, "timeout");
    }
    // Both moved: each has their own turn timeout scheduled.
  },
});

/** Cron: removes queue entries whose owners stopped heartbeating. */
export const purgeStaleQueue = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const queue = await ctx.db.query("matchQueue").collect();
    for (const entry of queue) {
      if (isQueueEntryStale(entry, now)) {
        await ctx.db.delete(entry._id);
      }
    }
  },
});

/**
 * Cron safety net: resolves matches whose scheduled timeouts were lost so no
 * player gets stuck in a match that never ends.
 */
export const resolveExpiredMatches = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const active = await ctx.db
      .query("rankedMatches")
      .withIndex("by_completion", (q) => q.eq("isCompleted", false))
      .take(200);

    for (const match of active) {
      const expired = (lastUpdate: number) =>
        now > lastUpdate + RANKED_TURN_TIMEOUT_MS + SWEEP_GRACE_MS;
      const expired1 = expired(match.lastUpdateFrom1);
      const expired2 = expired(match.lastUpdateFrom2);
      if (!expired1 && !expired2) continue;

      const nobodyMoved = match.attempts1 === 0 && match.attempts2 === 0;
      if (nobodyMoved) {
        await ctx.db.delete(match._id);
        continue;
      }
      // Whoever went quiet first loses.
      const loser: Side =
        expired1 && expired2
          ? match.lastUpdateFrom1 <= match.lastUpdateFrom2
            ? 1
            : 2
          : expired1
            ? 1
            : 2;
      await finishMatch(ctx, match, other(loser), "timeout");
    }
  },
});
