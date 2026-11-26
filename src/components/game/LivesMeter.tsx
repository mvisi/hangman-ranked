import { HeartIcon } from "lucide-react";
import { MAX_MISTAKES } from "../../../convex/lib/game";
import { cn } from "@/lib/utils";

/** Remaining lives as hearts, with a text label for screen readers. */
const LivesMeter = ({
  mistakes,
  size = "md",
  className,
}: {
  mistakes: number;
  size?: "sm" | "md";
  className?: string;
}) => {
  const lives = Math.max(0, MAX_MISTAKES - mistakes);
  return (
    <div
      className={cn("flex items-center gap-0.5", className)}
      role="img"
      aria-label={`${lives} of ${MAX_MISTAKES} lives left`}
    >
      {Array.from({ length: MAX_MISTAKES }, (_, i) => (
        <HeartIcon
          key={i}
          className={cn(
            "transition-all",
            size === "sm" ? "size-3.5" : "size-5",
            i < lives
              ? "fill-danger text-danger"
              : "text-muted-foreground/40 scale-90",
          )}
        />
      ))}
    </div>
  );
};

export default LivesMeter;
