import { cn } from "@/lib/utils";

/** A single headline number with its label. */
export function StatTile({
  label,
  value,
  hint,
  icon: Icon,
  className,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  className?: string;
}) {
  return (
    <div className={cn("bg-card rounded-xl border p-4 shadow-xs", className)}>
      <div className="text-muted-foreground flex items-center gap-1.5 text-sm font-medium">
        {Icon && <Icon className="size-4" />}
        {label}
      </div>
      <div className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">{value}</div>
      {hint && <div className="text-muted-foreground mt-0.5 text-xs">{hint}</div>}
    </div>
  );
}

export function StatGrid({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("grid grid-cols-2 gap-3 lg:grid-cols-4", className)}>{children}</div>
  );
}
