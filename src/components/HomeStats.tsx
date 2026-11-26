"use client";

import { useQuery } from "convex/react";
import { ArrowRightIcon, FlameIcon, GamepadIcon, PercentIcon, StarIcon } from "lucide-react";
import Link from "next/link";
import { api } from "../../convex/_generated/api";
import { StatGrid, StatTile } from "@/components/stats/StatTile";
import { Skeleton } from "@/components/ui/skeleton";
import { formatPercent } from "@/lib/utils";

export default function HomeStats() {
  const stats = useQuery(api.user.getUserStats);

  if (stats === undefined) {
    return (
      <StatGrid className="mt-6">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </StatGrid>
    );
  }
  if (!stats) return null;

  return (
    <div className="mt-6">
      <StatGrid>
        <StatTile icon={GamepadIcon} label="Games" value={stats.totalGames} hint={`${stats.totalWins} won`} />
        <StatTile icon={PercentIcon} label="Win rate" value={formatPercent(stats.winRate)} />
        <StatTile icon={StarIcon} label="Best score" value={stats.bestScore} />
        <StatTile
          icon={FlameIcon}
          label="Win streak"
          value={stats.currentStreak}
          hint={stats.currentStreak > 0 ? "Keep it going!" : "Win a game to start one"}
        />
      </StatGrid>
      <div className="mt-2 flex justify-end">
        <Link
          href="/stats"
          className="text-primary inline-flex items-center gap-1 text-sm font-medium hover:underline"
        >
          All statistics <ArrowRightIcon className="size-4" />
        </Link>
      </div>
    </div>
  );
}
