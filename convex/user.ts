import { ConvexError, v } from "convex/values";
import { Doc } from "./_generated/dataModel";
import { mutation, query, QueryCtx } from "./_generated/server";
import { getLoggedInUserHelper, isUsernameTaken, requireUser } from "./auth";
import { endActiveGame, summarizeGame } from "./game";
import { leaderboardPosition } from "./leaderboard";
import { getRankTier, PLACEMENT_MATCHES } from "./lib/elo";
import { accuracy, ALPHABET, deriveState } from "./lib/game";
import { avatarUrlFor, checkUsername, DELETED_USER_NAME } from "./lib/username";
import { average, dayKey, displayName, sum } from "./lib/utils";
import { forfeitActiveMatch, leaveQueue } from "./ranked";

/* -------------------------------------------------------------------------- */
/*                                   Helpers                                  */
/* -------------------------------------------------------------------------- */

async function getFinishedSoloGames(ctx: QueryCtx, user: Doc<"users">) {
  const games = await ctx.db
    .query("soloGames")
    .withIndex("by_user", (q) => q.eq("userId", user._id))
    .collect();
  return games.filter((g) => g.status !== "active");
}

/**
 * A user's finished ranked matches, oldest first, from their point of view.
 */
export async function getRankedHistory(ctx: QueryCtx, user: Doc<"users">) {
  const players = await ctx.db
    .query("matchPlayers")
    .withIndex("by_user_active_ended", (q) => q.eq("userId", user._id).eq("active", false))
    .collect();

  const [matches, opponents] = await Promise.all([
    Promise.all(players.map((p) => ctx.db.get(p.matchId))),
    Promise.all([...new Set(players.map((p) => p.opponentId))].map((id) => ctx.db.get(id))),
  ]);
  const opponentById = new Map(
    opponents.filter((u): u is Doc<"users"> => u !== null).map((u) => [u._id, u] as const),
  );

  return players.map((p, i) => {
    const match = matches[i];
    const eloAfter = p.eloAfter ?? p.eloBefore;
    const opponent = displayName(opponentById.get(p.opponentId));
    const won = p.result === "won";
    return {
      _id: p.matchId,
      endTime: p.endedAt ?? p._creationTime,
      word: match?.word ?? "",
      won,
      eloBefore: p.eloBefore,
      eloChange: eloAfter - p.eloBefore,
      eloAfter,
      opponent,
      opponentElo: p.opponentEloBefore,
      winner: won ? displayName(user) : opponent,
      attempts: p.guesses.length,
      mistakes: p.mistakes,
      endReason: match?.endReason,
    };
  });
}

type HistoryRow = Awaited<ReturnType<typeof getRankedHistory>>[number];

function eloHistory(user: Doc<"users">, rows: HistoryRow[]) {
  return [
    { game: 0, elo: rows[0]?.eloBefore ?? user.elo, eloChange: 0, date: user._creationTime },
    ...rows.map((r, i) => ({ game: i + 1, elo: r.eloAfter, eloChange: r.eloChange, date: r.endTime })),
  ];
}

const winRate = (s: { games: number; wins: number }) => (s.games ? s.wins / s.games : 0);

/* -------------------------------------------------------------------------- */
/*                                Home & solo                                 */
/* -------------------------------------------------------------------------- */

/** Headline numbers for the home page, straight from the running totals. */
export const getUserStats = query({
  args: {},
  handler: async (ctx) => {
    const user = await getLoggedInUserHelper(ctx);
    if (!user) return null;
    return {
      totalGames: user.solo.games,
      totalWins: user.solo.wins,
      winRate: winRate(user.solo),
      bestScore: user.solo.bestScore,
      currentStreak: user.solo.streak,
    };
  },
});

export const getRecentSoloGames = query({
  args: {},
  handler: async (ctx) => {
    const user = await getLoggedInUserHelper(ctx);
    if (!user) return null;
    const recent = await ctx.db
      .query("soloGames")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .take(9);
    return recent.filter((g) => g.status !== "active").slice(0, 8).map(summarizeGame);
  },
});

/** Detailed single-player statistics for the stats page. */
export const getSoloStats = query({
  args: { tzOffsetMinutes: v.optional(v.number()) },
  handler: async (ctx, { tzOffsetMinutes = 0 }) => {
    const user = await getLoggedInUserHelper(ctx);
    if (!user) return null;

    const games = (await getFinishedSoloGames(ctx, user)).map((g) => ({
      ...summarizeGame(g),
      ...deriveState(g.word, g.guesses),
      won: g.status === "won",
    }));
    const won = games.filter((g) => g.won);

    const summarize = (list: typeof games) => ({
      score: Math.round(average(list.map((g) => g.score))),
      wordLength: Number(average(list.map((g) => g.word.length)).toFixed(1)),
      attempts: Number(average(list.map((g) => g.attempts)).toFixed(1)),
      mistakes: Number(average(list.map((g) => g.mistakes)).toFixed(1)),
      timeMs: Math.round(average(list.map((g) => g.durationMs))),
      accuracy: Math.round(average(list.map((g) => accuracy(g.correct, g.attempts)))),
    });

    const activity = new Map<string, { count: number; wins: number }>();
    for (const g of games) {
      const key = dayKey(g.endedAt, tzOffsetMinutes);
      const day = activity.get(key) ?? { count: 0, wins: 0 };
      day.count++;
      if (g.won) day.wins++;
      activity.set(key, day);
    }

    const letters = ALPHABET.map((letter) => ({
      letter: letter.toUpperCase(),
      hits: games.filter((g) => g.correctGuesses.includes(letter)).length,
      misses: games.filter((g) => g.wrongGuesses.includes(letter)).length,
    }));

    const openerMap = new Map<string, { games: number; wins: number }>();
    for (const g of games) {
      const first = g.guessedLetters[0];
      if (!first) continue;
      const entry = openerMap.get(first) ?? { games: 0, wins: 0 };
      entry.games++;
      if (g.won) entry.wins++;
      openerMap.set(first, entry);
    }
    const openers = [...openerMap.entries()]
      .map(([letter, e]) => ({
        letter: letter.toUpperCase(),
        ...e,
        winRate: Math.round((e.wins / e.games) * 100),
      }))
      .sort((a, b) => b.games - a.games || b.winRate - a.winRate)
      .slice(0, 6);

    const HISTORY_SIZE = 50;
    const offset = Math.max(0, games.length - HISTORY_SIZE);

    return {
      summary: {
        totalGames: user.solo.games,
        totalWins: user.solo.wins,
        winRate: winRate(user.solo),
        timePlayedMs: sum(games.map((g) => g.durationMs)),
        currentStreak: user.solo.streak,
        bestStreak: user.solo.bestStreak,
        abandoned: games.filter((g) => g.result === "abandoned").length,
      },
      records: {
        bestScore: user.solo.bestScore,
        fastestWinMs: won.length ? Math.min(...won.map((g) => g.durationMs)) : null,
        longestWord: won.reduce((longest, g) => (g.word.length > longest.length ? g.word : longest), ""),
        fewestMistakes: won.length ? Math.min(...won.map((g) => g.mistakes)) : null,
        flawlessWins: won.filter((g) => g.mistakes === 0).length,
        mostWinsInADay: Math.max(0, ...[...activity.values()].map((d) => d.wins)),
      },
      averages: { won: summarize(won), all: summarize(games) },
      charts: {
        history: games.slice(offset).map((g, i) => ({
          game: offset + i + 1,
          score: g.score,
          attempts: g.attempts,
          correct: g.correct,
          wrong: g.mistakes,
          accuracy: accuracy(g.correct, g.attempts),
          won: g.won,
          word: g.word,
          timeMs: g.durationMs,
          date: g.endedAt,
        })),
        activity: [...activity.entries()].map(([date, d]) => ({ date, ...d })),
        letters,
        openers,
        mistakeDistribution: Array.from({ length: 6 }, (_, mistakes) => ({
          mistakes,
          games: won.filter((g) => g.mistakes === mistakes).length,
        })),
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
    return (await getRankedHistory(ctx, user)).slice(-limit).reverse();
  },
});

/** Detailed ranked statistics for the signed-in user. */
export const getRankedStats = query({
  args: {},
  handler: async (ctx) => {
    const user = await getLoggedInUserHelper(ctx);
    if (!user) return null;

    const rows = await getRankedHistory(ctx, user);
    const count = (pred: (r: HistoryRow) => boolean) => rows.filter(pred).length;
    const quit = (r: HistoryRow) => r.endReason === "timeout" || r.endReason === "forfeit";

    const byOpponent = new Map<string, { games: number; wins: number }>();
    for (const r of rows) {
      const e = byOpponent.get(r.opponent) ?? { games: 0, wins: 0 };
      e.games++;
      if (r.won) e.wins++;
      byOpponent.set(r.opponent, e);
    }

    return {
      summary: {
        elo: user.elo,
        tier: getRankTier(user.elo),
        position: await leaderboardPosition(ctx, user),
        placement: { played: user.ranked.games, required: PLACEMENT_MATCHES },
        peakElo: user.peakElo,
        games: user.ranked.games,
        wins: user.ranked.wins,
        losses: user.ranked.games - user.ranked.wins,
        winRate: winRate(user.ranked),
        currentStreak: user.ranked.streak,
        bestStreak: user.ranked.bestStreak,
        avgMistakes: Number(average(rows.map((r) => r.mistakes)).toFixed(1)),
        avgAttempts: Number(average(rows.map((r) => r.attempts)).toFixed(1)),
      },
      outcomes: {
        solved: count((r) => r.won && r.endReason === "solved"),
        opponentFailed: count((r) => r.won && r.endReason === "failed"),
        opponentTimedOut: count((r) => r.won && quit(r)),
        outsolved: count((r) => !r.won && r.endReason === "solved"),
        failed: count((r) => !r.won && r.endReason === "failed"),
        timedOut: count((r) => !r.won && quit(r)),
      },
      eloHistory: eloHistory(user, rows),
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
    if (!lowercaseName) return null;

    const user = await ctx.db
      .query("users")
      .withIndex("by_lowercase_name", (q) => q.eq("lowercaseName", lowercaseName))
      .first();
    if (!user || user.deletedAt) return null;

    const requestingUser = await getLoggedInUserHelper(ctx);
    const [rows, position] = await Promise.all([
      getRankedHistory(ctx, user),
      leaderboardPosition(ctx, user),
    ]);

    return {
      _id: user._id,
      name: displayName(user),
      image: user.image,
      accountCreated: user._creationTime,
      lastSeen: user.lastSeenAt,
      elo: user.elo,
      tier: getRankTier(user.elo),
      rank: position,
      placement: { played: user.ranked.games, required: PLACEMENT_MATCHES },
      peakElo: user.peakElo,
      ranked: { ...user.ranked, winRate: winRate(user.ranked) },
      solo: { ...user.solo, winRate: winRate(user.solo) },
      eloHistory: eloHistory(user, rows),
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

    const usesGeneratedAvatar = !user.image || user.image.startsWith("https://ui-avatars.com/");
    await ctx.db.patch(user._id, {
      name,
      lowercaseName,
      ...(usesGeneratedAvatar ? { image: avatarUrlFor(name) } : {}),
    });
    return name;
  },
});

export const deleteUserAccount = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);

    // Resolve anything in progress so opponents aren't left hanging.
    await forfeitActiveMatch(ctx, user._id);
    await endActiveGame(ctx, user._id);
    await leaveQueue(ctx, user._id);

    // Sessions are removed by the client calling signOut() afterwards.
    const accounts = await ctx.db
      .query("authAccounts")
      .withIndex("userIdAndProvider", (q) => q.eq("userId", user._id))
      .collect();
    for (const account of accounts) await ctx.db.delete(account._id);

    // Hide solo games from leaderboards.
    const games = await ctx.db
      .query("soloGames")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    for (const game of games) await ctx.db.patch(game._id, { hidden: true });

    // Keep the document so opponents' match history stays intact; every read
    // path shows it as "deleted-user".
    await ctx.db.patch(user._id, {
      name: DELETED_USER_NAME,
      lowercaseName: `${DELETED_USER_NAME}-${user._id}`,
      image: undefined,
      email: undefined,
      emailVerificationTime: undefined,
      phone: undefined,
      phoneVerificationTime: undefined,
      deletedAt: Date.now(),
    });
  },
});
