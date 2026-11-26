"use client";

import { cn } from "@/lib/utils";

const KEY_ROWS = [
  ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"],
  ["a", "s", "d", "f", "g", "h", "j", "k", "l"],
  ["z", "x", "c", "v", "b", "n", "m"],
];

type KeyboardProps = {
  onKeyPress?: (letter: string) => void;
  /** Every letter guessed so far, including ones still being confirmed. */
  guesses?: string[];
  correctGuesses?: string[];
  wrongGuesses?: string[];
  disabled?: boolean;
  className?: string;
};

const Keyboard = ({
  onKeyPress,
  guesses = [],
  correctGuesses = [],
  wrongGuesses = [],
  disabled = false,
  className,
}: KeyboardProps) => {
  return (
    <div
      className={cn("flex w-full max-w-lg flex-col gap-1.5 sm:gap-2", className)}
      role="group"
      aria-label="Letter keyboard"
    >
      {KEY_ROWS.map((row, rowIndex) => (
        <div key={rowIndex} className="flex justify-center gap-1.5 sm:gap-2">
          {row.map((key) => {
            const isCorrect = correctGuesses.includes(key);
            const isWrong = wrongGuesses.includes(key);
            const isPending = !isCorrect && !isWrong && guesses.includes(key);
            const isUsed = isCorrect || isWrong || isPending;

            return (
              <button
                key={key}
                type="button"
                onClick={() => onKeyPress?.(key)}
                disabled={disabled || isUsed}
                aria-label={`${key.toUpperCase()}${isCorrect ? ", in the word" : isWrong ? ", not in the word" : ""}`}
                className={cn(
                  "flex h-11 max-w-11 min-w-0 flex-1 items-center justify-center rounded-lg font-mono text-sm font-semibold uppercase transition-all select-none sm:h-12 sm:text-base",
                  "focus-visible:ring-ring/60 outline-none focus-visible:ring-[3px]",
                  !isUsed &&
                    "bg-secondary text-secondary-foreground border-border/60 hover:bg-accent cursor-pointer border-b-2 shadow-xs active:translate-y-px active:border-b-0 disabled:cursor-not-allowed disabled:opacity-50",
                  isCorrect && "bg-success text-white dark:text-black",
                  isWrong && "bg-danger-soft text-danger line-through decoration-2",
                  isPending && "bg-muted text-muted-foreground animate-pulse",
                )}
              >
                {key}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
};

export default Keyboard;
