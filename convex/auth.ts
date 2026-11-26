import GitHub from "@auth/core/providers/github";
import Google from "@auth/core/providers/google";
import { convexAuth, getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";
import { MutationCtx, query, QueryCtx } from "./_generated/server";
import CustomEmail from "./lib/CustomEmail";
import { DEFAULT_ELO } from "./lib/elo";
import { avatarUrlFor, checkUsername, isBlockedUsername } from "./lib/username";
import { emptyStats, randomSuffix } from "./lib/utils";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [GitHub, Google, CustomEmail],
  callbacks: {
    /**
     * Fully replace Convex Auth's default upsert logic so every user gets a
     * unique, validated username and initialised stats.
     */
    async createOrUpdateUser(ctx: MutationCtx, args) {
      if (args.existingUserId) {
        return args.existingUserId;
      }

      const email = args.profile.email;
      const phone = args.profile.phone;

      let name: string;
      if (args.provider.id === "password" && args.profile.name) {
        // Password sign-ups pick their own username: validate it strictly.
        const result = checkUsername(args.profile.name as string);
        if (!result.ok) {
          throw new ConvexError(result.error);
        }
        if (await isUsernameTaken(ctx, result.name)) {
          throw new ConvexError("This username is taken");
        }
        name = result.name;
      } else {
        // OAuth sign-ups get a name derived from their profile.
        name = await generateUniqueName(
          ctx,
          (args.profile.name as string | undefined) ?? email?.split("@")[0],
        );
      }

      const now = Date.now();
      return await ctx.db.insert("users", {
        email,
        phone,
        name,
        lowercaseName: name.toLowerCase(),
        image: avatarUrlFor(name),
        elo: DEFAULT_ELO,
        peakElo: DEFAULT_ELO,
        ranked: emptyStats(),
        solo: { ...emptyStats(), bestScore: 0 },
        lastSeenAt: now,
      });
    },
  },
});

export async function isUsernameTaken(ctx: QueryCtx, name: string) {
  const existing = await ctx.db
    .query("users")
    .withIndex("by_lowercase_name", (q) => q.eq("lowercaseName", name.toLowerCase()))
    .first();
  return existing !== null;
}

export async function generateUniqueName(
  ctx: QueryCtx,
  baseName: string | undefined,
): Promise<string> {
  let normalized = (baseName ?? "player")
    .trim()
    .replace(/[-\s]+/g, "_")
    .replace(/[^a-zA-Z0-9_]/g, "")
    .split("_")[0]
    .replace(/^[^a-zA-Z]+/, "")
    .slice(0, 10);

  if (normalized.length < 3 || isBlockedUsername(normalized.toLowerCase())) {
    normalized = "player";
  }

  // Try the base name, then base name + random suffix until available.
  let finalName = normalized;
  for (let attempt = 0; await isUsernameTaken(ctx, finalName); attempt++) {
    if (attempt >= 10) {
      finalName = `${normalized}_${Date.now().toString(36)}`;
      break;
    }
    finalName = `${normalized}_${randomSuffix()}`.slice(0, 20);
  }
  return finalName;
}

export const getLoggedInUserHelper = async (ctx: QueryCtx) => {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    return null;
  }
  const user = await ctx.db.get(userId);
  if (!user || user.deletedAt) {
    return null;
  }
  return user;
};

/** Like {@link getLoggedInUserHelper} but throws when signed out. */
export const requireUser = async (ctx: QueryCtx) => {
  const user = await getLoggedInUserHelper(ctx);
  if (!user) {
    throw new ConvexError("You need to be signed in to do that");
  }
  return user;
};

export const loggedInUser = query({
  args: {},
  handler: async (ctx) => {
    return getLoggedInUserHelper(ctx);
  },
});
