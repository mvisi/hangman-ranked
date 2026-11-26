"use client";

import { useMutation, useQuery } from "convex/react";
import { FunctionReturnType } from "convex/server";
import { FlagIcon, SwordsIcon, UsersIcon, XIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import { getRankTier, PLACEMENT_MATCHES } from "../../../convex/lib/elo";
import { MAX_MISTAKES, RANKED_TURN_TIMEOUT_MS } from "../../../convex/lib/game";
import GameBoard from "./GameBoard";
import GameResult, { ResultTone } from "./GameResult";
import LivesMeter from "./LivesMeter";
import StartPanel from "./StartPanel";
import TurnTimer from "./TurnTimer";
import Container from "@/components/Container";
import { PlayerLink } from "@/components/RecentGames";
import { RankBadge } from "@/components/stats/RankBadge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useElapsed } from "@/hooks/useServerClock";
import { cn, errorMessage, formatClock, formatSigned } from "@/lib/utils";

const HEARTBEAT_MS = 10_000;

const RANKED_RULES = [
  "You and your opponent race to solve the same word.",
  `First to reveal it wins. Make ${MAX_MISTAKES} mistakes and the win goes to them.`,
  `You have ${RANKED_TURN_TIMEOUT_MS / 1000} seconds for each guess.`,
];

type ActiveMatch = NonNullable<FunctionReturnType<typeof api.ranked.getActiveMatch>>;
type LastResult = NonNullable<FunctionReturnType<typeof api.ranked.getLastMatchResult>>;

/** Live Elo + placement badge for the ranked page header. */
export function RankedHeaderBadge({
  initialElo,
  initialGames,
}: {
  initialElo: number;
  initialGames: number;
}) {
  const user = useQuery(api.auth.loggedInUser);
  const elo = user?.elo ?? initialElo;
  const games = user?.ranked.games ?? initialGames;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <RankBadge elo={elo} showElo />
      {games < PLACEMENT_MATCHES && (
        <span className="bg-muted text-muted-foreground tabular rounded-full px-2.5 py-1 text-xs font-medium">
          Placement {games}/{PLACEMENT_MATCHES}
        </span>
      )}
    </div>
  );
}

const RankedGame = () => {
  const user = useQuery(api.auth.loggedInUser);
  const queue = useQuery(api.ranked.queueInfo);
  const match = useQuery(api.ranked.getActiveMatch);
  const last = useQuery(api.ranked.getLastMatchResult);

  const enterMatchmaking = useMutation(api.ranked.enterMatchmaking);
  const leaveMatchmaking = useMutation(api.ranked.exitMatchmaking);
  const heartbeat = useMutation(api.ranked.queueHeartbeat);

  const [joining, setJoining] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [playedIds, setPlayedIds] = useState<string[]>([]);
  if (match && !playedIds.includes(match._id)) {
    setPlayedIds([...playedIds, match._id]);
  }

  const isInQueue = !!queue?.isInQueue && !match;
  const isInQueueRef = useRef(isInQueue);
  useEffect(() => {
    isInQueueRef.current = isInQueue;
  }, [isInQueue]);

  // Keep our queue entry alive; leave the queue when navigating away.
  useEffect(() => {
    if (!isInQueue) return;
    void heartbeat();
    const interval = setInterval(() => void heartbeat(), HEARTBEAT_MS);
    const onHide = () => void leaveMatchmaking();
    window.addEventListener("pagehide", onHide);
    return () => {
      clearInterval(interval);
      window.removeEventListener("pagehide", onHide);
    };
  }, [isInQueue, heartbeat, leaveMatchmaking]);

  useEffect(() => {
    return () => {
      if (isInQueueRef.current) {
        void leaveMatchmaking();
      }
    };
  }, [leaveMatchmaking]);

  const join = async () => {
    setJoining(true);
    try {
      await enterMatchmaking();
    } catch (e) {
      toast.error(errorMessage(e, "Couldn't join matchmaking"));
    } finally {
      setJoining(false);
    }
  };

  const cancelQueue = async () => {
    setLeaving(true);
    try {
      await leaveMatchmaking();
    } catch (e) {
      toast.error(errorMessage(e, "Couldn't leave matchmaking"));
    } finally {
      setLeaving(false);
    }
  };

  if (queue === undefined || match === undefined || last === undefined) {
    return (
      <Container>
        <Skeleton className="mx-auto h-64 w-full max-w-xl" />
      </Container>
    );
  }

  if (match) {
    return <MatchView match={match} />;
  }

  if (isInQueue) {
    return (
      <Container>
        <QueueView
          since={queue.queueEntryTime}
          playersSearching={queue.playersSearching}
          leaving={leaving}
          onCancel={cancelQueue}
        />
      </Container>
    );
  }

  const rankedGames = user?.ranked.games;

  if (last && playedIds.includes(last._id)) {
    return (
      <Container>
        <MatchResult result={last} rankedGames={rankedGames} onPlayAgain={join} />
      </Container>
    );
  }

  const remainingPlacement =
    rankedGames !== undefined && rankedGames < PLACEMENT_MATCHES
      ? PLACEMENT_MATCHES - rankedGames
      : 0;

  return (
    <Container>
      <StartPanel
        title="Ranked match"
        rules={RANKED_RULES}
        onStart={join}
        startLabel="Find a match"
        loading={joining}
      >
        {queue.playersSearching > 0 && (
          <p className="text-success flex items-center gap-1.5 text-sm font-medium">
            <UsersIcon className="size-4" />
            {queue.playersSearching} {queue.playersSearching === 1 ? "player is" : "players are"}{" "}
            searching right now
          </p>
        )}
        {remainingPlacement > 0 && (
          <p className="text-muted-foreground text-xs">
            Placement: play {remainingPlacement} more{" "}
            {remainingPlacement === 1 ? "match" : "matches"} to appear on the leaderboard.
          </p>
        )}
      </StartPanel>
    </Container>
  );
};

function QueueView({
  since,
  playersSearching,
  leaving,
  onCancel,
}: {
  since?: number;
  playersSearching: number;
  leaving: boolean;
  onCancel: () => void;
}) {
  const elapsed = useElapsed(since);
  return (
    <div className="flex flex-col items-center gap-6 py-6 text-center" role="status">
      <div className="relative flex size-24 items-center justify-center">
        <span className="bg-primary/20 absolute inset-0 animate-ping rounded-full" />
        <span className="bg-primary/15 absolute inset-3 rounded-full" />
        <span className="bg-primary text-primary-foreground relative flex size-14 items-center justify-center rounded-full shadow-lg">
          <SwordsIcon className="size-6" />
        </span>
      </div>
      <div className="space-y-1">
        <h2 className="text-2xl font-bold tracking-tight">Finding an opponent…</h2>
        <p className="text-muted-foreground text-sm">
          We pair you with the closest rated player in the queue.
        </p>
      </div>
      <p className="tabular font-mono text-3xl font-semibold" aria-label="Time in queue">
        {formatClock(elapsed)}
      </p>
      <p className="text-muted-foreground text-sm">
        {playersSearching > 0
          ? `${playersSearching} other ${playersSearching === 1 ? "player" : "players"} searching`
          : "You're the only one searching. Invite a friend!"}
      </p>
      <Button variant="outline" disabled={leaving} onClick={onCancel}>
        <XIcon /> {leaving ? "Leaving…" : "Cancel"}
      </Button>
    </div>
  );
}

function MatchView({ match }: { match: ActiveMatch }) {
  const forfeit = useMutation(api.ranked.forfeitMatch);
  const makeGuess = useMutation(api.ranked.makeGuess).withOptimisticUpdate(
    (store, { guess }) => {
      const current = store.getQuery(api.ranked.getActiveMatch, {});
      if (!current || current.guessedLetters.includes(guess)) return;
      store.setQuery(api.ranked.getActiveMatch, {}, {
        ...current,
        guessedLetters: [...current.guessedLetters, guess],
      });
    },
  );

  return (
    <Container>
      <div className="mb-6 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <PlayerCard
          name="You"
          elo={match.myElo}
          revealed={match.revealed}
          wordLength={match.wordLength}
          mistakes={match.mistakes}
        />
        <span className="text-muted-foreground text-sm font-bold">VS</span>
        <PlayerCard
          name={match.opponent.name}
          elo={match.opponent.elo}
          image={match.opponent.image}
          revealed={match.opponent.revealed}
          wordLength={match.wordLength}
          mistakes={match.opponent.mistakes}
          align="right"
        />
      </div>
      <GameBoard
        state={match}
        onGuess={(letter) => {
          makeGuess({ guess: letter }).catch((e) =>
            toast.error(errorMessage(e, "Your guess didn't go through")),
          );
        }}
        top={
          <TurnTimer
            key={match.lastUpdate}
            deadline={match.deadline}
            totalMs={RANKED_TURN_TIMEOUT_MS}
          />
        }
        footer={
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="sm" className="text-muted-foreground">
                <FlagIcon /> Resign
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Resign this match?</AlertDialogTitle>
                <AlertDialogDescription>
                  {match.opponent.name} will be awarded the win and you&apos;ll lose Elo.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Keep playing</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => {
                    forfeit().catch((e) =>
                      toast.error(errorMessage(e, "Couldn't resign the match")),
                    );
                  }}
                >
                  Resign
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        }
      />
    </Container>
  );
}

function PlayerCard({
  name,
  elo,
  image,
  revealed,
  wordLength,
  mistakes,
  align = "left",
}: {
  name: string;
  elo: number;
  image?: string;
  revealed: number;
  wordLength: number;
  mistakes: number;
  align?: "left" | "right";
}) {
  const progress = wordLength ? revealed / wordLength : 0;
  return (
    <div
      className={cn(
        "bg-muted/40 min-w-0 rounded-xl border p-3",
        align === "right" && "text-right",
      )}
    >
      <div className={cn("flex items-center gap-2", align === "right" && "flex-row-reverse")}>
        {image !== undefined && (
          <Avatar className="size-7">
            <AvatarImage src={image} alt="" />
            <AvatarFallback>{name.slice(0, 2).toUpperCase()}</AvatarFallback>
          </Avatar>
        )}
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{name}</p>
          <p className="text-muted-foreground tabular text-xs">
            {getRankTier(elo).name} · {elo}
          </p>
        </div>
      </div>
      <div
        className="bg-muted mt-2.5 h-1.5 overflow-hidden rounded-full"
        role="progressbar"
        aria-label={`${name} has revealed ${revealed} of ${wordLength} letters`}
        aria-valuenow={revealed}
        aria-valuemax={wordLength}
      >
        <div
          className={cn(
            "bg-primary h-full rounded-full transition-all duration-500",
            align === "right" && "ml-auto",
          )}
          style={{ width: `${progress * 100}%` }}
        />
      </div>
      <div
        className={cn(
          "mt-2 flex items-center justify-between gap-2 text-xs",
          align === "right" && "flex-row-reverse",
        )}
      >
        <span className="tabular text-muted-foreground">
          {revealed}/{wordLength}
        </span>
        <LivesMeter mistakes={mistakes} size="sm" />
      </div>
    </div>
  );
}

function MatchResult({
  result,
  rankedGames,
  onPlayAgain,
}: {
  result: LastResult;
  rankedGames?: number;
  onPlayAgain: () => void;
}) {
  const opponent = <PlayerLink name={result.opponentName} className="text-foreground" />;
  const reasons: Record<string, [React.ReactNode, React.ReactNode]> = {
    solved: [
      <>You solved it first against {opponent}.</>,
      <>{opponent} solved it first.</>,
    ],
    failed: [
      <>{opponent} ran out of lives.</>,
      <>You ran out of lives against {opponent}.</>,
    ],
    timeout: [
      <>{opponent} ran out of time.</>,
      <>You ran out of time against {opponent}.</>,
    ],
    forfeit: [
      <>{opponent} resigned.</>,
      <>You resigned against {opponent}.</>,
    ],
  };
  const [winText, loseText] = reasons[result.endReason ?? "solved"];
  const tone: ResultTone = result.won
    ? "won"
    : result.endReason === "timeout"
      ? "timeout"
      : result.endReason === "forfeit"
        ? "forfeit"
        : "lost";

  const placementNote =
    rankedGames === undefined
      ? null
      : rankedGames < PLACEMENT_MATCHES
        ? `Placement ${rankedGames}/${PLACEMENT_MATCHES} · ${PLACEMENT_MATCHES - rankedGames} more to join the leaderboard`
        : rankedGames === PLACEMENT_MATCHES
          ? "Placement complete — you're now on the Elo leaderboard!"
          : null;

  return (
    <GameResult
      tone={tone}
      title={result.won ? "Victory!" : "Defeat"}
      subtitle={result.won ? winText : loseText}
      word={result.word}
      guessedLetters={result.guessedLetters}
      highlight={
        <div className="flex flex-col items-center gap-2">
          <p
            className={cn(
              "tabular rounded-full px-4 py-1.5 text-lg font-bold",
              result.eloChange >= 0 ? "bg-success-soft text-success" : "bg-danger-soft text-danger",
            )}
          >
            {formatSigned(result.eloChange)} Elo · now {result.eloAfter}
          </p>
          {placementNote && <p className="text-muted-foreground text-xs">{placementNote}</p>}
        </div>
      }
      stats={[
        { label: "Rank", value: getRankTier(result.eloAfter).name },
        { label: "Elo", value: result.eloAfter },
        { label: "Guesses", value: result.attempts },
        { label: "Misses", value: result.mistakes },
      ]}
      onPlayAgain={onPlayAgain}
      playAgainLabel="Find another match"
    />
  );
}

export default RankedGame;
