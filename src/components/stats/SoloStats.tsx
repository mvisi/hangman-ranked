"use client";

import { useQuery } from "convex/react";
import {
  ClockIcon,
  FlameIcon,
  GamepadIcon,
  PercentIcon,
} from "lucide-react";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import { StatGrid, StatTile } from "./StatTile";
import { EmptyStats, StatsSkeleton } from "./StatsView";
import { ActivityHeatmap } from "@/components/charts/ActivityHeatmap";
import {
  GuessingChart,
  LetterChart,
  MistakeDistribution,
  OpenersCard,
  ScoreTrendChart,
} from "@/components/charts/SoloCharts";
import { SectionTitle } from "@/components/Container";
import { formatDuration, formatPercent } from "@/lib/utils";

export default function SoloStats() {
  // Bucket days in the viewer's timezone.
  const [tzOffsetMinutes] = useState(() => new Date().getTimezoneOffset());
  const stats = useQuery(api.user.getSoloStats, { tzOffsetMinutes });

  if (stats === undefined) return <StatsSkeleton />;
  if (!stats || stats.summary.totalGames === 0) {
    return (
      <EmptyStats
        title="No solo games yet"
        description="Finish your first game and your statistics will start filling in here."
        href="/"
        cta="Play a game"
      />
    );
  }

  const { summary, records, averages, charts } = stats;

  return (
    <div className="mt-4 space-y-4">
      <StatGrid>
        <StatTile icon={GamepadIcon} label="Games" value={summary.totalGames} hint={`${summary.totalWins} won · ${summary.totalGames - summary.totalWins} lost`} />
        <StatTile icon={PercentIcon} label="Win rate" value={formatPercent(summary.winRate)} />
        <StatTile icon={FlameIcon} label="Win streak" value={summary.currentStreak} hint={`Best: ${summary.bestStreak}`} />
        <StatTile icon={ClockIcon} label="Time played" value={formatDuration(summary.timePlayedMs)} />
      </StatGrid>

      <section className="bg-card rounded-2xl border p-5 shadow-sm sm:p-6">
        <SectionTitle title="Personal records" />
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
          <Record label="Best score" value={records.bestScore || "–"} />
          <Record label="Fastest win" value={formatDuration(records.fastestWinMs)} />
          <Record
            label="Longest word solved"
            value={
              records.longestWord ? (
                <span className="font-mono uppercase">{records.longestWord}</span>
              ) : (
                "–"
              )
            }
          />
          <Record label="Fewest misses in a win" value={records.fewestMistakes ?? "–"} />
          <Record label="Flawless wins" value={records.flawlessWins} />
          <Record label="Most wins in a day" value={records.mostWinsInADay} />
        </dl>
      </section>

      <ActivityHeatmap values={charts.activity} />
      <ScoreTrendChart history={charts.history} />
      <GuessingChart history={charts.history} />

      <div className="grid gap-4 md:grid-cols-2">
        <MistakeDistribution data={charts.mistakeDistribution} />
        <OpenersCard openers={charts.openers} />
      </div>

      <LetterChart letters={charts.letters} />

      <section className="bg-card rounded-2xl border p-5 shadow-sm sm:p-6">
        <SectionTitle title="Averages" description="Wins only, compared with every finished game." />
        <div className="overflow-x-auto">
          <table className="tabular w-full text-sm">
            <thead>
              <tr className="text-muted-foreground border-b text-left">
                <th className="py-2 pr-4 font-medium"></th>
                <th className="py-2 pr-4 text-right font-medium">Score</th>
                <th className="py-2 pr-4 text-right font-medium">Word length</th>
                <th className="py-2 pr-4 text-right font-medium">Guesses</th>
                <th className="py-2 pr-4 text-right font-medium">Misses</th>
                <th className="py-2 pr-4 text-right font-medium">Accuracy</th>
                <th className="py-2 text-right font-medium">Time</th>
              </tr>
            </thead>
            <tbody>
              {(
                [
                  ["Wins", averages.won],
                  ["All games", averages.all],
                ] as const
              ).map(([label, a]) => (
                <tr key={label} className="border-b last:border-0">
                  <th className="py-2.5 pr-4 text-left font-medium">{label}</th>
                  <td className="py-2.5 pr-4 text-right">{a.score}</td>
                  <td className="py-2.5 pr-4 text-right">{a.wordLength}</td>
                  <td className="py-2.5 pr-4 text-right">{a.attempts}</td>
                  <td className="py-2.5 pr-4 text-right">{a.mistakes}</td>
                  <td className="py-2.5 pr-4 text-right">{a.accuracy}%</td>
                  <td className="py-2.5 text-right">{formatDuration(a.timeMs)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Record({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-muted-foreground text-sm">{label}</dt>
      <dd className="mt-0.5 text-xl font-semibold tracking-tight">{value}</dd>
    </div>
  );
}
