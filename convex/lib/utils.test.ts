import { describe, expect, it } from "vitest";
import { dayKey, streaks } from "./utils";

describe("streaks", () => {
  it("finds the best and current run", () => {
    expect(streaks([true, true, false, true, true, true, false, true])).toEqual({
      best: 3,
      current: 1,
    });
    expect(streaks([])).toEqual({ best: 0, current: 0 });
  });
});

describe("dayKey", () => {
  it("buckets by the viewer's timezone", () => {
    const t = Date.UTC(2026, 0, 1, 2, 0); // 02:00 UTC on Jan 1
    expect(dayKey(t, 0)).toBe("2026-01-01");
    // UTC-5 (getTimezoneOffset() === 300): still Dec 31 locally.
    expect(dayKey(t, 300)).toBe("2025-12-31");
  });
});
