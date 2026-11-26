import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const soloStatus = v.union(
  v.literal("active"),
  v.literal("won"),
  v.literal("lost"),
  v.literal("abandoned"),
  v.literal("forfeit"),
);

export const matchEndReason = v.union(
  v.literal("solved"), // the winner revealed the word
  v.literal("failed"), // the loser ran out of lives
  v.literal("timeout"), // the loser ran out of time
  v.literal("forfeit"), // the loser resigned (or deleted their account)
);

const streakStats = {
  games: v.number(),
  wins: v.number(),
  streak: v.number(),
  bestStreak: v.number(),
};

export default defineSchema({
  ...authTables,

  /**
   * Players. Auth fields (email, image…) are managed by Convex Auth; the rest
   * are running totals updated whenever a game or match finishes, so profile
   * and leaderboard reads never have to scan history.
   */
  users: defineTable({
    // Convex Auth fields
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.number()),
    isAnonymous: v.optional(v.boolean()),

    lowercaseName: v.string(),
    elo: v.number(),
    peakElo: v.number(),
    ranked: v.object(streakStats),
    solo: v.object({ ...streakStats, bestScore: v.number() }),
    lastSeenAt: v.number(),
    deletedAt: v.optional(v.number()),
  })
    .index("email", ["email"])
    .index("phone", ["phone"])
    .index("by_lowercase_name", ["lowercaseName"])
    .index("by_elo", ["elo"]),

  soloGames: defineTable({
    userId: v.id("users"),
    word: v.string(),
    /** Every guess in order; correct/wrong are derived from the word. */
    guesses: v.array(v.string()),
    mistakes: v.number(),
    status: soloStatus,
    startedAt: v.number(),
    lastGuessAt: v.number(),
    endedAt: v.optional(v.number()),
    durationMs: v.optional(v.number()),
    score: v.number(),
    timeoutJobId: v.optional(v.id("_scheduled_functions")),
    /** Set when the owner deletes their account; hides it from leaderboards. */
    hidden: v.boolean(),
  })
    .index("by_user_status", ["userId", "status"])
    .index("by_user", ["userId"])
    .index("by_status_last_guess", ["status", "lastGuessAt"])
    .index("by_status_score", ["status", "score"])
    .index("by_status_duration", ["status", "durationMs"]),

  /** One row per ranked match; per-player state lives in `matchPlayers`. */
  matches: defineTable({
    word: v.string(),
    status: v.union(v.literal("active"), v.literal("finished")),
    startedAt: v.number(),
    endedAt: v.optional(v.number()),
    winnerId: v.optional(v.id("users")),
    endReason: v.optional(matchEndReason),
  }).index("by_status", ["status"]),

  matchPlayers: defineTable({
    matchId: v.id("matches"),
    userId: v.id("users"),
    opponentId: v.id("users"),
    guesses: v.array(v.string()),
    mistakes: v.number(),
    lastGuessAt: v.number(),
    /** The player's turn timer; firing it means they ran out of time. */
    timeoutJobId: v.optional(v.id("_scheduled_functions")),
    active: v.boolean(),
    /** Ratings the Elo change is computed from (refreshed at match end). */
    eloBefore: v.number(),
    opponentEloBefore: v.number(),
    // Set when the match finishes
    result: v.optional(v.union(v.literal("won"), v.literal("lost"))),
    eloAfter: v.optional(v.number()),
    endedAt: v.optional(v.number()),
  })
    .index("by_match", ["matchId"])
    .index("by_user_active_ended", ["userId", "active", "endedAt"]),

  matchQueue: defineTable({
    userId: v.id("users"),
    elo: v.number(),
    joinedAt: v.number(),
    /** Clients ping while waiting; silent entries are skipped and purged. */
    lastHeartbeat: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_heartbeat", ["lastHeartbeat"]),
});
