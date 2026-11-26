"use client";

import { useEffect, useMemo, useRef } from "react";
import { ChartCard } from "./ChartKit";
import { cn } from "@/lib/utils";

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKS = 53;
const LEVELS = ["bg-heat-0", "bg-heat-1", "bg-heat-2", "bg-heat-3", "bg-heat-4"];

function localKey(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * GitHub-style calendar of games per day over the last year, on a single-hue
 * sequential ramp. Dates are bucketed in the viewer's timezone by the server.
 */
export function ActivityHeatmap({
  values,
}: {
  values: { date: string; count: number; wins: number }[];
}) {
  const scroller = useRef<HTMLDivElement>(null);
  // Show the most recent weeks first on narrow screens.
  useEffect(() => {
    if (scroller.current) scroller.current.scrollLeft = scroller.current.scrollWidth;
  }, []);

  const { weeks, months, max, activeDays, total } = useMemo(() => {
    const byDate = new Map(values.map((v) => [v.date, v]));
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    // Start on the Sunday 52 weeks before this week's Sunday.
    const start = new Date(today.getTime() - (today.getDay() + (WEEKS - 1) * 7) * DAY_MS);
    const max = Math.max(1, ...values.map((v) => v.count));

    const weeks: { key: string; date: Date; count: number; wins: number; future: boolean }[][] = [];
    const months: { label: string; week: number }[] = [];
    for (let w = 0; w < WEEKS; w++) {
      const week = [];
      for (let d = 0; d < 7; d++) {
        const date = new Date(start);
        date.setDate(start.getDate() + w * 7 + d);
        const key = localKey(date);
        const v = byDate.get(key);
        week.push({ key, date, count: v?.count ?? 0, wins: v?.wins ?? 0, future: date > today });
        if (date.getDate() === 1) {
          months.push({ label: date.toLocaleDateString(undefined, { month: "short" }), week: w });
        }
      }
      weeks.push(week);
    }
    const inRange = weeks.flat().filter((d) => !d.future && d.count > 0);
    return {
      weeks,
      months,
      max,
      activeDays: inRange.length,
      total: inRange.reduce((acc, d) => acc + d.count, 0),
    };
  }, [values]);

  const level = (count: number) =>
    count === 0 ? 0 : Math.min(4, Math.ceil((count / max) * 4));

  return (
    <ChartCard
      title="Activity"
      description={`${total} game${total === 1 ? "" : "s"} on ${activeDays} day${activeDays === 1 ? "" : "s"} in the last year.`}
    >
      <div ref={scroller} className="overflow-x-auto pb-2">
        <div className="relative w-max pt-5">
          <div className="text-muted-foreground absolute top-0 left-0 text-[10px]">
            {months.map((m) => (
              <span key={`${m.label}-${m.week}`} className="absolute" style={{ left: m.week * 14 }}>
                {m.label}
              </span>
            ))}
          </div>
          <div className="flex gap-[3px]" role="grid" aria-label="Games played per day">
            {weeks.map((week, w) => (
              <div key={w} className="flex flex-col gap-[3px]" role="row">
                {week.map((day) => (
                  <div
                    key={day.key}
                    role="gridcell"
                    title={
                      day.future
                        ? undefined
                        : `${day.count} game${day.count === 1 ? "" : "s"}${day.count ? ` (${day.wins} won)` : ""} on ${day.date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" })}`
                    }
                    aria-label={day.future ? undefined : `${day.key}: ${day.count} games`}
                    className={cn(
                      "size-[11px] rounded-[3px] transition-transform hover:scale-125",
                      day.future ? "bg-transparent" : LEVELS[level(day.count)],
                    )}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="text-muted-foreground mt-2 flex items-center justify-end gap-1.5 text-[11px]">
        Less
        {LEVELS.map((l) => (
          <span key={l} className={cn("size-[11px] rounded-[3px]", l)} />
        ))}
        More
      </div>
    </ChartCard>
  );
}
