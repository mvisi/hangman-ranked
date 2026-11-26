"use client";

import { useMutation, useQuery } from "convex/react";
import { FlagIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import { SOLO_TURN_TIMEOUT_MS } from "../../../convex/lib/game";
import GameBoard from "./GameBoard";
import GameResult from "./GameResult";
import StartPanel, { SOLO_RULES } from "./StartPanel";
import TurnTimer from "./TurnTimer";
import Container from "@/components/Container";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage, formatDuration } from "@/lib/utils";

const SoloGame = () => {
  const game = useQuery(api.game.getActiveGame);
  const last = useQuery(api.game.getLastGame);
  const createGame = useMutation(api.game.createGame);
  const forfeit = useMutation(api.game.forfeitGame);
  const makeGuess = useMutation(api.game.makeGuess).withOptimisticUpdate(
    (store, { guess }) => {
      // Mark the key as guessed immediately; the server fills in the result.
      const current = store.getQuery(api.game.getActiveGame, {});
      if (!current || current.guessedLetters.includes(guess)) return;
      store.setQuery(api.game.getActiveGame, {}, {
        ...current,
        guessedLetters: [...current.guessedLetters, guess],
      });
    },
  );

  const [starting, setStarting] = useState(false);
  // Games played in this visit, so we can celebrate the one that just ended.
  const [playedIds, setPlayedIds] = useState<string[]>([]);
  if (game && !playedIds.includes(game._id)) {
    setPlayedIds([...playedIds, game._id]);
  }

  const start = async () => {
    setStarting(true);
    try {
      await createGame();
    } catch (e) {
      toast.error(errorMessage(e, "Couldn't start a game"));
    } finally {
      setStarting(false);
    }
  };

  if (game === undefined || last === undefined) {
    return (
      <Container>
        <Skeleton className="mx-auto h-64 w-full max-w-xl" />
      </Container>
    );
  }

  if (game) {
    return (
      <Container>
        <GameBoard
          state={game}
          onGuess={(letter) => {
            makeGuess({ guess: letter }).catch((e) =>
              toast.error(errorMessage(e, "Your guess didn't go through")),
            );
          }}
          top={
            <TurnTimer
              key={game.lastUpdate}
              deadline={game.deadline}
              totalMs={SOLO_TURN_TIMEOUT_MS}
            />
          }
          footer={
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={() => forfeit()}
            >
              <FlagIcon /> Give up
            </Button>
          }
        />
      </Container>
    );
  }

  if (last && playedIds.includes(last._id)) {
    return (
      <Container>
        <GameResult
          tone={last.isWon ? "won" : last.isAbandoned ? "timeout" : "lost"}
          title={
            last.isWon
              ? last.isPersonalBest
                ? "New personal best!"
                : "You got it!"
              : last.isAbandoned
                ? "Out of time"
                : "Not this time"
          }
          subtitle={
            last.isWon
              ? `Solved in ${formatDuration(last.totalTime)}`
              : last.isAbandoned
                ? "The game ended after a minute without a guess."
                : "The word was:"
          }
          word={last.word}
          guessedLetters={last.isWon ? undefined : last.guessedLetters}
          stats={[
            { label: "Score", value: last.score },
            { label: "Guesses", value: last.attempts },
            { label: "Misses", value: last.mistakes },
            { label: "Time", value: formatDuration(last.totalTime) },
          ]}
          onPlayAgain={start}
        />
      </Container>
    );
  }

  return (
    <Container>
      <StartPanel title="Solo game" rules={SOLO_RULES} onStart={start} loading={starting}>
        {last && (
          <p className="text-muted-foreground text-sm">
            Last game:{" "}
            <span className="text-foreground font-mono font-semibold uppercase">
              {last.word}
            </span>{" "}
            · {last.isWon ? `won, ${last.score} pts` : "lost"}
          </p>
        )}
      </StartPanel>
    </Container>
  );
};

export default SoloGame;
