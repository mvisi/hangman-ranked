import { CrownIcon, GemIcon, MedalIcon, ShieldIcon, SparklesIcon, StarIcon } from "lucide-react";
import { getRankTier, RankTierName } from "../../../convex/lib/elo";
import { cn } from "@/lib/utils";

const TIER_STYLE: Record<RankTierName, { icon: typeof StarIcon; className: string }> = {
  Beginner: { icon: ShieldIcon, className: "bg-muted text-muted-foreground" },
  Intermediate: {
    icon: MedalIcon,
    className: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
  },
  Advanced: {
    icon: StarIcon,
    className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  },
  Expert: {
    icon: GemIcon,
    className: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300",
  },
  Master: {
    icon: SparklesIcon,
    className: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  },
  Grandmaster: {
    icon: CrownIcon,
    className: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300",
  },
};

/** Rank tier pill derived from an Elo rating. */
export function RankBadge({
  elo,
  showElo = false,
  className,
}: {
  elo: number;
  showElo?: boolean;
  className?: string;
}) {
  const tier = getRankTier(elo);
  const { icon: Icon, className: tone } = TIER_STYLE[tier.name];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold",
        tone,
        className,
      )}
    >
      <Icon className="size-4" />
      {tier.name}
      {showElo && <span className="tabular opacity-75">· {elo}</span>}
    </span>
  );
}

/** Progress bar towards the next rank tier. */
export function TierProgress({ elo }: { elo: number }) {
  const tier = getRankTier(elo);
  return (
    <div>
      <div className="text-muted-foreground mb-1.5 flex justify-between text-xs">
        <span>{tier.name}</span>
        <span className="tabular">
          {tier.nextName ? `${tier.nextMin! - elo} Elo to ${tier.nextName}` : "Top tier"}
        </span>
      </div>
      <div
        className="bg-muted h-2 overflow-hidden rounded-full"
        role="progressbar"
        aria-label={`Progress to ${tier.nextName ?? "top tier"}`}
        aria-valuenow={Math.round(tier.progress * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className="bg-primary h-full rounded-full" style={{ width: `${tier.progress * 100}%` }} />
      </div>
    </div>
  );
}
