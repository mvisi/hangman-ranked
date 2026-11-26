import { describe, expect, it } from "vitest";
import { expectedScore, getEloDelta, getRankTier } from "./elo";

describe("elo", () => {
  it("gives half the K-factor for an even match", () => {
    expect(getEloDelta(1000, 1000, true)).toBe(16);
    expect(getEloDelta(1000, 1000, false)).toBe(-16);
  });

  it("rewards upsets more than expected wins", () => {
    expect(getEloDelta(1000, 1400, true)).toBeGreaterThan(getEloDelta(1400, 1000, true));
  });

  it("is zero-sum", () => {
    const a = getEloDelta(1100, 1300, true);
    const b = getEloDelta(1300, 1100, false);
    expect(a).toBe(-b);
  });

  it("expected scores are complementary", () => {
    expect(expectedScore(1200, 1000) + expectedScore(1000, 1200)).toBeCloseTo(1);
  });
});

describe("getRankTier", () => {
  it("maps ratings to tiers", () => {
    expect(getRankTier(500).name).toBe("Beginner");
    expect(getRankTier(1000).name).toBe("Intermediate");
    expect(getRankTier(1200).name).toBe("Advanced");
    expect(getRankTier(2500).name).toBe("Grandmaster");
  });

  it("reports progress towards the next tier", () => {
    const tier = getRankTier(1000);
    expect(tier.nextName).toBe("Advanced");
    expect(tier.progress).toBeCloseTo(0.5);
    expect(getRankTier(2500).progress).toBe(1);
  });
});
