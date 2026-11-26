import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import { SOLO_TURN_TIMEOUT_MS, uniqueLetters } from "./lib/game";
import { as, createUser, setup } from "./test.helpers";

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("solo games", () => {
  it("does not reroll the word of a game in progress", async () => {
    const t = setup();
    const me = await createUser(t, "me");
    const first = await as(t, me).mutation(api.game.createGame, {});
    const second = await as(t, me).mutation(api.game.createGame, {});
    expect(second).toBe(first);
  });

  it("scores a win and records the personal best", async () => {
    const t = setup();
    const me = await createUser(t, "me");
    const gameId = await as(t, me).mutation(api.game.createGame, {});
    const game = await t.run((ctx) => ctx.db.get(gameId));

    const view = await as(t, me).query(api.game.getActiveGame, {});
    expect(view?.displayWord.every((l) => l === "_")).toBe(true);
    expect(JSON.stringify(view)).not.toContain(game!.word);

    vi.advanceTimersByTime(5_000);
    for (const letter of uniqueLetters(game!.word)) {
      await as(t, me).mutation(api.game.makeGuess, { guess: letter });
    }
    const last = await as(t, me).query(api.game.getLastGame, {});
    expect(last).toMatchObject({
      result: "won",
      word: game!.word,
      isPersonalBest: true,
    });
    expect(last!.durationMs).toBeGreaterThanOrEqual(5_000);
    expect(last!.score).toBeGreaterThan(0);

    const user = await t.run((ctx) => ctx.db.get(me));
    expect(user?.solo).toMatchObject({
      games: 1,
      wins: 1,
      streak: 1,
      bestStreak: 1,
      bestScore: last!.score,
    });

    const board = await t.query(api.leaderboard.getSoloLeaderboard, {});
    expect(board[0]).toMatchObject({ user: "me", score: last!.score, time: last!.durationMs });
  });

  it("keeps only each player's best solo game on score and fastest leaderboards", async () => {
    const t = setup();
    const alice = await createUser(t, "alice");
    const bob = await createUser(t, "bob");

    // Alice plays a slow win, then a fast win.
    const slowId = await as(t, alice).mutation(api.game.createGame, {});
    const slowGame = await t.run((ctx) => ctx.db.get(slowId));
    vi.advanceTimersByTime(40_000);
    for (const l of uniqueLetters(slowGame!.word)) {
      await as(t, alice).mutation(api.game.makeGuess, { guess: l });
    }

    const fastId = await as(t, alice).mutation(api.game.createGame, {});
    const fastGame = await t.run((ctx) => ctx.db.get(fastId));
    vi.advanceTimersByTime(2_000);
    for (const l of uniqueLetters(fastGame!.word)) {
      await as(t, alice).mutation(api.game.makeGuess, { guess: l });
    }

    // Bob plays a medium win.
    const bobId = await as(t, bob).mutation(api.game.createGame, {});
    const bobGame = await t.run((ctx) => ctx.db.get(bobId));
    vi.advanceTimersByTime(10_000);
    for (const l of uniqueLetters(bobGame!.word)) {
      await as(t, bob).mutation(api.game.makeGuess, { guess: l });
    }

    const byScore = await t.query(api.leaderboard.getSoloLeaderboard, { sort: "score" });
    expect(byScore).toHaveLength(2);
    expect(new Set(byScore.map((e) => e.user))).toEqual(new Set(["alice", "bob"]));

    const byTime = await t.query(api.leaderboard.getSoloLeaderboard, { sort: "time" });
    expect(byTime.map((e) => e.user)).toEqual(["alice", "bob"]);
    expect(byTime[0].time).toBeGreaterThanOrEqual(2_000);
    expect(byTime[0].time).toBeLessThan(byTime[1].time);
  });

  it("abandons an idle game", async () => {
    const t = setup();
    const me = await createUser(t, "me");
    await as(t, me).mutation(api.game.createGame, {});
    vi.advanceTimersByTime(SOLO_TURN_TIMEOUT_MS + 1000);
    await t.finishInProgressScheduledFunctions();

    expect(await as(t, me).query(api.game.getActiveGame, {})).toBeNull();
    const last = await as(t, me).query(api.game.getLastGame, {});
    expect(last).toMatchObject({ result: "abandoned", score: 0 });
  });

  it("sweeps idle games whose timer was lost", async () => {
    const t = setup();
    const me = await createUser(t, "me");
    const startedAt = Date.now();
    await t.run((ctx) =>
      ctx.db.insert("soloGames", {
        userId: me,
        word: "apple",
        guesses: [],
        mistakes: 0,
        status: "active",
        startedAt,
        lastGuessAt: startedAt,
        score: 0,
        hidden: false,
      }),
    );

    vi.advanceTimersByTime(SOLO_TURN_TIMEOUT_MS * 2 + 1000);
    await t.mutation(internal.game.sweepIdleGames, {});

    expect(await as(t, me).query(api.game.getActiveGame, {})).toBeNull();
    const last = await as(t, me).query(api.game.getLastGame, {});
    expect(last).toMatchObject({ result: "abandoned" });
  });

  it("records forfeits, summarises stats and hides deleted users from leaderboards", async () => {
    const t = setup();
    const me = await createUser(t, "me");

    // Win one game first so it's on the leaderboard.
    const winId = await as(t, me).mutation(api.game.createGame, {});
    const winGame = await t.run((ctx) => ctx.db.get(winId));
    for (const l of uniqueLetters(winGame!.word)) {
      await as(t, me).mutation(api.game.makeGuess, { guess: l });
    }
    expect(await t.query(api.leaderboard.getSoloLeaderboard, {})).toHaveLength(1);

    // Then forfeit a game.
    await as(t, me).mutation(api.game.createGame, {});
    await as(t, me).mutation(api.game.forfeitGame, {});

    const last = await as(t, me).query(api.game.getLastGame, {});
    expect(last).toMatchObject({ result: "forfeit", score: 0 });

    const recent = await as(t, me).query(api.user.getRecentSoloGames, {});
    expect(recent?.map((g) => g.result)).toEqual(["forfeit", "won"]);

    const stats = await as(t, me).query(api.user.getSoloStats, {});
    expect(stats?.summary).toMatchObject({
      totalGames: 2,
      totalWins: 1,
      currentStreak: 0,
      bestStreak: 1,
    });
    expect(stats?.charts.letters).toHaveLength(26);

    // Deleting the account hides past solo wins from the leaderboard.
    await as(t, me).mutation(api.user.deleteUserAccount, {});
    expect(await t.query(api.leaderboard.getSoloLeaderboard, {})).toEqual([]);
  });
});
