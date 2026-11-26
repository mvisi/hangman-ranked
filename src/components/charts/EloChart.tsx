"use client";

import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { axisProps, ChartCard, ChartTooltip, gridProps, Series } from "./ChartKit";
import { formatDate, formatSigned } from "@/lib/utils";

type EloPoint = { game: number; elo: number; eloChange: number; date: number };

const SERIES: Series[] = [{ key: "elo", label: "Elo", color: "var(--chart-1)" }];

/** Rating after every ranked match, with the starting rating as a baseline. */
export function EloChart({
  data,
  title = "Elo history",
  description = "Your rating after each ranked match.",
}: {
  data: EloPoint[];
  title?: string;
  description?: string;
}) {
  const start = data[0]?.elo ?? 0;
  const elos = data.map((d) => d.elo);
  const min = Math.min(...elos);
  const max = Math.max(...elos);
  const pad = Math.max(10, Math.round((max - min) * 0.15));

  return (
    <ChartCard
      title={title}
      description={description}
      empty={data.length < 2 && "Play a ranked match to start your Elo history."}
      table={{
        columns: ["Match", "Elo", "Change", "Date"],
        rows: data.slice(1).map((d) => [d.game, d.elo, formatSigned(d.eloChange), formatDate(d.date)]),
      }}
    >
      <div className="h-64 sm:h-72">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
            <defs>
              <linearGradient id="elo-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.25} />
                <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="game" {...axisProps} allowDecimals={false} minTickGap={24} />
            <YAxis {...axisProps} width={48} domain={[min - pad, max + pad]} allowDecimals={false} />
            <ReferenceLine y={start} stroke="var(--muted-foreground)" strokeDasharray="4 4" strokeOpacity={0.6} />
            <Tooltip
              cursor={{ stroke: "var(--muted-foreground)", strokeWidth: 1 }}
              content={(props) => (
                <ChartTooltip
                  active={props.active}
                  payload={props.payload}
                  label={props.label}
                  series={SERIES}
                  formatLabel={(_, d) => {
                    const p = d as EloPoint;
                    return p.game === 0
                      ? "Starting rating"
                      : `Match ${p.game} · ${formatSigned(p.eloChange)}`;
                  }}
                />
              )}
            />
            <Area
              type="monotone"
              dataKey="elo"
              stroke="var(--chart-1)"
              strokeWidth={2}
              fill="url(#elo-fill)"
              dot={data.length <= 30 ? { r: 3, strokeWidth: 0, fill: "var(--chart-1)" } : false}
              activeDot={{ r: 5, stroke: "var(--card)", strokeWidth: 2 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}
