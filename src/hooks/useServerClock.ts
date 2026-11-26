"use client";

import { useAction } from "convex/react";
import { useCallback, useEffect, useState } from "react";
import { api } from "../../convex/_generated/api";

// One sync per page load, shared by every component that needs server time.
let cachedOffset: number | null = null;
let pendingSync: Promise<number> | null = null;

/**
 * Estimates the offset between this device's clock and the Convex server's
 * (NTP-style, assuming symmetric latency) so countdowns match the deadlines
 * the server enforces.
 */
export function useServerClock() {
  const getServerTime = useAction(api.misc.getServerTime);
  const [offset, setOffset] = useState(cachedOffset ?? 0);
  const [isSynced, setIsSynced] = useState(cachedOffset !== null);

  useEffect(() => {
    if (cachedOffset !== null) return;
    let cancelled = false;
    pendingSync ??= (async () => {
      const sentAt = Date.now();
      const serverTime = await getServerTime();
      const receivedAt = Date.now();
      return serverTime + (receivedAt - sentAt) / 2 - receivedAt;
    })();
    pendingSync
      .then((value) => {
        cachedOffset = value;
        if (!cancelled) {
          setOffset(value);
          setIsSynced(true);
        }
      })
      .catch(() => {
        pendingSync = null; // retry on next mount; fall back to local time
      });
    return () => {
      cancelled = true;
    };
  }, [getServerTime]);

  const now = useCallback(() => Date.now() + offset, [offset]);
  return { now, isSynced };
}

/** Milliseconds left until `deadline` (server time), updated ~5x/second. */
export function useCountdown(deadline: number | undefined) {
  const { now } = useServerClock();
  const [remaining, setRemaining] = useState(() =>
    deadline ? Math.max(0, deadline - Date.now()) : 0,
  );

  useEffect(() => {
    if (!deadline) return;
    const tick = () => setRemaining(Math.max(0, deadline - now()));
    const frame = requestAnimationFrame(tick);
    const interval = setInterval(tick, 200);
    return () => {
      cancelAnimationFrame(frame);
      clearInterval(interval);
    };
  }, [deadline, now]);

  return remaining;
}

/** Milliseconds elapsed since `start` (server time), updated every second. */
export function useElapsed(start: number | undefined) {
  const { now } = useServerClock();
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!start) return;
    const tick = () => setElapsed(Math.max(0, now() - start));
    const frame = requestAnimationFrame(tick);
    const interval = setInterval(tick, 1000);
    return () => {
      cancelAnimationFrame(frame);
      clearInterval(interval);
    };
  }, [start, now]);

  return elapsed;
}
