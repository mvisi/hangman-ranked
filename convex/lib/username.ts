import { notAllowedUsernames } from "../data/notAllowedUsernames";
import { usernameSchema } from "./validators";

export const DELETED_USER_NAME = "deleted-user";

/** True when the lowercase name is reserved or on the profanity blocklist. */
export function isBlockedUsername(lowercaseName: string) {
  return (
    notAllowedUsernames.has(lowercaseName) ||
    lowercaseName.includes("deleted_user") ||
    lowercaseName.includes(DELETED_USER_NAME)
  );
}

/**
 * Returns a user-facing error message if the username is invalid, otherwise
 * the normalized (trimmed) name.
 */
export function checkUsername(
  rawName: string,
): { ok: true; name: string } | { ok: false; error: string } {
  const parsed = usernameSchema.safeParse(rawName);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }
  if (isBlockedUsername(parsed.data.toLowerCase())) {
    return { ok: false, error: "This username is not allowed" };
  }
  return { ok: true, name: parsed.data };
}

export function avatarUrlFor(name: string) {
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random&bold=true`;
}
