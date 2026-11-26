"use client";

import type { TooltipContentProps } from "recharts";
import { cn } from "@/lib/utils";

/** Shared axis/grid styling: recessive chrome so the data leads. */
export const axisProps = {
  tickLine: false,
  axisLine: false,
  tick: { fill: "var(--muted-foreground)", fontSize: 12 },
  tickMargin: 8,
} as const;

export const gridProps = {
  stroke: "var(--chart-grid)",
  strokeDasharray: "0",
  vertical: false,
} as const;

export type Series = { key: string; label: string; color: string };

/** HTML legend: always present for 2+ series so identity isn't colour-only. */
export function ChartLegend({ series }: { series: Series[] }) {
  if (series.length < 2) return null;
  return (
    <ul className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-xs">
      {series.map((s) => (
        <li key={s.key} className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm" style={{ background: s.color }} />
          {s.label}
        </li>
      ))}
    </ul>
  );
}

type TooltipExtras = {
  series: Series[];
  formatLabel?: (label: unknown, datum: unknown) => React.ReactNode;
  formatValue?: (value: number, key: string) => React.ReactNode;
};

type TooltipState = Pick<
  Partial<TooltipContentProps<number, string>>,
  "active" | "payload" | "label"
>;

/** Card-style tooltip used by every chart. */
export function ChartTooltip({
  active,
  payload,
  label,
  series,
  formatLabel,
  formatValue = (v) => v.toLocaleString(),
}: TooltipState & TooltipExtras) {
  if (!active || !payload?.length) return null;
  const datum = payload[0]?.payload;
  return (
    <div className="bg-popover text-popover-foreground min-w-36 rounded-lg border px-3 py-2 text-xs shadow-lg">
      <div className="mb-1.5 font-semibold">
        {formatLabel ? formatLabel(label, datum) : String(label ?? "")}
      </div>
      <ul className="space-y-1">
        {series.map((s) => {
          const entry = payload.find((p) => p.dataKey === s.key);
          if (!entry || entry.value === undefined || entry.value === null) return null;
          return (
            <li key={s.key} className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground flex items-center gap-1.5">
                <span className="size-2 rounded-full" style={{ background: s.color }} />
                {s.label}
              </span>
              <span className="tabular font-semibold">
                {formatValue(Number(entry.value), s.key)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * Titled chart panel with an optional legend and an accessible "view data"
 * table under a disclosure.
 */
export function ChartCard({
  title,
  description,
  series = [],
  action,
  table,
  empty,
  children,
  className,
}: {
  title: string;
  description?: string;
  series?: Series[];
  action?: React.ReactNode;
  table?: { columns: string[]; rows: (string | number)[][] };
  /** Shown instead of the chart when there's not enough data. */
  empty?: string | false;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("bg-card rounded-2xl border p-5 shadow-sm sm:p-6", className)}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold tracking-tight">{title}</h3>
          {description && <p className="text-muted-foreground text-sm">{description}</p>}
        </div>
        {action}
      </div>
      {empty ? (
        <div className="text-muted-foreground flex h-48 items-center justify-center rounded-xl border border-dashed text-sm">
          {empty}
        </div>
      ) : (
        <>
          {series.length > 1 && (
            <div className="mb-3">
              <ChartLegend series={series} />
            </div>
          )}
          {children}
          {table && table.rows.length > 0 && (
            <details className="group mt-3">
              <summary className="text-muted-foreground hover:text-foreground cursor-pointer text-xs font-medium select-none">
                View data as table
              </summary>
              <div className="mt-2 max-h-64 overflow-auto rounded-lg border">
                <table className="tabular w-full text-xs">
                  <thead className="bg-muted sticky top-0">
                    <tr>
                      {table.columns.map((c) => (
                        <th key={c} className="px-3 py-1.5 text-left font-medium">
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {table.rows.map((row, i) => (
                      <tr key={i} className="border-t">
                        {row.map((cell, j) => (
                          <td key={j} className="px-3 py-1.5">
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}
        </>
      )}
    </section>
  );
}

/** Trailing moving average, used to show trends in noisy per-game series. */
export function movingAverage<T>(rows: T[], get: (row: T) => number, window = 5) {
  return rows.map((_, i) => {
    const slice = rows.slice(Math.max(0, i - window + 1), i + 1);
    return Math.round(slice.reduce((acc, r) => acc + get(r), 0) / slice.length);
  });
}
