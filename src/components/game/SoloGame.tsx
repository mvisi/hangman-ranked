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
  const [forfeiting, setForfeiting] = useState(false);
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

  const giveUp = async () => {
    setForfeiting(true);
    try {
      await forfeit();
    } catch (e) {
      toast.error(errorMessage(e, "Couldn't give up"));
    } finally {
      setForfeiting(false);
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
              disabled={forfeiting}
              onClick={giveUp}
            >
              <FlagIcon /> Give up
            </Button>
          }
        />
      </Container>
    );
  }

  if (last && playedIds.includes(last._id)) {
    const won = last.result === "won";
    const tone =
      last.result === "won"
        ? "won"
        : last.result === "abandoned"
          ? "timeout"
          : last.result === "forfeit"
            ? "forfeit"
            : "lost";
    const title = won
      ? last.isPersonalBest
        ? "New personal best!"
        : "You got it!"
      : last.result === "abandoned"
        ? "Out of time"
        : last.result === "forfeit"
          ? "You gave up"
          : "Not this time";
    const subtitle = won
      ? `Solved in ${formatDuration(last.durationMs)}`
      : last.result === "abandoned"
        ? "The game ended after a minute without a guess."
        : "The word was:";

    return (
      <Container>
        <GameResult
          tone={tone}
          title={title}
          subtitle={subtitle}
          word={last.word}
          guessedLetters={won ? undefined : last.guessedLetters}
          stats={[
            { label: "Score", value: last.score },
            { label: "Guesses", value: last.attempts },
            { label: "Misses", value: last.mistakes },
            { label: "Time", value: formatDuration(last.durationMs) },
          ]}
          onPlayAgain={start}
        />
      </Container>
    );
  }

  const lastSummary = last
    ? last.result === "won"
      ? `won, ${last.score} pts`
      : last.result === "abandoned"
        ? "timed out"
        : last.result === "forfeit"
          ? "gave up"
          : "lost"
    : null;

  return (
    <Container>
      <StartPanel title="Solo game" rules={SOLO_RULES} onStart={start} loading={starting}>
        {last && (
          <p className="text-muted-foreground text-sm">
            Last game:{" "}
            <span className="text-foreground font-mono font-semibold uppercase">
              {last.word}
            </span>{" "}
            · {lastSummary}
          </p>
        )}
      </StartPanel>
    </Container>
  );
};

export default SoloGame;
