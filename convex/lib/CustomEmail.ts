import { ConvexError } from "convex/values";
import { Password } from "@convex-dev/auth/providers/Password";
import { passwordSchema, signUpProfileSchema } from "./validators";

export default Password({
  profile(params): { email: string; name?: string } {
    if (params.flow === "signUp") {
      const parsed = signUpProfileSchema.safeParse(params);
      if (!parsed.success) {
        throw new ConvexError(parsed.error.issues[0].message);
      }
      return { email: parsed.data.email, name: parsed.data.name };
    }
    return { email: params.email as string };
  },
  validatePasswordRequirements(password) {
    const parsed = passwordSchema.safeParse(password);
    if (!parsed.success) {
      throw new ConvexError(parsed.error.issues[0].message);
    }
  },
});
