"use client";

import { useQuery } from "convex/react";
import { FlameIcon, PercentIcon, SwordsIcon, TargetIcon } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import { RankBadge, TierProgress } from "./RankBadge";
import { StatGrid, StatTile } from "./StatTile";
import { EmptyStats, StatsSkeleton } from "./StatsView";
import { EloChart } from "@/components/charts/EloChart";
import { SectionTitle } from "@/components/Container";
import { PlayerLink, RecentRankedGames } from "@/components/RecentGames";
import { cn, formatPercent } from "@/lib/utils";

export default function RankedStats() {
  const stats = useQuery(api.user.getRankedStats);

  if (stats === undefined) return <StatsSkeleton />;
  if (!stats || stats.summary.games === 0) {
    return (
      <EmptyStats
        title="No ranked matches yet"
        description="Play a ranked match to get your Elo history, form and rivals."
        href="/ranked"
        cta="Find a match"
      />
    );
  }

  const { summary, outcomes, eloHistory, form, rivals } = stats;
  const remainingPlacement = Math.max(0, summary.placement.required - summary.placement.played);

  return (
    <div className="mt-4 space-y-4">
      <section className="bg-card grid gap-6 rounded-2xl border p-5 shadow-sm sm:grid-cols-[auto_1fr] sm:items-center sm:p-6">
        <div>
          <RankBadge elo={summary.elo} />
          <p className="tabular mt-2 text-5xl font-bold tracking-tight">{summary.elo}</p>
          <p className="text-muted-foreground text-sm">
            {summary.position
              ? `#${summary.position} on the leaderboard`
              : `Placement ${summary.placement.played}/${summary.placement.required}`}{" "}
            · peak {summary.peakElo}
          </p>
        </div>
        <div className="space-y-4">
          <TierProgress elo={summary.elo} />
          {remainingPlacement > 0 && (
            <p className="text-muted-foreground text-xs">
              Play{" "}
              <span className="text-foreground font-medium">
                {remainingPlacement} more {remainingPlacement === 1 ? "match" : "matches"}
              </span>{" "}
              to qualify for the Elo leaderboard.
            </p>
          )}
        </div>
      </section>

      <StatGrid>
        <StatTile icon={SwordsIcon} label="Matches" value={summary.games} hint={`${summary.wins}W · ${summary.losses}L`} />
        <StatTile icon={PercentIcon} label="Win rate" value={formatPercent(summary.winRate)} />
        <StatTile icon={FlameIcon} label="Win streak" value={summary.currentStreak} hint={`Best: ${summary.bestStreak}`} />
        <StatTile icon={TargetIcon} label="Avg. misses" value={summary.avgMistakes} hint={`${summary.avgAttempts} guesses per match`} />
      </StatGrid>

      <EloChart data={eloHistory} />

      <div className="grid gap-4 md:grid-cols-2">
        <section className="bg-card rounded-2xl border p-5 shadow-sm sm:p-6">
          <SectionTitle title="Recent form" description="Your last 10 matches, oldest first." />
          <ol className="flex flex-wrap gap-1.5">
            {form.map((f) => (
              <li
                key={f._id}
                title={`${f.won ? "Won" : "Lost"} vs ${f.opponent}`}
                className={cn(
                  "flex size-8 items-center justify-center rounded-md text-xs font-bold",
                  f.won ? "bg-success-soft text-success" : "bg-danger-soft text-danger",
                )}
              >
                {f.won ? "W" : "L"}
              </li>
            ))}
          </ol>
          <div className="mt-6 grid grid-cols-[1fr_auto] gap-x-6 gap-y-2 text-sm">
            <p className="text-muted-foreground col-span-2 text-xs font-semibold tracking-wide uppercase">
              How you win
            </p>
            <Outcome label="Solved first" value={outcomes.solved} />
            <Outcome label="Opponent ran out of lives" value={outcomes.opponentFailed} />
            <Outcome label="Opponent timed out or resigned" value={outcomes.opponentTimedOut} />
            <p className="text-muted-foreground col-span-2 mt-3 text-xs font-semibold tracking-wide uppercase">
              How you lose
            </p>
            <Outcome label="Opponent solved first" value={outcomes.outsolved} />
            <Outcome label="Ran out of lives" value={outcomes.failed} />
            <Outcome label="Timed out or resigned" value={outcomes.timedOut} />
          </div>
        </section>

        <section className="bg-card rounded-2xl border p-5 shadow-sm sm:p-6">
          <SectionTitle title="Rivals" description="Players you've faced the most." />
          {rivals.length === 0 ? (
            <p className="text-muted-foreground text-sm">No rivals yet.</p>
          ) : (
            <ul className="divide-y">
              {rivals.map((r) => (
                <li key={r.name} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <PlayerLink name={r.name} className="truncate" />
                  <span className="tabular text-muted-foreground shrink-0">
                    <span className="text-foreground font-semibold">
                      {r.wins}–{r.games - r.wins}
                    </span>{" "}
                    in {r.games}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <RecentRankedGames />
    </div>
  );
}

function Outcome({ label, value }: { label: string; value: number }) {
  return (
    <>
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular text-right font-semibold">{value}</span>
    </>
  );
}
