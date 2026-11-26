import { convexTest } from "convex-test";
import { Id } from "./_generated/dataModel";
import { DEFAULT_ELO } from "./lib/elo";
import { emptyStats } from "./lib/utils";
import schema from "./schema";
import { modules } from "./test.setup";

export function setup() {
  return convexTest(schema, modules);
}
export type T = ReturnType<typeof setup>;

export async function createUser(
  t: T,
  name: string,
  elo = DEFAULT_ELO,
  overrides: { rankedGames?: number; rankedWins?: number } = {},
) {
  const rankedGames = overrides.rankedGames ?? 0;
  const rankedWins = overrides.rankedWins ?? 0;
  return await t.run((ctx) =>
    ctx.db.insert("users", {
      name,
      lowercaseName: name.toLowerCase(),
      elo,
      peakElo: elo,
      ranked: { ...emptyStats(), games: rankedGames, wins: rankedWins },
      solo: { ...emptyStats(), bestScore: 0 },
      lastSeenAt: Date.now(),
    }),
  );
}

/** Acts as the given user (Convex Auth encodes `userId|sessionId` as subject). */
export function as(t: T, userId: Id<"users">) {
  return t.withIdentity({ subject: `${userId}|test-session` });
}
