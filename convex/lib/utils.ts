import { Doc } from "../_generated/dataModel";
import { PLACEMENT_MATCHES } from "./elo";
import { DELETED_USER_NAME } from "./username";

export function sum(values: readonly (number | undefined)[]) {
  return values.reduce<number>(
    (acc, val) => (typeof val === "number" ? acc + val : acc),
    0,
  );
}

export function average(values: readonly (number | undefined)[]) {
  const numbers = values.filter((v): v is number => typeof v === "number");
  return numbers.length ? sum(numbers) / numbers.length : 0;
}

const BASE62_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

export function randomSuffix(length = 6): string {
  let result = "";
  for (let i = 0; i < length; i++) {
    result += BASE62_ALPHABET[Math.floor(Math.random() * BASE62_ALPHABET.length)];
  }
  return result;
}

type StreakStats = { games: number; wins: number; streak: number; bestStreak: number };

/** Running totals after one more game. */
export function bumpStats<S extends StreakStats>(stats: S, won: boolean): S {
  const streak = won ? stats.streak + 1 : 0;
  return {
    ...stats,
    games: stats.games + 1,
    wins: stats.wins + (won ? 1 : 0),
    streak,
    bestStreak: Math.max(stats.bestStreak, streak),
  };
}

export const emptyStats = () => ({ games: 0, wins: 0, streak: 0, bestStreak: 0 });

/** Key for grouping timestamps by calendar day in the viewer's timezone. */
export function dayKey(timestamp: number, tzOffsetMinutes = 0) {
  // `tzOffsetMinutes` follows Date#getTimezoneOffset: minutes *behind* UTC.
  return new Date(timestamp - tzOffsetMinutes * 60_000)
    .toISOString()
    .slice(0, 10);
}

/** Longest run of consecutive `true` values, plus the run at the end. */
export function streaks(results: readonly boolean[]) {
  let best = 0;
  let run = 0;
  for (const r of results) {
    run = r ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return { best, current: run };
}

/** Public name of a user, hiding deleted accounts. */
export function displayName(user: Doc<"users"> | null | undefined) {
  if (!user || user.deletedAt) return DELETED_USER_NAME;
  return user.name ?? "Unknown";
}

/** Players appear on the Elo leaderboard once placement is complete. */
export function isOnLeaderboard(user: Doc<"users">) {
  return !user.deletedAt && user.ranked.games >= PLACEMENT_MATCHES;
}
