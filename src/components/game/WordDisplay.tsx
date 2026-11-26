import { cn } from "@/lib/utils";

/**
 * The word as a row of letter tiles. Pass `solution` once the game is over to
 * reveal letters the player missed.
 */
const WordDisplay = ({
  displayWord,
  solution,
  className,
}: {
  displayWord: string[];
  solution?: string;
  className?: string;
}) => {
  const letters = solution ? solution.split("") : displayWord;
  const revealedCount = displayWord.filter((l) => l !== "_").length;

  return (
    <div className={cn("w-full", className)}>
      <p className="sr-only" aria-live="polite">
        {solution
          ? `The word was ${solution}`
          : `${revealedCount} of ${displayWord.length} letters revealed: ${displayWord
              .map((l) => (l === "_" ? "blank" : l))
              .join(", ")}`}
      </p>
      <div
        aria-hidden="true"
        className="flex flex-wrap justify-center gap-1.5 sm:gap-2"
      >
        {letters.map((letter, i) => {
          const guessed = displayWord[i] !== "_" && displayWord[i] !== undefined;
          const missed = !!solution && !guessed;
          return (
            <span
              key={i}
              className={cn(
                "flex h-12 w-9 items-center justify-center rounded-lg border-b-4 font-mono text-2xl font-bold uppercase sm:h-14 sm:w-11 sm:text-3xl",
                guessed
                  ? "bg-accent text-accent-foreground border-primary animate-pop"
                  : "bg-muted/60 border-border",
                missed && "border-danger text-danger bg-danger-soft",
              )}
            >
              {guessed || missed ? letter : ""}
            </span>
          );
        })}
      </div>
    </div>
  );
};

export default WordDisplay;
