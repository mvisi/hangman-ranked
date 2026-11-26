import { Doc } from "../_generated/dataModel";

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

export function countLetters(str: string) {
  const letterCount: Record<string, number> = {};
  for (const letter of str) {
    letterCount[letter] = (letterCount[letter] || 0) + 1;
  }
  return letterCount;
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

export function getUpdatedStats(user: Doc<"users">, isWon: boolean) {
  const gamesPlayed = (user.userStats?.gamesPlayed ?? 0) + 1;
  const wins = (user.userStats?.wins ?? 0) + (isWon ? 1 : 0);
  return {
    gamesPlayed,
    wins,
    winRate: Number.parseFloat((wins / gamesPlayed).toFixed(3)),
    lastSeen: Date.now(),
  };
}

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

/** Players must have finished a ranked game to appear in the rankings. */
export function isRankedPlayer(user: Doc<"users">) {
  return (
    (user.userStats?.gamesPlayed ?? 0) > 0 &&
    user.status !== "deleted" &&
    user.status !== "banned"
  );
}
