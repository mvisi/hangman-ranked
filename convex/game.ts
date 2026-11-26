import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { Doc } from "./_generated/dataModel";
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
  InvalidGuessError,
  maskWord,
  pickRandomWord,
  SOLO_TURN_TIMEOUT_MS,
} from "./lib/game";

async function getActiveGameFor(ctx: QueryCtx, user: Doc<"users">) {
  return await ctx.db
    .query("games")
    .withIndex("by_user_completion", (q) =>
      q.eq("userId", user._id).eq("isCompleted", false),
    )
    .first();
}

async function scheduleTimeout(
  ctx: MutationCtx,
  game: Pick<Doc<"games">, "_id" | "timeoutScheduleId">,
  lastUpdate: number,
) {
  if (game.timeoutScheduleId) {
    await ctx.scheduler.cancel(game.timeoutScheduleId);
  }
  return await ctx.scheduler.runAfter(
    SOLO_TURN_TIMEOUT_MS,
    internal.game.timeoutSchedule,
    { gameId: game._id, lastUpdate },
  );
}

/** The signed-in user's game in progress, with the word masked. */
export const getActiveGame = query({
  args: {},
  handler: async (ctx) => {
    const user = await getLoggedInUserHelper(ctx);
    if (!user) return null;
    const game = await getActiveGameFor(ctx, user);
    if (!game) return null;

    return {
      _id: game._id,
      displayWord: maskWord(game.word, game.guessedLetters),
      guessedLetters: game.guessedLetters,
      correctGuesses: game.correctGuesses,
      wrongGuesses: game.wrongGuesses,
      attempts: game.attempts,
      mistakes: game.mistakes,
      startTime: game.startTime,
      lastUpdate: game.lastUpdate,
      deadline: game.lastUpdate + SOLO_TURN_TIMEOUT_MS,
    };
  },
});

/** Summary of the signed-in user's most recently finished game. */
export const getLastGame = query({
  args: {},
  handler: async (ctx) => {
    const user = await getLoggedInUserHelper(ctx);
    if (!user) return null;
    const game = await ctx.db
      .query("games")
      .withIndex("by_user_completion", (q) =>
        q.eq("userId", user._id).eq("isCompleted", true),
      )
      .order("desc")
      .first();
    if (!game) return null;

    return {
      _id: game._id,
      word: game.word,
      guessedLetters: game.guessedLetters,
      isWon: game.isWon,
      isAbandoned: game.isAbandoned,
      score: game.score ?? 0,
      mistakes: game.mistakes,
      attempts: game.attempts,
      totalTime: game.totalTime ?? 0,
      endTime: game.endTime ?? game.lastUpdate,
      isPersonalBest:
        game.isWon && (game.score ?? 0) > 0 && game.score === user.personalScoreRecord,
    };
  },
});

export const createGame = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);

    // Never replace the word of a game in progress: that would let players
    // "reroll" a hard word while keeping their guesses.
    const existing = await getActiveGameFor(ctx, user);
    if (existing) return existing._id;

    const now = Date.now();
    const gameId = await ctx.db.insert("games", {
      userId: user._id,
      word: pickRandomWord(words),
      guessedLetters: [],
      correctGuesses: [],
      wrongGuesses: [],
      attempts: 0,
      mistakes: 0,
      startTime: now,
      lastUpdate: now,
      isAbandoned: false,
      isCompleted: false,
      isWon: false,
      userStatus: "active",
    });
    const timeoutScheduleId = await scheduleTimeout(ctx, { _id: gameId }, now);
    await ctx.db.patch(gameId, { timeoutScheduleId });
    return gameId;
  },
});

export const makeGuess = mutation({
  args: { guess: v.string() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const game = await getActiveGameFor(ctx, user);
    if (!game) {
      throw new ConvexError("No active game found");
    }

    let outcome;
    try {
      outcome = applyGuess(game, args.guess);
    } catch (e) {
      if (e instanceof InvalidGuessError) throw new ConvexError(e.message);
      throw e;
    }

    const now = Date.now();
    const totalTime = now - game.startTime;
    const score = outcome.isWon
      ? calculateScore({
          wordLength: game.word.length,
          attempts: outcome.attempts,
          mistakes: outcome.mistakes,
          timeMs: totalTime,
        })
      : 0;

    let timeoutScheduleId = undefined;
    if (outcome.isCompleted) {
      if (game.timeoutScheduleId) {
        await ctx.scheduler.cancel(game.timeoutScheduleId);
      }
    } else {
      timeoutScheduleId = await scheduleTimeout(ctx, game, now);
    }

    await ctx.db.patch(game._id, {
      guessedLetters: outcome.guessedLetters,
      correctGuesses: outcome.correctGuesses,
      wrongGuesses: outcome.wrongGuesses,
      attempts: outcome.attempts,
      mistakes: outcome.mistakes,
      isCompleted: outcome.isCompleted,
      isWon: outcome.isWon,
      endTime: outcome.isCompleted ? now : undefined,
      totalTime: outcome.isCompleted ? totalTime : undefined,
      lastUpdate: now,
      score,
      timeoutScheduleId,
    });

    if (outcome.isWon && score > (user.personalScoreRecord ?? 0)) {
      await ctx.db.patch(user._id, { personalScoreRecord: score });
    }

    return {
      isCorrect: outcome.isCorrect,
      isCompleted: outcome.isCompleted,
      isWon: outcome.isWon,
      score,
    };
  },
});

/** Give up on the current game. It counts as a loss. */
export const forfeitGame = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const game = await getActiveGameFor(ctx, user);
    if (!game) return;
    if (game.timeoutScheduleId) {
      await ctx.scheduler.cancel(game.timeoutScheduleId);
    }
    const now = Date.now();
    await ctx.db.patch(game._id, {
      isCompleted: true,
      isWon: false,
      score: 0,
      endTime: now,
      totalTime: now - game.startTime,
      lastUpdate: now,
      timeoutScheduleId: undefined,
    });
  },
});

async function abandonGame(ctx: MutationCtx, game: Doc<"games">) {
  const now = Date.now();
  await ctx.db.patch(game._id, {
    isCompleted: true,
    isWon: false,
    isAbandoned: true,
    score: 0,
    endTime: now,
    totalTime: now - game.startTime,
    timeoutScheduleId: undefined,
  });
}

export const timeoutSchedule = internalMutation({
  args: {
    gameId: v.id("games"),
    lastUpdate: v.number(),
  },
  handler: async (ctx, { gameId, lastUpdate }) => {
    const game = await ctx.db.get(gameId);
    if (!game || game.isCompleted) return;
    // The player has guessed since this timeout was scheduled.
    if (game.lastUpdate !== lastUpdate) return;
    await abandonGame(ctx, game);
  },
});

/**
 * Safety net run by a cron: abandons games whose scheduled timeout was lost
 * (for example a deploy that changed function arguments).
 */
export const expireIdleGames = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - SOLO_TURN_TIMEOUT_MS * 2;
    const active = await ctx.db
      .query("games")
      .withIndex("by_completion", (q) => q.eq("isCompleted", false))
      .take(500);
    for (const game of active) {
      if (game.lastUpdate < cutoff) {
        await abandonGame(ctx, game);
      }
    }
  },
});
