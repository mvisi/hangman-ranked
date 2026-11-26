import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { PLACEMENT_MATCHES } from "./lib/elo";
import { RANKED_TURN_TIMEOUT_MS, uniqueLetters } from "./lib/game";
import { QUEUE_STALE_MS } from "./ranked";
import { as, createUser, setup, T } from "./test.helpers";

async function getMatch(t: T) {
  const matches = await t.run((ctx) => ctx.db.query("matches").collect());
  return matches[matches.length - 1];
}

async function getMatchPlayers(t: T, matchId: Id<"matches">) {
  return await t.run((ctx) =>
    ctx.db
      .query("matchPlayers")
      .withIndex("by_match", (q) => q.eq("matchId", matchId))
      .collect(),
  );
}

async function startMatch(t: T, eloA = 1000, eloB = 1000) {
  const a = await createUser(t, "alice", eloA);
  const b = await createUser(t, "bob", eloB);
  expect(await as(t, a).mutation(api.ranked.enterMatchmaking, {})).toEqual({ status: "queued" });
  const res = await as(t, b).mutation(api.ranked.enterMatchmaking, {});
  expect(res.status).toBe("matched");
  return { a, b, match: await getMatch(t) };
}

/** Plays every letter of the word for `userId`. */
async function solve(t: T, userId: Id<"users">, word: string) {
  for (const letter of uniqueLetters(word)) {
    await as(t, userId).mutation(api.ranked.makeGuess, { guess: letter });
  }
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("matchmaking", () => {
  it("pairs the closest-rated player in the queue", async () => {
    const t = setup();
    const far = await createUser(t, "far", 1600);
    const near = await createUser(t, "near", 1040);
    const me = await createUser(t, "me", 1000);
    // Seed the queue directly: queuing them one by one would pair them up.
    await t.run(async (ctx) => {
      const now = Date.now();
      for (const [userId, elo] of [
        [far, 1600],
        [near, 1040],
      ] as const) {
        await ctx.db.insert("matchQueue", {
          userId,
          elo,
          joinedAt: now,
          lastHeartbeat: now,
        });
      }
    });

    const res = await as(t, me).mutation(api.ranked.enterMatchmaking, {});
    expect(res.status).toBe("matched");
    const match = await getMatch(t);
    const players = await getMatchPlayers(t, match._id);
    expect(players.map((p) => p.userId).sort()).toEqual([near, me].sort());

    const queue = await t.run((ctx) => ctx.db.query("matchQueue").collect());
    expect(queue.map((q) => q.userId)).toEqual([far]);
  });

  it("ignores players who stopped heartbeating and purges stale entries", async () => {
    const t = setup();
    const ghost = await createUser(t, "ghost");
    const me = await createUser(t, "me");
    await as(t, ghost).mutation(api.ranked.enterMatchmaking, {});
    vi.advanceTimersByTime(QUEUE_STALE_MS + 10_000);

    const res = await as(t, me).mutation(api.ranked.enterMatchmaking, {});
    expect(res.status).toBe("queued");

    await t.mutation(internal.ranked.purgeStaleQueue, {});
    const queue = await t.run((ctx) => ctx.db.query("matchQueue").collect());
    expect(queue.map((q) => q.userId)).toEqual([me]);
  });

  it("refuses to queue a player who is already in a match", async () => {
    const t = setup();
    const { a } = await startMatch(t);
    await expect(as(t, a).mutation(api.ranked.enterMatchmaking, {})).rejects.toThrow(
      /already in a match/,
    );
  });
});

describe("matches", () => {
  it("never reveals the opponent's letters", async () => {
    const t = setup();
    const { a, b, match } = await startMatch(t);
    const letter = match.word[0];
    await as(t, a).mutation(api.ranked.makeGuess, { guess: letter });

    const view = await as(t, b).query(api.ranked.getActiveMatch, {});
    expect(view?.guessedLetters).toEqual([]);
    expect(view?.opponent.attempts).toBe(1);
    expect(view?.opponent.revealed).toBeGreaterThan(0);
    expect(JSON.stringify(view)).not.toContain(match.word);
  });

  it("awards the solver and applies zero-sum Elo", async () => {
    const t = setup();
    const { a, b, match } = await startMatch(t);
    await solve(t, a, match.word);

    const finished = await t.run((ctx) => ctx.db.get(match._id));
    expect(finished?.status).toBe("finished");
    expect(finished?.winnerId).toBe(a);
    expect(finished?.endReason).toBe("solved");

    const [alice, bob] = await t.run((ctx) => Promise.all([ctx.db.get(a), ctx.db.get(b)]));
    expect(alice!.elo - 1000).toBe(16);
    expect(bob!.elo - 1000).toBe(-16);
    expect(alice!.peakElo).toBe(1016);
    expect(alice!.ranked).toMatchObject({ games: 1, wins: 1, streak: 1, bestStreak: 1 });
    expect(bob!.ranked).toMatchObject({ games: 1, wins: 0, streak: 0, bestStreak: 0 });

    const result = await as(t, b).query(api.ranked.getLastMatchResult, {});
    expect(result).toMatchObject({
      won: false,
      eloChange: -16,
      eloAfter: 984,
      endReason: "solved",
    });
  });

  it("hands the win over when a player runs out of lives", async () => {
    const t = setup();
    const { a, b, match } = await startMatch(t);
    const misses = "abcdefghijklmnopqrstuvwxyz"
      .split("")
      .filter((l) => !match.word.includes(l))
      .slice(0, 6);
    for (const letter of misses) {
      await as(t, a).mutation(api.ranked.makeGuess, { guess: letter });
    }
    const finished = await t.run((ctx) => ctx.db.get(match._id));
    expect(finished?.status).toBe("finished");
    expect(finished?.winnerId).toBe(b);
    expect(finished?.endReason).toBe("failed");
  });

  it("lets a player resign", async () => {
    const t = setup();
    const { a, b, match } = await startMatch(t);
    await as(t, a).mutation(api.ranked.forfeitMatch, {});
    const finished = await t.run((ctx) => ctx.db.get(match._id));
    expect(finished).toMatchObject({ status: "finished", winnerId: b, endReason: "forfeit" });
  });

  it("times out a player who never moves", async () => {
    const t = setup();
    const { a, b, match } = await startMatch(t);
    await as(t, a).mutation(api.ranked.makeGuess, { guess: match.word[0] });

    vi.advanceTimersByTime(RANKED_TURN_TIMEOUT_MS + 1000);
    await t.finishInProgressScheduledFunctions();

    const finished = await t.run((ctx) => ctx.db.get(match._id));
    expect(finished).toMatchObject({ status: "finished", winnerId: a, endReason: "timeout" });
    const bob = await t.run((ctx) => ctx.db.get(b));
    expect(bob!.elo).toBeLessThan(1000);
  });

  it("times out a player who stops guessing mid-match", async () => {
    const t = setup();
    const { a, b, match } = await startMatch(t);
    const misses = "zqxjkvwy".split("").filter((l) => !match.word.includes(l));
    await as(t, a).mutation(api.ranked.makeGuess, { guess: misses[0] });
    await as(t, b).mutation(api.ranked.makeGuess, { guess: misses[0] });
    // Bob keeps playing; Alice goes quiet.
    vi.advanceTimersByTime(RANKED_TURN_TIMEOUT_MS / 2);
    await as(t, b).mutation(api.ranked.makeGuess, { guess: misses[1] });
    vi.advanceTimersByTime(RANKED_TURN_TIMEOUT_MS / 2 + 1000);
    await t.finishInProgressScheduledFunctions();

    const finished = await t.run((ctx) => ctx.db.get(match._id));
    expect(finished).toMatchObject({ status: "finished", winnerId: b, endReason: "timeout" });
  });

  it("drops a match where nobody moved", async () => {
    const t = setup();
    const { match } = await startMatch(t);
    vi.advanceTimersByTime(RANKED_TURN_TIMEOUT_MS + 1000);
    await t.finishInProgressScheduledFunctions();
    expect(await t.run((ctx) => ctx.db.get(match._id))).toBeNull();
    expect(await getMatchPlayers(t, match._id)).toEqual([]);
  });

  it("sweeps expired matches when timers are missing", async () => {
    const t = setup();
    const a = await createUser(t, "alice");
    const b = await createUser(t, "bob");
    const start = Date.now();
    const matchId = await t.run(async (ctx) => {
      const id = await ctx.db.insert("matches", {
        word: "apple",
        status: "active",
        startedAt: start,
      });
      await ctx.db.insert("matchPlayers", {
        matchId: id,
        userId: a,
        opponentId: b,
        guesses: ["a"],
        mistakes: 0,
        lastGuessAt: start + 1000,
        active: true,
        eloBefore: 1000,
        opponentEloBefore: 1000,
      });
      await ctx.db.insert("matchPlayers", {
        matchId: id,
        userId: b,
        opponentId: a,
        guesses: [],
        mistakes: 0,
        lastGuessAt: start,
        active: true,
        eloBefore: 1000,
        opponentEloBefore: 1000,
      });
      return id;
    });

    vi.advanceTimersByTime(RANKED_TURN_TIMEOUT_MS + 20_000);
    await t.mutation(internal.ranked.sweepExpiredMatches, {});

    const finished = await t.run((ctx) => ctx.db.get(matchId));
    expect(finished).toMatchObject({ status: "finished", winnerId: a, endReason: "timeout" });
  });

  it("builds an Elo history and enforces placement matches before ranking", async () => {
    const t = setup();
    const { a, b, match } = await startMatch(t);
    await solve(t, a, match.word);

    // After 1 match, both players are still in placement (not on leaderboard).
    const profileBefore = await t.query(api.user.getUserProfile, { userName: "ALICE" });
    expect(profileBefore?.eloHistory.map((p) => p.elo)).toEqual([1000, 1016]);
    expect(profileBefore?.rank).toBeNull();
    expect(profileBefore?.placement).toEqual({ played: 1, required: PLACEMENT_MATCHES });
    expect(await t.query(api.leaderboard.getEloLeaderboard, {})).toEqual([]);

    const stats = await as(t, b).query(api.user.getRankedStats, {});
    expect(stats?.summary).toMatchObject({
      games: 1,
      wins: 0,
      elo: 984,
      peakElo: 1000,
      position: null,
      placement: { played: 1, required: PLACEMENT_MATCHES },
    });
    expect(stats?.rivals).toEqual([{ name: "alice", games: 1, wins: 0 }]);

    // Play the remaining placement matches.
    for (let i = 1; i < PLACEMENT_MATCHES; i++) {
      vi.advanceTimersByTime(1000);
      await as(t, a).mutation(api.ranked.enterMatchmaking, {});
      await as(t, b).mutation(api.ranked.enterMatchmaking, {});
      const m = await getMatch(t);
      await solve(t, a, m.word);
    }

    const board = await t.query(api.leaderboard.getEloLeaderboard, {});
    expect(board.map((p) => ({ user: p.user, rank: p.rank, games: p.games }))).toEqual([
      { user: "alice", rank: 1, games: PLACEMENT_MATCHES },
      { user: "bob", rank: 2, games: PLACEMENT_MATCHES },
    ]);

    const profileAfter = await t.query(api.user.getUserProfile, { userName: "alice" });
    expect(profileAfter?.rank).toBe(1);
    const bobStats = await as(t, b).query(api.user.getRankedStats, {});
    expect(bobStats?.summary.position).toBe(2);
  });
});

describe("accounts", () => {
  it("shows a rename everywhere", async () => {
    const t = setup();
    const a = await createUser(t, "alice", 1000, { rankedGames: PLACEMENT_MATCHES, rankedWins: 3 });
    const b = await createUser(t, "bob", 1000, { rankedGames: PLACEMENT_MATCHES, rankedWins: 2 });
    await as(t, a).mutation(api.ranked.enterMatchmaking, {});
    await as(t, b).mutation(api.ranked.enterMatchmaking, {});
    const match = await getMatch(t);
    await solve(t, a, match.word);
    await as(t, a).mutation(api.user.renameUser, { name: "Alicia" });

    const games = await as(t, b).query(api.user.getRecentRankedGames, {});
    expect(games?.[0].opponent).toBe("Alicia");
    const board = await t.query(api.leaderboard.getEloLeaderboard, {});
    expect(board.map((p) => p.user)).toContain("Alicia");
  });

  it("rejects taken and invalid names", async () => {
    const t = setup();
    const a = await createUser(t, "alice");
    await createUser(t, "bob");
    await expect(as(t, a).mutation(api.user.renameUser, { name: "BOB" })).rejects.toThrow(/taken/);
    await expect(as(t, a).mutation(api.user.renameUser, { name: "1abc" })).rejects.toThrow();
    // Changing only capitalisation of your own name is fine.
    expect(await as(t, a).mutation(api.user.renameUser, { name: "Alice" })).toBe("Alice");
  });

  it("forfeits an active match when the account is deleted", async () => {
    const t = setup();
    const { a, b, match } = await startMatch(t);
    await as(t, a).mutation(api.user.deleteUserAccount, {});

    const finished = await t.run((ctx) => ctx.db.get(match._id));
    expect(finished).toMatchObject({ status: "finished", winnerId: b, endReason: "forfeit" });
    const profile = await t.query(api.user.getUserProfile, { userName: "alice" });
    expect(profile).toBeNull();
    const deletedGames = await t.query(api.user.getRecentRankedGames, { userId: a });
    expect(deletedGames).toBeNull();
    const games = await as(t, b).query(api.user.getRecentRankedGames, {});
    expect(games?.[0].opponent).toBe("deleted-user");
  });
});
