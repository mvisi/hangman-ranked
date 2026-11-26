import { v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import { query, QueryCtx } from "./_generated/server";
import { PLACEMENT_MATCHES } from "./lib/elo";
import { displayName, isOnLeaderboard } from "./lib/utils";

const LEADERBOARD_SIZE = 100;
/** How many top games to scan when picking each player's best one. */
const SOLO_SCAN_LIMIT = 2000;

/** Ordering shared by the Elo leaderboard and profile positions. */
export function compareRankedPlayers(a: Doc<"users">, b: Doc<"users">) {
  if (b.elo !== a.elo) return b.elo - a.elo;
  if (b.ranked.games !== a.ranked.games) return b.ranked.games - a.ranked.games;
  return a._creationTime - b._creationTime;
}

/** 1-based position on the Elo leaderboard, or null while in placement. */
export async function leaderboardPosition(ctx: QueryCtx, user: Doc<"users">) {
  if (!isOnLeaderboard(user)) return null;
  const contenders = await ctx.db
    .query("users")
    .withIndex("by_elo", (q) => q.gte("elo", user.elo))
    .filter((q) =>
      q.and(
        q.gte(q.field("ranked.games"), PLACEMENT_MATCHES),
        q.eq(q.field("deletedAt"), undefined),
      ),
    )
    .collect();
  return contenders.filter((other) => compareRankedPlayers(other, user) < 0).length + 1;
}

/**
 * Each player's best solo game. `sort: "score"` ranks by points;
 * `sort: "time"` ranks the fastest wins.
 */
export const getSoloLeaderboard = query({
  args: { sort: v.optional(v.union(v.literal("score"), v.literal("time"))) },
  handler: async (ctx, { sort = "score" }) => {
    const won =
      sort === "time"
        ? ctx.db
            .query("soloGames")
            .withIndex("by_status_duration", (q) => q.eq("status", "won"))
            .order("asc")
        : ctx.db
            .query("soloGames")
            .withIndex("by_status_score", (q) => q.eq("status", "won"))
            .order("desc");
    const games = await won.filter((q) => q.eq(q.field("hidden"), false)).take(SOLO_SCAN_LIMIT);

    const best: Doc<"soloGames">[] = [];
    const seen = new Set<Id<"users">>();
    for (const game of games) {
      if (seen.has(game.userId)) continue;
      seen.add(game.userId);
      best.push(game);
      if (best.length === LEADERBOARD_SIZE) break;
    }

    const users = new Map(
      (await Promise.all(best.map((g) => ctx.db.get(g.userId))))
        .filter((u): u is Doc<"users"> => u !== null)
        .map((u) => [u._id, u] as const),
    );

    return best.map((game, i) => {
      const user = users.get(game.userId);
      return {
        _id: game._id,
        rank: i + 1,
        user: displayName(user),
        image: user?.image,
        score: game.score,
        word: game.word,
        mistakes: game.mistakes,
        attempts: game.guesses.length,
        time: game.durationMs ?? 0,
        playedAt: game.endedAt ?? game.lastGuessAt,
      };
    });
  },
});

export const getEloLeaderboard = query({
  args: {},
  handler: async (ctx) => {
    // Filter inside the query so `take` yields up to 100 placed players.
    const players = await ctx.db
      .query("users")
      .withIndex("by_elo")
      .order("desc")
      .filter((q) =>
        q.and(
          q.gte(q.field("ranked.games"), PLACEMENT_MATCHES),
          q.eq(q.field("deletedAt"), undefined),
        ),
      )
      .take(LEADERBOARD_SIZE);

    return players.sort(compareRankedPlayers).map((player, i) => ({
      _id: player._id,
      rank: i + 1,
      user: displayName(player),
      image: player.image,
      elo: player.elo,
      games: player.ranked.games,
      wins: player.ranked.wins,
      winPct: player.ranked.games ? player.ranked.wins / player.ranked.games : 0,
      lastSeen: player.lastSeenAt,
    }));
  },
});
