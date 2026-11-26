import { CheckIcon, FlagIcon, TimerOffIcon, XIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const REASON_LABEL: Record<string, string> = {
  solved: "Solved",
  failed: "Out of lives",
  timeout: "Timed out",
  forfeit: "Resigned",
};

/** Win/loss pill: icon + label so the result never relies on colour alone. */
export function ResultBadge({
  result,
  reason,
}: {
  result: "won" | "lost" | "abandoned" | "forfeit";
  /** Ranked end reason, shown as a tooltip. */
  reason?: string;
}) {
  const Icon =
    result === "won"
      ? CheckIcon
      : result === "abandoned" || reason === "timeout"
        ? TimerOffIcon
        : result === "forfeit" || reason === "forfeit"
          ? FlagIcon
          : XIcon;
  const label =
    result === "won"
      ? "Won"
      : result === "abandoned"
        ? "Timed out"
        : result === "forfeit"
          ? "Gave up"
          : "Lost";

  return (
    <span
      title={reason ? REASON_LABEL[reason] : undefined}
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold",
        result === "won" ? "bg-success-soft text-success" : "bg-danger-soft text-danger",
      )}
    >
      <Icon className="size-3.5" strokeWidth={3} />
      {label}
    </span>
  );
}
