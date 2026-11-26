import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./_generated/api";
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

    for (const letter of uniqueLetters(game!.word)) {
      await as(t, me).mutation(api.game.makeGuess, { guess: letter });
    }
    const last = await as(t, me).query(api.game.getLastGame, {});
    expect(last).toMatchObject({ isWon: true, word: game!.word, isPersonalBest: true });
    expect(last!.score).toBeGreaterThan(0);

    const user = await t.run((ctx) => ctx.db.get(me));
    expect(user?.personalScoreRecord).toBe(last!.score);

    const board = await t.query(api.leaderboard.getSoloLeaderboard, {});
    expect(board[0]).toMatchObject({ user: "me", score: last!.score });
  });

  it("abandons an idle game", async () => {
    const t = setup();
    const me = await createUser(t, "me");
    await as(t, me).mutation(api.game.createGame, {});
    vi.advanceTimersByTime(SOLO_TURN_TIMEOUT_MS + 1000);
    await t.finishInProgressScheduledFunctions();

    expect(await as(t, me).query(api.game.getActiveGame, {})).toBeNull();
    const last = await as(t, me).query(api.game.getLastGame, {});
    expect(last).toMatchObject({ isWon: false, isAbandoned: true });
  });

  it("summarises stats", async () => {
    const t = setup();
    const me = await createUser(t, "me");
    await as(t, me).mutation(api.game.createGame, {});
    await as(t, me).mutation(api.game.forfeitGame, {});
    const stats = await as(t, me).query(api.user.getSoloStats, {});
    expect(stats?.summary).toMatchObject({ totalGames: 1, totalWins: 0, currentStreak: 0 });
    expect(stats?.charts.letters).toHaveLength(26);
  });
});
