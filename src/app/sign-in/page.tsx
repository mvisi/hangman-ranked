"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { ArrowLeftIcon, Loader2Icon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import SignInBtn from "./SignInBtn";
import { LogoMark } from "@/components/layout/Logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { errorMessage } from "@/lib/utils";
import { signUpSchema } from "@/lib/validators";

type Flow = "signIn" | "signUp";
type FieldErrors = Partial<Record<"email" | "password" | "name", string>>;

// Server messages that belong to the username field.
const NAME_ERRORS = ["username", "letters, numbers"];

export default function SignInPage() {
  const { signIn } = useAuthActions();
  const router = useRouter();
  const [flow, setFlow] = useState<Flow>("signIn");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setFieldErrors({});
    setFormError(null);

    if (flow === "signUp") {
      const parsed = signUpSchema.safeParse(Object.fromEntries(formData.entries()));
      if (!parsed.success) {
        const errors: FieldErrors = {};
        for (const issue of parsed.error.issues) {
          const field = issue.path[0] as keyof FieldErrors;
          errors[field] ??= issue.message;
        }
        setFieldErrors(errors);
        return;
      }
    }

    setSubmitting(true);
    try {
      await signIn("password", formData);
      router.replace("/");
      router.refresh();
    } catch (e) {
      const message = errorMessage(e, "");
      if (flow === "signUp" && NAME_ERRORS.some((m) => message.toLowerCase().includes(m))) {
        setFieldErrors({ name: message });
      } else {
        setFormError(
          flow === "signUp"
            ? message || "Couldn't create your account. Is that email already registered?"
            : "Invalid email or password.",
        );
      }
      setSubmitting(false);
    }
  };

  const switchFlow = () => {
    setFormError(null);
    setFieldErrors({});
    setFlow(flow === "signIn" ? "signUp" : "signIn");
  };

  return (
    <div className="bg-grid relative flex min-h-svh flex-col items-center justify-center gap-6 p-6 md:p-10">
      <div className="from-background via-background/80 to-background pointer-events-none absolute inset-0 bg-gradient-to-b" />
      <div className="relative flex w-full max-w-sm flex-col gap-6">
        <Link
          href="/"
          className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 self-start text-sm"
        >
          <ArrowLeftIcon className="size-4" /> Back to the game
        </Link>
        <Card className="shadow-lg">
          <CardHeader className="items-center text-center">
            <LogoMark className="mx-auto mb-2 size-11" />
            <CardTitle className="text-xl">
              {flow === "signIn" ? "Welcome back" : "Create your account"}
            </CardTitle>
            <CardDescription>
              {flow === "signIn"
                ? "Log in to play ranked and keep your stats."
                : "Pick a username: it's how other players will see you."}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-6">
            <div className="grid gap-3">
              <SignInBtn provider="Google" />
              <SignInBtn provider="GitHub" />
            </div>
            <div className="after:border-border relative text-center text-sm after:absolute after:inset-0 after:top-1/2 after:z-0 after:flex after:items-center after:border-t">
              <span className="bg-card text-muted-foreground relative z-10 px-2">or with email</span>
            </div>
            <form onSubmit={onSubmit} className="grid gap-5" noValidate>
              <Field id="email" label="Email" error={fieldErrors.email}>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="you@example.com"
                  autoComplete="email"
                  required
                  autoFocus
                  aria-invalid={!!fieldErrors.email}
                />
              </Field>
              {flow === "signUp" && (
                <Field
                  id="name"
                  label="Username"
                  error={fieldErrors.name}
                  hint="3–20 letters, numbers or underscores."
                >
                  <Input
                    id="name"
                    name="name"
                    placeholder="word_wizard"
                    autoComplete="username"
                    maxLength={20}
                    required
                    aria-invalid={!!fieldErrors.name}
                  />
                </Field>
              )}
              <Field
                id="password"
                label="Password"
                error={fieldErrors.password}
                hint={flow === "signUp" ? "At least 8 characters." : undefined}
              >
                <Input
                  id="password"
                  name="password"
                  type="password"
                  required
                  autoComplete={flow === "signUp" ? "new-password" : "current-password"}
                  aria-invalid={!!fieldErrors.password}
                />
              </Field>
              <input name="flow" type="hidden" value={flow} />
              {formError && (
                <p className="text-destructive bg-destructive/10 rounded-md px-3 py-2 text-sm" role="alert">
                  {formError}
                </p>
              )}
              <Button type="submit" className="w-full" size="lg" disabled={submitting}>
                {submitting && <Loader2Icon className="animate-spin" />}
                {flow === "signUp" ? "Create account" : "Log in"}
              </Button>
              <p className="text-muted-foreground text-center text-sm">
                {flow === "signUp" ? "Already have an account?" : "New here?"}{" "}
                <button
                  type="button"
                  onClick={switchFlow}
                  className="text-primary font-medium underline-offset-4 hover:underline"
                >
                  {flow === "signUp" ? "Log in" : "Create an account"}
                </button>
              </p>
            </form>
          </CardContent>
        </Card>
        <p className="text-muted-foreground text-center text-xs text-balance">
          By using this service, you agree to our{" "}
          <Link href="/privacy" className="hover:text-primary underline underline-offset-4">
            Privacy Policy
          </Link>
          .
        </p>
      </div>
    </div>
  );
}

function Field({
  id,
  label,
  error,
  hint,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error ? (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      ) : (
        hint && <p className="text-muted-foreground text-xs">{hint}</p>
      )}
    </div>
  );
}
