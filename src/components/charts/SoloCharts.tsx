"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useState } from "react";
import { axisProps, ChartCard, ChartTooltip, gridProps, movingAverage, Series } from "./ChartKit";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDuration } from "@/lib/utils";

export type HistoryPoint = {
  game: number;
  score: number;
  attempts: number;
  correct: number;
  wrong: number;
  accuracy: number;
  won: boolean;
  word: string;
  timeMs: number;
  date: number;
};

const gameLabel = (_: unknown, d: unknown) => {
  const p = d as HistoryPoint;
  return (
    <span>
      Game {p.game} · <span className="font-mono uppercase">{p.word}</span>{" "}
      <span className="text-muted-foreground font-normal">({p.won ? "won" : "lost"})</span>
    </span>
  );
};

const SCORE_SERIES: Series[] = [
  { key: "score", label: "Score", color: "var(--chart-1)" },
  { key: "trend", label: "5-game average", color: "var(--chart-2)" },
];

/** Score per game (bars) with a trailing average to show the trend. */
export function ScoreTrendChart({ history }: { history: HistoryPoint[] }) {
  const data = history.map((h, i) => ({
    ...h,
    trend: movingAverage(history, (r) => r.score)[i],
  }));
  return (
    <ChartCard
      title="Score trend"
      description={`Your last ${history.length} games. Lost games score 0.`}
      series={SCORE_SERIES}
      empty={history.length < 2 && "Finish a couple of games to see your score trend."}
      table={{
        columns: ["Game", "Word", "Result", "Score", "Time"],
        rows: history.map((h) => [h.game, h.word, h.won ? "Won" : "Lost", h.score, formatDuration(h.timeMs)]),
      }}
    >
      <div className="h-64 sm:h-72">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="game" {...axisProps} minTickGap={16} />
            <YAxis {...axisProps} width={44} allowDecimals={false} />
            <Tooltip
              cursor={{ fill: "var(--muted)", opacity: 0.6 }}
              content={(props) => (
                <ChartTooltip active={props.active}
                  payload={props.payload}
                  label={props.label} series={SCORE_SERIES} formatLabel={gameLabel} />
              )}
            />
            <Bar dataKey="score" fill="var(--chart-1)" radius={[4, 4, 0, 0]} maxBarSize={28} />
            <Line
              dataKey="trend"
              type="monotone"
              stroke="var(--chart-2)"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, stroke: "var(--card)", strokeWidth: 2 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}

const GUESS_SERIES: Series[] = [
  { key: "correct", label: "Correct guesses", color: "var(--chart-1)" },
  { key: "wrong", label: "Wrong guesses", color: "var(--chart-2)" },
];
const ACCURACY_SERIES: Series[] = [
  { key: "accuracy", label: "Accuracy", color: "var(--chart-1)" },
];

/** Guess breakdown per game, switchable to an accuracy line. */
export function GuessingChart({ history }: { history: HistoryPoint[] }) {
  const [view, setView] = useState<"guesses" | "accuracy">("guesses");
  return (
    <ChartCard
      title={view === "guesses" ? "Guesses per game" : "Guess accuracy"}
      description={
        view === "guesses"
          ? "Correct and wrong letters you guessed in each game."
          : "Share of your guesses that were in the word."
      }
      series={view === "guesses" ? GUESS_SERIES : ACCURACY_SERIES}
      empty={history.length < 2 && "Finish a couple of games to see how you guess."}
      action={
        <Tabs value={view} onValueChange={(v) => setView(v as typeof view)}>
          <TabsList>
            <TabsTrigger value="guesses">Guesses</TabsTrigger>
            <TabsTrigger value="accuracy">Accuracy</TabsTrigger>
          </TabsList>
        </Tabs>
      }
      table={{
        columns: ["Game", "Word", "Correct", "Wrong", "Accuracy"],
        rows: history.map((h) => [h.game, h.word, h.correct, h.wrong, `${h.accuracy}%`]),
      }}
    >
      <div className="h-64 sm:h-72">
        <ResponsiveContainer width="100%" height="100%">
          {view === "guesses" ? (
            <BarChart data={history} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="game" {...axisProps} minTickGap={16} />
              <YAxis {...axisProps} width={44} allowDecimals={false} />
              <Tooltip
                cursor={{ fill: "var(--muted)", opacity: 0.6 }}
                content={(props) => (
                  <ChartTooltip active={props.active}
                  payload={props.payload}
                  label={props.label} series={GUESS_SERIES} formatLabel={gameLabel} />
                )}
              />
              <Bar dataKey="correct" stackId="g" fill="var(--chart-1)" stroke="var(--card)" strokeWidth={1} maxBarSize={28} />
              <Bar dataKey="wrong" stackId="g" fill="var(--chart-2)" stroke="var(--card)" strokeWidth={1} radius={[4, 4, 0, 0]} maxBarSize={28} />
            </BarChart>
          ) : (
            <LineChart data={history} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="game" {...axisProps} minTickGap={16} />
              <YAxis {...axisProps} width={44} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
              <Tooltip
                cursor={{ stroke: "var(--muted-foreground)", strokeWidth: 1 }}
                content={(props) => (
                  <ChartTooltip
                    active={props.active}
                  payload={props.payload}
                  label={props.label}
                    series={ACCURACY_SERIES}
                    formatLabel={gameLabel}
                    formatValue={(v) => `${v}%`}
                  />
                )}
              />
              <Line
                dataKey="accuracy"
                type="monotone"
                stroke="var(--chart-1)"
                strokeWidth={2}
                dot={history.length <= 30 ? { r: 3, strokeWidth: 0, fill: "var(--chart-1)" } : false}
                activeDot={{ r: 5, stroke: "var(--card)", strokeWidth: 2 }}
              />
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}

const LETTER_SERIES: Series[] = [
  { key: "hits", label: "In the word", color: "var(--chart-1)" },
  { key: "misses", label: "Not in the word", color: "var(--chart-2)" },
];

/** How often each letter was guessed, split into hits and misses. */
export function LetterChart({
  letters,
}: {
  letters: { letter: string; hits: number; misses: number }[];
}) {
  const total = letters.reduce((acc, l) => acc + l.hits + l.misses, 0);
  return (
    <ChartCard
      title="Letters you guess"
      description="Every letter you've tried, and how often it was in the word."
      series={LETTER_SERIES}
      empty={total === 0 && "No guesses yet."}
      table={{
        columns: ["Letter", "In the word", "Not in the word", "Hit rate"],
        rows: letters
          .filter((l) => l.hits + l.misses > 0)
          .map((l) => [l.letter, l.hits, l.misses, `${Math.round((l.hits / (l.hits + l.misses)) * 100)}%`]),
      }}
    >
      <div className="h-56 sm:h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={letters} margin={{ top: 8, right: 4, left: -20, bottom: 0 }}>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="letter" {...axisProps} interval={0} tick={{ ...axisProps.tick, fontSize: 11 }} />
            <YAxis {...axisProps} width={44} allowDecimals={false} />
            <Tooltip
              cursor={{ fill: "var(--muted)", opacity: 0.6 }}
              content={(props) => (
                <ChartTooltip active={props.active}
                  payload={props.payload}
                  label={props.label} series={LETTER_SERIES} formatLabel={(l) => `Letter ${l}`} />
              )}
            />
            <Bar dataKey="hits" stackId="l" fill="var(--chart-1)" stroke="var(--card)" strokeWidth={1} />
            <Bar dataKey="misses" stackId="l" fill="var(--chart-2)" stroke="var(--card)" strokeWidth={1} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}

/** Wordle-style distribution: how many mistakes your wins took. */
export function MistakeDistribution({
  data,
}: {
  data: { mistakes: number; games: number }[];
}) {
  const max = Math.max(1, ...data.map((d) => d.games));
  const total = data.reduce((acc, d) => acc + d.games, 0);
  return (
    <ChartCard
      title="Mistakes per win"
      description="How many wrong guesses your wins needed."
      empty={total === 0 && "Win a game to see your distribution."}
    >
      <ul className="space-y-2" aria-label="Wins by number of mistakes">
        {data.map((d) => (
          <li key={d.mistakes} className="flex items-center gap-3 text-sm">
            <span className="text-muted-foreground tabular w-16 shrink-0 text-xs">
              {d.mistakes === 0 ? "Flawless" : `${d.mistakes} miss${d.mistakes === 1 ? "" : "es"}`}
            </span>
            <span className="flex-1">
              <span
                className="flex h-6 min-w-7 items-center justify-end rounded-r-md px-2 text-xs font-semibold text-white"
                style={{
                  width: `${Math.max(4, (d.games / max) * 100)}%`,
                  background: d.games ? "var(--chart-1)" : "var(--muted)",
                  color: d.games ? undefined : "var(--muted-foreground)",
                }}
              >
                {d.games}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </ChartCard>
  );
}

/** Opening letters: which first guesses you use and how they work out. */
export function OpenersCard({
  openers,
}: {
  openers: { letter: string; games: number; wins: number; winRate: number }[];
}) {
  return (
    <ChartCard
      title="Favourite openers"
      description="Your most common first guesses and their win rate."
      empty={openers.length === 0 && "No games yet."}
    >
      <ul className="divide-y">
        {openers.map((o) => (
          <li key={o.letter} className="flex items-center gap-3 py-2">
            <span className="bg-accent text-accent-foreground flex size-9 items-center justify-center rounded-lg font-mono text-lg font-bold">
              {o.letter}
            </span>
            <div className="flex-1">
              <div className="flex justify-between text-sm">
                <span>
                  {o.games} game{o.games === 1 ? "" : "s"}
                </span>
                <span className="tabular font-semibold">{o.winRate}% won</span>
              </div>
              <div className="bg-muted mt-1 h-1.5 overflow-hidden rounded-full">
                <div className="h-full rounded-full" style={{ width: `${o.winRate}%`, background: "var(--chart-1)" }} />
              </div>
            </div>
          </li>
        ))}
      </ul>
    </ChartCard>
  );
}

