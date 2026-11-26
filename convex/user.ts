import { ConvexError, v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import { mutation, query, QueryCtx } from "./_generated/server";
import { getLoggedInUserHelper, isUsernameTaken, requireUser } from "./auth";
import { getRankTier } from "./lib/elo";
import { accuracy, ALPHABET } from "./lib/game";
import {
  avatarUrlFor,
  checkUsername,
  DELETED_USER_NAME,
} from "./lib/username";
import { average, dayKey, isRankedPlayer, streaks, sum } from "./lib/utils";
import { displayName, finishMatch, getActiveMatchFor } from "./ranked";

/* -------------------------------------------------------------------------- */
/*                                   Helpers                                  */
/* -------------------------------------------------------------------------- */

async function getCompletedSoloGames(ctx: QueryCtx, userId: Id<"users">) {
  return await ctx.db
    .query("games")
    .withIndex("by_user_completion", (q) =>
      q.eq("userId", userId).eq("isCompleted", true),
    )
    .collect();
}

/**
 * Every completed ranked match of a user, oldest first, seen from that
 * user's side. Elo after each match is reconstructed backwards from the
 * current rating, which is exact because ratings only change through matches.
 */
export async function getRankedHistory(ctx: QueryCtx, user: Doc<"users">) {
  const [asUser1, asUser2] = await Promise.all([
    ctx.db
      .query("rankedMatches")
      .withIndex("by_user1_completion", (q) =>
        q.eq("userId1", user._id).eq("isCompleted", true),
      )
      .collect(),
    ctx.db
      .query("rankedMatches")
      .withIndex("by_user2_completion", (q) =>
        q.eq("userId2", user._id).eq("isCompleted", true),
      )
      .collect(),
  ]);

  const matches = [...asUser1, ...asUser2].sort(
    (a, b) => (a.endTime ?? a._creationTime) - (b.endTime ?? b._creationTime),
  );

  // Resolve current opponent names so renames show everywhere.
  const opponentIds = [
    ...new Set(
      matches.map((m) => (m.userId1 === user._id ? m.userId2 : m.userId1)),
    ),
  ];
  const opponents = new Map(
    (await Promise.all(opponentIds.map((id) => ctx.db.get(id))))
      .filter((u): u is Doc<"users"> => u !== null)
      .map((u) => [u._id, u] as const),
  );

  const rows = matches.map((match) => {
    const isUser1 = match.userId1 === user._id;
    const opponentId = isUser1 ? match.userId2 : match.userId1;
    const opponent = opponents.get(opponentId) ?? null;
    const won = match.winnerId === user._id;
    const eloChange = isUser1 ? (match.eloChange ?? 0) : -(match.eloChange ?? 0);
    return {
      _id: match._id,
      endTime: match.endTime ?? match._creationTime,
      word: match.word,
      won,
      eloChange,
      eloAfter: 0, // filled in below
      opponent: displayName(opponent, isUser1 ? match.userName2 : match.userName1),
      opponentElo: isUser1 ? match.userElo2 : match.userElo1,
      winner: won
        ? displayName(user, isUser1 ? match.userName1 : match.userName2)
        : displayName(opponent, match.winner ?? "Unknown"),
      attempts: isUser1 ? match.attempts1 : match.attempts2,
      mistakes: isUser1 ? match.mistakes1 : match.mistakes2,
      endReason: match.endReason,
    };
  });

  let elo = user.elo;
  for (let i = rows.length - 1; i >= 0; i--) {
    rows[i].eloAfter = elo;
    elo -= rows[i].eloChange;
  }

  return { rows, startingElo: elo };
}

async function getLeaderboardPosition(ctx: QueryCtx, user: Doc<"users">) {
  if (!isRankedPlayer(user)) return null;

  const [higherElo, sameEloMoreGames, sameEloSameGamesOlder] = await Promise.all([
    ctx.db
      .query("users")
      .withIndex("by_elo", (q) => q.gt("elo", user.elo))
      .filter((q) =>
        q.and(
          q.gt(q.field("userStats.gamesPlayed"), 0),
          q.neq(q.field("status"), "deleted"),
          q.neq(q.field("status"), "banned"),
        ),
      )
      .collect(),
    ctx.db
      .query("users")
      .withIndex("by_elo_games_played", (q) =>
        q.eq("elo", user.elo).gt("userStats.gamesPlayed", user.userStats.gamesPlayed),
      )
      .filter((q) =>
        q.and(q.neq(q.field("status"), "deleted"), q.neq(q.field("status"), "banned")),
      )
      .collect(),
    ctx.db
      .query("users")
      .withIndex("by_elo_games_played", (q) =>
        q
          .eq("elo", user.elo)
          .eq("userStats.gamesPlayed", user.userStats.gamesPlayed)
          .lt("_creationTime", user._creationTime),
      )
      .filter((q) =>
        q.and(q.neq(q.field("status"), "deleted"), q.neq(q.field("status"), "banned")),
      )
      .collect(),
  ]);

  return (
    higherElo.length + sameEloMoreGames.length + sameEloSameGamesOlder.length + 1
  );
}

/* -------------------------------------------------------------------------- */
/*                                Home & solo                                 */
/* -------------------------------------------------------------------------- */

/** Headline numbers for the home page. */
export const getUserStats = query({
  args: {},
  handler: async (ctx) => {
    const user = await getLoggedInUserHelper(ctx);
    if (!user) return null;
    const games = await getCompletedSoloGames(ctx, user._id);
    const totalWins = games.filter((g) => g.isWon).length;
    return {
      totalGames: games.length,
      totalWins,
      winRate: games.length ? totalWins / games.length : 0,
      totalScore: sum(games.map((g) => g.score)),
      bestScore: user.personalScoreRecord ?? 0,
      currentStreak: streaks(games.map((g) => g.isWon)).current,
    };
  },
});

export const getRecentSoloGames = query({
  args: {},
  handler: async (ctx) => {
    const user = await getLoggedInUserHelper(ctx);
    if (!user) return null;
    return await ctx.db
      .query("games")
      .withIndex("by_user_completion", (q) =>
        q.eq("userId", user._id).eq("isCompleted", true),
      )
      .order("desc")
      .take(8);
  },
});

/** Detailed single-player statistics for the stats page. */
export const getSoloStats = query({
  args: { tzOffsetMinutes: v.optional(v.number()) },
  handler: async (ctx, { tzOffsetMinutes = 0 }) => {
    const user = await getLoggedInUserHelper(ctx);
    if (!user) return null;

    const games = await getCompletedSoloGames(ctx, user._id);
    const won = games.filter((g) => g.isWon);
    const streak = streaks(games.map((g) => g.isWon));

    const summarize = (list: Doc<"games">[]) => ({
      score: Math.round(average(list.map((g) => g.score ?? 0))),
      wordLength: Number(average(list.map((g) => g.word.length)).toFixed(1)),
      attempts: Number(average(list.map((g) => g.attempts)).toFixed(1)),
      mistakes: Number(average(list.map((g) => g.mistakes)).toFixed(1)),
      timeMs: Math.round(average(list.map((g) => g.totalTime))),
      accuracy: Math.round(
        average(list.map((g) => accuracy(g.correctGuesses.length, g.attempts))),
      ),
    });

    const winsByDay = new Map<string, number>();
    const activity = new Map<string, { count: number; wins: number }>();
    for (const g of games) {
      const key = dayKey(g.endTime ?? g._creationTime, tzOffsetMinutes);
      const day = activity.get(key) ?? { count: 0, wins: 0 };
      day.count++;
      if (g.isWon) {
        day.wins++;
        winsByDay.set(key, (winsByDay.get(key) ?? 0) + 1);
      }
      activity.set(key, day);
    }

    const letters = ALPHABET.map((letter) => {
      let hits = 0;
      let misses = 0;
      for (const g of games) {
        if (g.correctGuesses.includes(letter)) hits++;
        else if (g.wrongGuesses.includes(letter)) misses++;
      }
      return { letter: letter.toUpperCase(), hits, misses };
    });

    const openerMap = new Map<string, { games: number; wins: number }>();
    for (const g of games) {
      const first = g.guessedLetters[0];
      if (!first) continue;
      const entry = openerMap.get(first) ?? { games: 0, wins: 0 };
      entry.games++;
      if (g.isWon) entry.wins++;
      openerMap.set(first, entry);
    }
    const openers = [...openerMap.entries()]
      .map(([letter, e]) => ({
        letter: letter.toUpperCase(),
        games: e.games,
        wins: e.wins,
        winRate: Math.round((e.wins / e.games) * 100),
      }))
      .sort((a, b) => b.games - a.games || b.winRate - a.winRate)
      .slice(0, 6);

    const mistakeDistribution = Array.from({ length: 6 }, (_, mistakes) => ({
      mistakes,
      games: won.filter((g) => g.mistakes === mistakes).length,
    }));

    const HISTORY_SIZE = 50;
    const offset = Math.max(0, games.length - HISTORY_SIZE);
    const history = games.slice(offset).map((g, i) => ({
      game: offset + i + 1,
      score: g.score ?? 0,
      attempts: g.attempts,
      correct: g.correctGuesses.length,
      wrong: g.wrongGuesses.length,
      accuracy: accuracy(g.correctGuesses.length, g.attempts),
      won: g.isWon,
      word: g.word,
      timeMs: g.totalTime ?? 0,
      date: g.endTime ?? g._creationTime,
    }));

    return {
      summary: {
        totalGames: games.length,
        totalWins: won.length,
        winRate: games.length ? won.length / games.length : 0,
        timePlayedMs: sum(games.map((g) => g.totalTime)),
        currentStreak: streak.current,
        bestStreak: streak.best,
        abandoned: games.filter((g) => g.isAbandoned).length,
      },
      records: {
        bestScore: Math.max(0, ...won.map((g) => g.score ?? 0)),
        fastestWinMs: won.length
          ? Math.min(...won.map((g) => g.totalTime ?? Infinity))
          : null,
        longestWord: won.reduce(
          (longest, g) => (g.word.length > longest.length ? g.word : longest),
          "",
        ),
        fewestMistakes: won.length ? Math.min(...won.map((g) => g.mistakes)) : null,
        flawlessWins: won.filter((g) => g.mistakes === 0).length,
        mostWinsInADay: Math.max(0, ...winsByDay.values()),
      },
      averages: { won: summarize(won), all: summarize(games) },
      charts: {
        history,
        activity: [...activity.entries()].map(([date, d]) => ({ date, ...d })),
        letters,
        openers,
        mistakeDistribution,
      },
    };
  },
});

/* -------------------------------------------------------------------------- */
/*                                   Ranked                                   */
/* -------------------------------------------------------------------------- */

export const getRecentRankedGames = query({
  args: { userId: v.optional(v.id("users")), limit: v.optional(v.number()) },
  handler: async (ctx, { userId, limit = 10 }) => {
    const user = userId ? await ctx.db.get(userId) : await getLoggedInUserHelper(ctx);
    if (!user) return null;
    const { rows } = await getRankedHistory(ctx, user);
    return rows.slice(-limit).reverse();
  },
});

/** Detailed ranked statistics for the signed-in user. */
export const getRankedStats = query({
  args: {},
  handler: async (ctx) => {
    const user = await getLoggedInUserHelper(ctx);
    if (!user) return null;

    const { rows, startingElo } = await getRankedHistory(ctx, user);
    const wins = rows.filter((r) => r.won);
    const streak = streaks(rows.map((r) => r.won));
    const elos = [startingElo, ...rows.map((r) => r.eloAfter)];

    const byOpponent = new Map<string, { games: number; wins: number }>();
    for (const r of rows) {
      const e = byOpponent.get(r.opponent) ?? { games: 0, wins: 0 };
      e.games++;
      if (r.won) e.wins++;
      byOpponent.set(r.opponent, e);
    }

    const count = (pred: (r: (typeof rows)[number]) => boolean) =>
      rows.filter(pred).length;

    return {
      summary: {
        elo: user.elo,
        tier: getRankTier(user.elo),
        position: await getLeaderboardPosition(ctx, user),
        peakElo: Math.max(...elos),
        games: rows.length,
        wins: wins.length,
        losses: rows.length - wins.length,
        winRate: rows.length ? wins.length / rows.length : 0,
        currentStreak: streak.current,
        bestStreak: streak.best,
        avgMistakes: Number(average(rows.map((r) => r.mistakes)).toFixed(1)),
        avgAttempts: Number(average(rows.map((r) => r.attempts)).toFixed(1)),
      },
      outcomes: {
        solved: count((r) => r.won && r.endReason === "solved"),
        opponentFailed: count((r) => r.won && r.endReason === "failed"),
        opponentTimedOut: count(
          (r) => r.won && (r.endReason === "timeout" || r.endReason === "forfeit"),
        ),
        outsolved: count((r) => !r.won && r.endReason === "solved"),
        failed: count((r) => !r.won && r.endReason === "failed"),
        timedOut: count(
          (r) => !r.won && (r.endReason === "timeout" || r.endReason === "forfeit"),
        ),
      },
      eloHistory: [
        { game: 0, elo: startingElo, eloChange: 0, date: user._creationTime },
        ...rows.map((r, i) => ({
          game: i + 1,
          elo: r.eloAfter,
          eloChange: r.eloChange,
          date: r.endTime,
        })),
      ],
      form: rows.slice(-10).map((r) => ({ _id: r._id, won: r.won, opponent: r.opponent })),
      rivals: [...byOpponent.entries()]
        .filter(([name]) => name !== DELETED_USER_NAME)
        .map(([name, e]) => ({ name, ...e }))
        .sort((a, b) => b.games - a.games)
        .slice(0, 5),
    };
  },
});

/* -------------------------------------------------------------------------- */
/*                                   Profile                                  */
/* -------------------------------------------------------------------------- */

export const getUserProfile = query({
  args: { userName: v.string() },
  handler: async (ctx, { userName }) => {
    const lowercaseName = userName.trim().toLowerCase();
    if (!lowercaseName || lowercaseName === DELETED_USER_NAME) return null;

    const user = await ctx.db
      .query("users")
      .withIndex("lowercase_name", (q) => q.eq("lowercaseName", lowercaseName))
      .first();
    if (!user || user.status === "deleted" || user.status === "banned") {
      return null;
    }

    const requestingUser = await getLoggedInUserHelper(ctx);
    const [{ rows, startingElo }, soloGames, position] = await Promise.all([
      getRankedHistory(ctx, user),
      getCompletedSoloGames(ctx, user._id),
      getLeaderboardPosition(ctx, user),
    ]);
    const soloWins = soloGames.filter((g) => g.isWon).length;

    return {
      _id: user._id,
      name: user.name ?? "Unknown",
      image: user.image,
      accountCreated: user._creationTime,
      lastSeen: user.userStats.lastSeen,
      elo: user.elo,
      tier: getRankTier(user.elo),
      rank: position,
      peakElo: Math.max(startingElo, ...rows.map((r) => r.eloAfter)),
      personalScoreRecord: user.personalScoreRecord ?? 0,
      userStats: user.userStats,
      currentStreak: streaks(rows.map((r) => r.won)).current,
      solo: {
        games: soloGames.length,
        wins: soloWins,
        winRate: soloGames.length ? soloWins / soloGames.length : 0,
      },
      eloHistory: [
        { game: 0, elo: startingElo, eloChange: 0, date: user._creationTime },
        ...rows.map((r, i) => ({
          game: i + 1,
          elo: r.eloAfter,
          eloChange: r.eloChange,
          date: r.endTime,
        })),
      ],
      recentGames: rows.slice().reverse(),
      isSelf: requestingUser?._id === user._id,
    };
  },
});

export const renameUser = mutation({
  args: { name: v.string() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const result = checkUsername(args.name);
    if (!result.ok) throw new ConvexError(result.error);

    const name = result.name;
    if (name === user.name) return name;
    const lowercaseName = name.toLowerCase();
    // Changing only the capitalisation of your own name is always allowed.
    if (lowercaseName !== user.lowercaseName && (await isUsernameTaken(ctx, name))) {
      throw new ConvexError("This username is taken");
    }

    const usesGeneratedAvatar =
      !user.image || user.image.startsWith("https://ui-avatars.com/");
    await ctx.db.patch(user._id, {
      name,
      lowercaseName,
      ...(usesGeneratedAvatar ? { image: avatarUrlFor(name) } : {}),
    });

    const queueEntries = await ctx.db
      .query("matchQueue")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    for (const entry of queueEntries) {
      await ctx.db.patch(entry._id, { userName: name });
    }
    return name;
  },
});

export const deleteUserAccount = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);

    // Resolve anything in progress so opponents aren't left hanging.
    const activeMatch = await getActiveMatchFor(ctx, user._id);
    if (activeMatch) {
      await finishMatch(
        ctx,
        activeMatch,
        activeMatch.userId1 === user._id ? 2 : 1,
        "forfeit",
      );
    }

    // Sessions are removed by the client calling signOut() afterwards.
    const accounts = await ctx.db
      .query("authAccounts")
      .withIndex("userIdAndProvider", (q) => q.eq("userId", user._id))
      .collect();
    for (const account of accounts) {
      await ctx.db.delete(account._id);
    }

    // Hide solo games from leaderboards and end any game in progress.
    const soloGames = await ctx.db
      .query("games")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    for (const game of soloGames) {
      if (!game.isCompleted && game.timeoutScheduleId) {
        await ctx.scheduler.cancel(game.timeoutScheduleId);
      }
      await ctx.db.patch(game._id, {
        userStatus: "deleted",
        ...(game.isCompleted
          ? {}
          : { isCompleted: true, isAbandoned: true, timeoutScheduleId: undefined }),
      });
    }

    const queueEntries = await ctx.db
      .query("matchQueue")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    for (const entry of queueEntries) {
      await ctx.db.delete(entry._id);
    }

    // Anonymise the name snapshots stored on ranked matches.
    const [asUser1, asUser2] = await Promise.all([
      ctx.db
        .query("rankedMatches")
        .withIndex("by_user1", (q) => q.eq("userId1", user._id))
        .collect(),
      ctx.db
        .query("rankedMatches")
        .withIndex("by_user2", (q) => q.eq("userId2", user._id))
        .collect(),
    ]);
    for (const match of asUser1) {
      await ctx.db.patch(match._id, {
        userName1: DELETED_USER_NAME,
        winner: match.winnerId === user._id ? DELETED_USER_NAME : match.winner,
      });
    }
    for (const match of asUser2) {
      await ctx.db.patch(match._id, {
        userName2: DELETED_USER_NAME,
        winner: match.winnerId === user._id ? DELETED_USER_NAME : match.winner,
      });
    }

    // Strip personal info but keep the document so match history stays valid.
    await ctx.db.patch(user._id, {
      name: DELETED_USER_NAME,
      lowercaseName: `${DELETED_USER_NAME}-${user._id}`,
      image: undefined,
      email: undefined,
      emailVerificationTime: undefined,
      phone: undefined,
      phoneVerificationTime: undefined,
      status: "deleted",
    });
  },
});
