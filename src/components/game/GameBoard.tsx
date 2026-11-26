"use client";

import { accuracy } from "../../../convex/lib/game";
import HangmanFigure from "./HangmanFigure";
import Keyboard from "./Keyboard";
import LivesMeter from "./LivesMeter";
import WordDisplay from "./WordDisplay";
import { useLetterKeys } from "@/hooks/useLetterKeys";
import { cn } from "@/lib/utils";

export type BoardState = {
  displayWord: string[];
  guessedLetters: string[];
  correctGuesses: string[];
  wrongGuesses: string[];
  attempts: number;
  mistakes: number;
};

/**
 * The playable surface shared by solo, guest and ranked games: gallows, word,
 * lives and keyboard. Physical keyboard input is wired up here.
 */
const GameBoard = ({
  state,
  onGuess,
  disabled = false,
  top,
  footer,
  className,
}: {
  state: BoardState;
  onGuess: (letter: string) => void;
  disabled?: boolean;
  /** Rendered above the word (timers, opponent progress…). */
  top?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}) => {
  const guess = (letter: string) => {
    if (disabled || state.guessedLetters.includes(letter)) return;
    onGuess(letter);
  };
  useLetterKeys(guess, !disabled);

  return (
    <div
      className={cn(
        "grid items-center gap-6 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] md:gap-10",
        className,
      )}
    >
      <div className="flex items-center gap-4 md:flex-col md:items-stretch">
        <div className="bg-muted/40 w-28 shrink-0 rounded-xl border p-2 sm:w-36 md:w-full md:p-6">
          <HangmanFigure mistakes={state.mistakes} className="mx-auto max-w-60" />
        </div>
        <dl className="grid flex-1 grid-cols-2 gap-2 md:gap-3">
          <Stat label="Lives">
            <LivesMeter mistakes={state.mistakes} size="sm" className="mt-1" />
          </Stat>
          <Stat label="Accuracy">
            <span className="tabular text-xl font-semibold">
              {state.attempts ? `${accuracy(state.correctGuesses.length, state.attempts)}%` : "–"}
            </span>
          </Stat>
          <Stat label="Guesses">
            <span className="tabular text-xl font-semibold">{state.attempts}</span>
          </Stat>
          <Stat label="Misses">
            <span className="tabular text-xl font-semibold">{state.mistakes}</span>
          </Stat>
        </dl>
      </div>

      <div className="flex flex-col items-center gap-6">
        {top}
        <WordDisplay displayWord={state.displayWord} className="py-2" />
        <Keyboard
          guesses={state.guessedLetters}
          correctGuesses={state.correctGuesses}
          wrongGuesses={state.wrongGuesses}
          onKeyPress={guess}
          disabled={disabled}
        />
        {footer}
        <p className="text-muted-foreground hidden text-xs md:block">
          Tip: type letters on your keyboard to guess.
        </p>
      </div>
    </div>
  );
};

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="bg-muted/40 rounded-lg border px-3 py-2">
      <dt className="text-muted-foreground text-xs font-medium">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

export default GameBoard;
