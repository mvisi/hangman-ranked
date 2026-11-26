import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Compact human duration: "850ms", "12.4s", "1m 05s", "2h 03m". */
export function formatDuration(ms: number | null | undefined) {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return "–";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const totalSeconds = ms / 1000;
  if (totalSeconds < 60) return `${totalSeconds.toFixed(1)}s`;
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, "0")}m`;
  return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
}

/** Stopwatch style "mm:ss" (or "h:mm:ss" past an hour). */
export function formatClock(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return hours > 0 ? `${hours}:${minutes}:${seconds}` : `${minutes}:${seconds}`;
}

export function formatPercent(ratio: number, digits = 0) {
  return `${(ratio * 100).toFixed(digits)}%`;
}

export function formatSigned(value: number) {
  return value > 0 ? `+${value}` : `${value}`;
}

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const MONTH = 30 * DAY;
const YEAR = 365 * DAY;

/** "Just now", "5 minutes ago", "3 weeks ago"… */
export function formatRelative(timestamp: number, now = Date.now()) {
  if (!timestamp) return "Never";
  const diff = now - timestamp;
  if (diff < MINUTE) return "Just now";
  const units: [number, string][] = [
    [YEAR, "year"],
    [MONTH, "month"],
    [WEEK, "week"],
    [DAY, "day"],
    [HOUR, "hour"],
    [MINUTE, "minute"],
  ];
  for (const [size, label] of units) {
    if (diff >= size) {
      const n = Math.floor(diff / size);
      return `${n} ${label}${n === 1 ? "" : "s"} ago`;
    }
  }
  return "Just now";
}

export function formatDate(timestamp: number) {
  return new Date(timestamp).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** Path to a player's profile page. */
export function profileHref(name: string) {
  return `/profile/${encodeURIComponent(name)}`;
}

/** Pulls the human message out of a Convex error. */
export function errorMessage(error: unknown, fallback = "Something went wrong") {
  if (error && typeof error === "object" && "data" in error) {
    const data = (error as { data: unknown }).data;
    if (typeof data === "string") return data;
  }
  if (error instanceof Error) {
    // Convex prefixes server errors with request metadata; keep the message.
    const match = error.message.match(/(?:Uncaught )?(?:ConvexError|Error): (.+?)(?:\n|$)/);
    return match?.[1] ?? fallback;
  }
  return fallback;
}
