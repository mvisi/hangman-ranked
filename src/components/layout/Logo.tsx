import { cn } from "@/lib/utils";

/** Gallows mark used in the navbar and auth pages. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "bg-primary text-primary-foreground inline-flex size-8 items-center justify-center rounded-lg shadow-sm",
        className,
      )}
      aria-hidden="true"
    >
      <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
        <path d="M5 21h9M8 21V3h9v3" />
        <circle cx="17" cy="9" r="2.4" />
        <path d="M17 11.5v4.5M17 13l-2 2M17 13l2 2" />
      </svg>
    </span>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark />
      <span className="font-mono text-lg font-semibold tracking-tight">
        Hangman<span className="text-primary"> Ranked</span>
      </span>
    </span>
  );
}
