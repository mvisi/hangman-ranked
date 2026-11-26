import { v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import { query, QueryCtx } from "./_generated/server";
import { displayName } from "./ranked";
import { isRankedPlayer } from "./lib/utils";

const LEADERBOARD_SIZE = 100;

async function getUsersById(ctx: QueryCtx, ids: Id<"users">[]) {
  const unique = [...new Set(ids)];
  const users = await Promise.all(unique.map((id) => ctx.db.get(id)));
  return new Map(
    users
      .filter((u): u is Doc<"users"> => u !== null)
      .map((u) => [u._id, u] as const),
  );
}

/**
 * Best solo games. `sort: "score"` ranks by points; `sort: "time"` ranks the
 * fastest wins.
 */
export const getSoloLeaderboard = query({
  args: { sort: v.optional(v.union(v.literal("score"), v.literal("time"))) },
  handler: async (ctx, { sort = "score" }) => {
    const visible = (game: Doc<"games">) =>
      game.userStatus !== "deleted" && game.userStatus !== "banned";

    const topGames =
      sort === "time"
        ? await ctx.db
            .query("games")
            .withIndex("total_time", (q) => q.gt("totalTime", 0))
            .filter((q) =>
              q.and(
                q.eq(q.field("isWon"), true),
                q.neq(q.field("userStatus"), "deleted"),
                q.neq(q.field("userStatus"), "banned"),
              ),
            )
            .order("asc")
            .take(LEADERBOARD_SIZE)
        : await ctx.db
            .query("games")
            .withIndex("score", (q) => q.gte("score", 1))
            .filter((q) =>
              q.and(
                q.neq(q.field("userStatus"), "deleted"),
                q.neq(q.field("userStatus"), "banned"),
              ),
            )
            .order("desc")
            .take(LEADERBOARD_SIZE);

    const users = await getUsersById(
      ctx,
      topGames.map((g) => g.userId),
    );

    return topGames
      .filter((game) => visible(game) && users.get(game.userId)?.status !== "deleted")
      .map((game, i) => ({
        _id: game._id,
        rank: i + 1,
        user: displayName(users.get(game.userId) ?? null, "Unknown"),
        image: users.get(game.userId)?.image,
        score: game.score ?? 0,
        word: game.word,
        mistakes: game.mistakes,
        attempts: game.attempts,
        time: game.totalTime ?? (game.endTime ?? game.lastUpdate) - game.startTime,
        playedAt: game.endTime ?? game._creationTime,
      }));
  },
});

/** Ordering used by both the Elo leaderboard and profile ranks. */
export function compareRankedPlayers(a: Doc<"users">, b: Doc<"users">) {
  if (b.elo !== a.elo) return b.elo - a.elo;
  const gamesA = a.userStats?.gamesPlayed ?? 0;
  const gamesB = b.userStats?.gamesPlayed ?? 0;
  if (gamesB !== gamesA) return gamesB - gamesA;
  return a._creationTime - b._creationTime;
}

export const getEloLeaderboard = query({
  args: {},
  handler: async (ctx) => {
    // Filter inside the query so `take` always yields up to 100 real players,
    // not 100 rows of which most have never played ranked.
    const players = await ctx.db
      .query("users")
      .withIndex("by_elo")
      .order("desc")
      .filter((q) =>
        q.and(
          q.gt(q.field("userStats.gamesPlayed"), 0),
          q.neq(q.field("status"), "deleted"),
          q.neq(q.field("status"), "banned"),
        ),
      )
      .take(LEADERBOARD_SIZE);

    return players
      .filter(isRankedPlayer)
      .sort(compareRankedPlayers)
      .map((player, i) => ({
        _id: player._id,
        rank: i + 1,
        user: player.name ?? "Unknown",
        image: player.image,
        elo: player.elo,
        games: player.userStats.gamesPlayed,
        wins: player.userStats.wins,
        winPct: player.userStats.winRate,
        lastSeen: player.userStats.lastSeen,
      }));
  },
});
