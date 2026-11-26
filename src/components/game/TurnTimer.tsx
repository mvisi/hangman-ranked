"use client";

import { TimerIcon } from "lucide-react";
import { useCountdown } from "@/hooks/useServerClock";
import { cn } from "@/lib/utils";

/** Countdown bar for the per-move time limit enforced by the server. */
const TurnTimer = ({
  deadline,
  totalMs,
  className,
}: {
  deadline: number;
  totalMs: number;
  className?: string;
}) => {
  const remaining = useCountdown(deadline);
  const seconds = Math.ceil(remaining / 1000);
  const ratio = Math.max(0, Math.min(1, remaining / totalMs));
  const urgent = seconds <= 5;
  const warn = !urgent && seconds <= 10;

  return (
    <div className={cn("w-full", className)}>
      <div className="mb-1.5 flex items-center justify-between text-sm">
        <span className="text-muted-foreground flex items-center gap-1.5">
          <TimerIcon className="size-4" /> Time to guess
        </span>
        <span
          role="timer"
          aria-live={urgent ? "assertive" : "off"}
          className={cn(
            "tabular font-mono font-semibold",
            warn && "text-warning",
            urgent && "text-danger",
          )}
        >
          {seconds}s
        </span>
      </div>
      <div className="bg-muted h-2 overflow-hidden rounded-full">
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-200 ease-linear",
            urgent ? "bg-danger" : warn ? "bg-warning" : "bg-primary",
          )}
          style={{ width: `${ratio * 100}%` }}
        />
      </div>
    </div>
  );
};

export default TurnTimer;
