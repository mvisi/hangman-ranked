export const DEFAULT_ELO = 1000;
export const ELO_K_FACTOR = 32;
/** Matches a player must finish before appearing on the Elo leaderboard. */
export const PLACEMENT_MATCHES = 5;

/** Probability that a player rated `ratingA` beats one rated `ratingB`. */
export function expectedScore(ratingA: number, ratingB: number) {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

/**
 * Rating change for player A after a game against B. The change for B is the
 * exact negative, so the system stays zero-sum.
 */
export function getEloDelta(
  ratingA: number,
  ratingB: number,
  didAWin: boolean,
  kFactor: number = ELO_K_FACTOR,
): number {
  const actualA = didAWin ? 1 : 0;
  return Math.round(kFactor * (actualA - expectedScore(ratingA, ratingB)));
}

export const RANK_TIERS = [
  { name: "Beginner", min: -Infinity },
  { name: "Intermediate", min: 800 },
  { name: "Advanced", min: 1200 },
  { name: "Expert", min: 1600 },
  { name: "Master", min: 2000 },
  { name: "Grandmaster", min: 2400 },
] as const;

export type RankTierName = (typeof RANK_TIERS)[number]["name"];

export function getRankTier(elo: number) {
  let index = 0;
  RANK_TIERS.forEach((tier, i) => {
    if (elo >= tier.min) index = i;
  });
  const tier = RANK_TIERS[index];
  const next = RANK_TIERS[index + 1];
  return {
    name: tier.name as RankTierName,
    index,
    nextName: next?.name as RankTierName | undefined,
    nextMin: next?.min,
    /** 0-1 progress towards the next tier (1 for the top tier). */
    progress: next
      ? Math.min(
          1,
          Math.max(
            0,
            (elo - (Number.isFinite(tier.min) ? tier.min : 0)) /
              (next.min - (Number.isFinite(tier.min) ? tier.min : 0)),
          ),
        )
      : 1,
  };
}
