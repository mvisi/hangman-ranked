import { z } from "zod";

/**
 * Validation schemas shared by the Convex backend and the Next.js client so
 * both sides agree on what a valid username, email and password look like.
 */

export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 20;
export const USERNAME_PATTERN = /^[A-Za-z][A-Za-z0-9_]+$/;

export const usernameSchema = z
  .string()
  .trim()
  .min(
    USERNAME_MIN_LENGTH,
    `The username must be at least ${USERNAME_MIN_LENGTH} characters`,
  )
  .max(
    USERNAME_MAX_LENGTH,
    `The username must be at most ${USERNAME_MAX_LENGTH} characters`,
  )
  .regex(
    USERNAME_PATTERN,
    "Use only letters, numbers and underscores, starting with a letter",
  );

export const emailSchema = z
  .email("Enter a valid email address")
  .max(254, "Email is too long");

export const passwordSchema = z
  .string()
  .min(8, "The password must be at least 8 characters long")
  .max(72, "The password must not exceed 72 characters");

export const signUpSchema = z.object({
  email: emailSchema,
  name: usernameSchema,
  password: passwordSchema,
});

/** Profile fields validated server-side during password sign-up. */
export const signUpProfileSchema = signUpSchema.pick({ email: true, name: true });
