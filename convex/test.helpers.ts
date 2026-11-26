import { convexTest } from "convex-test";
import { Id } from "./_generated/dataModel";
import schema from "./schema";
import { modules } from "./test.setup";

export function setup() {
  return convexTest(schema, modules);
}
export type T = ReturnType<typeof setup>;

export async function createUser(t: T, name: string, elo = 1000) {
  return await t.run((ctx) =>
    ctx.db.insert("users", {
      name,
      lowercaseName: name.toLowerCase(),
      elo,
      userStats: { gamesPlayed: 0, wins: 0, winRate: 0, lastSeen: 0 },
      status: "active",
    }),
  );
}

/** Acts as the given user (Convex Auth encodes `userId|sessionId` as subject). */
export function as(t: T, userId: Id<"users">) {
  return t.withIdentity({ subject: `${userId}|test-session` });
}
