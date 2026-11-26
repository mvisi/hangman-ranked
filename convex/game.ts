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
import {
  applyGuess,
  calculateScore,
  deriveState,
  InvalidGuessError,
  maskWord,
  pickRandomWord,
  SOLO_TURN_TIMEOUT_MS,
} from "./lib/game";
import { bumpStats } from "./lib/utils";

type FinishedStatus = Exclude<Doc<"soloGames">["status"], "active">;

async function getActiveGameFor(ctx: QueryCtx, userId: Id<"users">) {
  return await ctx.db
    .query("soloGames")
    .withIndex("by_user_status", (q) => q.eq("userId", userId).eq("status", "active"))
    .first();
}

/** Public, word-safe view of a finished game. */
export function summarizeGame(game: Doc<"soloGames">) {
  const state = deriveState(game.word, game.guesses);
  return {
    _id: game._id,
    word: game.word,
    result: game.status as FinishedStatus,
    guessedLetters: game.guesses,
    score: game.score,
    attempts: state.attempts,
    mistakes: state.mistakes,
    correct: state.correctGuesses.length,
    durationMs: game.durationMs ?? 0,
    endedAt: game.endedAt ?? game.lastGuessAt,
  };
}

/**
 * Ends a solo game and folds the result into the player's running totals.
 * Pass `fromTimer` when called by the game's own timer, which can't cancel
 * itself.
 */
async function finishGame(
  ctx: MutationCtx,
  game: Doc<"soloGames">,
  status: FinishedStatus,
  patch: Partial<Doc<"soloGames">> = {},
  fromTimer = false,
) {
  if (game.timeoutJobId && !fromTimer) {
    await ctx.scheduler.cancel(game.timeoutJobId);
  }
  const now = patch.lastGuessAt ?? Date.now();
  const score = patch.score ?? 0;
  await ctx.db.patch(game._id, {
    ...patch,
    status,
    score,
    endedAt: now,
    durationMs: Math.max(0, now - game.startedAt),
    timeoutJobId: undefined,
  });

  const user = await ctx.db.get(game.userId);
  if (user && !user.deletedAt) {
    const solo = bumpStats(user.solo, status === "won");
    await ctx.db.patch(user._id, {
      solo: { ...solo, bestScore: Math.max(user.solo.bestScore, score) },
      lastSeenAt: now,
    });
  }
}

/** The signed-in user's game in progress, with the word masked. */
export const getActiveGame = query({
  args: {},
  handler: async (ctx) => {
    const user = await getLoggedInUserHelper(ctx);
    if (!user) return null;
    const game = await getActiveGameFor(ctx, user._id);
    if (!game) return null;

    const state = deriveState(game.word, game.guesses);
    return {
      _id: game._id,
      displayWord: maskWord(game.word, game.guesses),
      guessedLetters: state.guessedLetters,
      correctGuesses: state.correctGuesses,
      wrongGuesses: state.wrongGuesses,
      attempts: state.attempts,
      mistakes: state.mistakes,
      startTime: game.startedAt,
      lastUpdate: game.lastGuessAt,
      deadline: game.lastGuessAt + SOLO_TURN_TIMEOUT_MS,
    };
  },
});

/** Summary of the signed-in user's most recently finished game. */
export const getLastGame = query({
  args: {},
  handler: async (ctx) => {
    const user = await getLoggedInUserHelper(ctx);
    if (!user) return null;
    const recent = await ctx.db
      .query("soloGames")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .take(2);
    const game = recent.find((g) => g.status !== "active");
    if (!game) return null;
    return {
      ...summarizeGame(game),
      isPersonalBest: game.status === "won" && game.score >= user.solo.bestScore,
    };
  },
});

export const createGame = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);

    // Never replace the word of a game in progress: that would let players
    // "reroll" a hard word while keeping their guesses.
    const existing = await getActiveGameFor(ctx, user._id);
    if (existing) return existing._id;

    const now = Date.now();
    const gameId = await ctx.db.insert("soloGames", {
      userId: user._id,
      word: pickRandomWord(words),
      guesses: [],
      mistakes: 0,
      status: "active",
      startedAt: now,
      lastGuessAt: now,
      score: 0,
      hidden: false,
    });
    const timeoutJobId = await ctx.scheduler.runAfter(
      SOLO_TURN_TIMEOUT_MS,
      internal.game.turnTimeout,
      { gameId, lastGuessAt: now },
    );
    await ctx.db.patch(gameId, { timeoutJobId });
    return gameId;
  },
});

export const makeGuess = mutation({
  args: { guess: v.string() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const game = await getActiveGameFor(ctx, user._id);
    if (!game) throw new ConvexError("No active game found");

    let outcome;
    try {
      outcome = applyGuess(deriveState(game.word, game.guesses), args.guess);
    } catch (e) {
      if (e instanceof InvalidGuessError) throw new ConvexError(e.message);
      throw e;
    }

    const now = Date.now();
    const progress = {
      guesses: outcome.guessedLetters,
      mistakes: outcome.mistakes,
      lastGuessAt: now,
    };

    if (outcome.isCompleted) {
      const score = outcome.isWon
        ? calculateScore({
            wordLength: game.word.length,
            attempts: outcome.attempts,
            mistakes: outcome.mistakes,
            timeMs: now - game.startedAt,
          })
        : 0;
      await finishGame(ctx, game, outcome.isWon ? "won" : "lost", { ...progress, score });
      return { isCorrect: outcome.isCorrect, isCompleted: true, isWon: outcome.isWon, score };
    }

    if (game.timeoutJobId) await ctx.scheduler.cancel(game.timeoutJobId);
    const timeoutJobId = await ctx.scheduler.runAfter(
      SOLO_TURN_TIMEOUT_MS,
      internal.game.turnTimeout,
      { gameId: game._id, lastGuessAt: now },
    );
    await ctx.db.patch(game._id, { ...progress, timeoutJobId });
    return { isCorrect: outcome.isCorrect, isCompleted: false, isWon: false, score: 0 };
  },
});

/** Give up on the current game. It counts as a loss. */
export const forfeitGame = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const game = await getActiveGameFor(ctx, user._id);
    if (game) await finishGame(ctx, game, "forfeit");
  },
});

/** Fires when a player hasn't guessed for a full turn. */
export const turnTimeout = internalMutation({
  args: { gameId: v.id("soloGames"), lastGuessAt: v.number() },
  handler: async (ctx, { gameId, lastGuessAt }) => {
    const game = await ctx.db.get(gameId);
    if (!game || game.status !== "active" || game.lastGuessAt !== lastGuessAt) return;
    await finishGame(ctx, game, "abandoned", {}, true);
  },
});

/** Cron safety net: abandons games whose timer was lost. */
export const sweepIdleGames = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - SOLO_TURN_TIMEOUT_MS * 2;
    const stale = await ctx.db
      .query("soloGames")
      .withIndex("by_status_last_guess", (q) =>
        q.eq("status", "active").lt("lastGuessAt", cutoff),
      )
      .take(200);
    for (const game of stale) {
      await finishGame(ctx, game, "abandoned");
    }
  },
});

/** Ends a user's game in progress (used when deleting an account). */
export async function endActiveGame(ctx: MutationCtx, userId: Id<"users">) {
  const game = await getActiveGameFor(ctx, userId);
  if (game) await finishGame(ctx, game, "forfeit");
}
