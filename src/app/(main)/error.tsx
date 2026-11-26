"use client";

import * as Sentry from "@sentry/nextjs";
import { RotateCcwIcon, TriangleAlertIcon } from "lucide-react";
import { useEffect } from "react";
import Container, { Page } from "@/components/Container";
import { Button } from "@/components/ui/button";

export default function MainError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <Page>
      <Container className="mt-12 flex flex-col items-center gap-4 py-12 text-center">
        <span className="bg-danger-soft text-danger flex size-14 items-center justify-center rounded-2xl">
          <TriangleAlertIcon className="size-7" />
        </span>
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">Something went wrong</h1>
          <p className="text-muted-foreground text-sm">
            We&apos;ve been notified. Try again, or come back in a moment.
          </p>
        </div>
        <Button onClick={reset}>
          <RotateCcwIcon /> Try again
        </Button>
      </Container>
    </Page>
  );
}
