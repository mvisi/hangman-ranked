"use client";

import Link from "next/link";
import { useState } from "react";
import { words } from "../../../convex/data/allWords";
import {
  applyGuess,
  calculateScore,
  GuessOutcome,
  maskWord,
  pickRandomWord,
} from "../../../convex/lib/game";
import GameBoard from "./GameBoard";
import GameResult from "./GameResult";
import StartPanel, { SOLO_RULES } from "./StartPanel";
import Container from "@/components/Container";
import { Button } from "@/components/ui/button";
import { formatDuration } from "@/lib/utils";

type GuestState = Omit<GuessOutcome, "letter" | "isCorrect"> & {
  startTime: number;
  endTime?: number;
  score: number;
};

function newGame(): GuestState {
  return {
    word: pickRandomWord(words),
    guessedLetters: [],
    correctGuesses: [],
    wrongGuesses: [],
    attempts: 0,
    mistakes: 0,
    isWon: false,
    isLost: false,
    isCompleted: false,
    startTime: Date.now(),
    score: 0,
  };
}

/** Local-only game for visitors who aren't signed in. */
const GuestGame = () => {
  const [game, setGame] = useState<GuestState | null>(null);

  const guess = (letter: string) => {
    setGame((current) => {
      if (!current || current.isCompleted || current.guessedLetters.includes(letter)) {
        return current;
      }
      const outcome = applyGuess(current, letter);
      const endTime = outcome.isCompleted ? Date.now() : undefined;
      return {
        ...current,
        ...outcome,
        endTime,
        score: outcome.isWon
          ? calculateScore({
              wordLength: outcome.word.length,
              attempts: outcome.attempts,
              mistakes: outcome.mistakes,
              timeMs: endTime! - current.startTime,
            })
          : 0,
      };
    });
  };

  const signInNudge = (
    <p className="text-muted-foreground max-w-sm text-sm">
      <Link href="/sign-in" className="text-primary font-medium hover:underline">
        Sign in
      </Link>{" "}
      to save your scores, appear on the leaderboard and play ranked matches.
    </p>
  );

  if (!game) {
    return (
      <Container>
        <StartPanel title="Play as a guest" rules={SOLO_RULES} onStart={() => setGame(newGame())}>
          {signInNudge}
        </StartPanel>
      </Container>
    );
  }

  if (game.isCompleted) {
    const time = (game.endTime ?? game.startTime) - game.startTime;
    return (
      <Container>
        <GameResult
          tone={game.isWon ? "won" : "lost"}
          title={game.isWon ? "You got it!" : "Not this time"}
          subtitle={game.isWon ? `Solved in ${formatDuration(time)}` : "The word was:"}
          word={game.word}
          guessedLetters={game.isWon ? undefined : game.guessedLetters}
          stats={[
            { label: "Score", value: game.score },
            { label: "Guesses", value: game.attempts },
            { label: "Misses", value: game.mistakes },
            { label: "Time", value: formatDuration(time) },
          ]}
          highlight={signInNudge}
          onPlayAgain={() => setGame(newGame())}
          secondaryAction={
            <Button asChild variant="outline" size="xl">
              <Link href="/sign-in">Sign in</Link>
            </Button>
          }
        />
      </Container>
    );
  }

  return (
    <Container>
      <GameBoard
        state={{ ...game, displayWord: maskWord(game.word, game.guessedLetters) }}
        onGuess={guess}
      />
    </Container>
  );
};

export default GuestGame;
