import type { Metadata } from "next";
import Link from "next/link";
import ActionButton from "./button";

export const metadata: Metadata = {
  title: "Debug",
  robots: { index: false, follow: false },
};

const throwServerError = async () => {
  "use server";
  throw new Error("This is a server-side error for testing purposes.");
};

export default function DebugPage() {
  return (
    <main className="prose prose-zinc dark:prose-invert mx-auto max-w-3xl px-6 py-10">
      <h3 className="text-destructive">
        Warning: This page is for debugging purposes only.{" "}
        <Link href="/">Go back</Link> if you don&apos;t know what you&apos;re
        doing. Everything you do here will be at your own risk.
      </h3>
      <section>
        <h4>
          Click the button below to intentionally throw a server side error.
        </h4>
        <ActionButton func={throwServerError} />
      </section>
      <section>
        <h4>
          Click the button below to intentionally throw a client side error.
        </h4>
        <ActionButton />
      </section>
    </main>
  );
}
