"use client";

import { CircleXIcon, FlagIcon, PartyPopperIcon, TimerOffIcon } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useRef } from "react";
import WordDisplay from "./WordDisplay";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ResultTone = "won" | "lost" | "timeout" | "forfeit";

const TONES: Record<
  ResultTone,
  { icon: typeof PartyPopperIcon; className: string }
> = {
  won: { icon: PartyPopperIcon, className: "bg-success-soft text-success" },
  lost: { icon: CircleXIcon, className: "bg-danger-soft text-danger" },
  timeout: { icon: TimerOffIcon, className: "bg-danger-soft text-danger" },
  forfeit: { icon: FlagIcon, className: "bg-danger-soft text-danger" },
};

/** End-of-game summary with the revealed word and a call to play again. */
const GameResult = ({
  tone,
  title,
  subtitle,
  word,
  guessedLetters,
  stats,
  highlight,
  onPlayAgain,
  playAgainLabel = "Play again",
  secondaryAction,
  className,
}: {
  tone: ResultTone;
  title: string;
  subtitle?: React.ReactNode;
  word: string;
  /** Letters the player found; the rest are shown as missed. */
  guessedLetters?: string[];
  stats: { label: string; value: React.ReactNode }[];
  highlight?: React.ReactNode;
  onPlayAgain: () => void;
  playAgainLabel?: string;
  secondaryAction?: React.ReactNode;
  className?: string;
}) => {
  const { icon: Icon, className: toneClass } = TONES[tone];
  const playAgainRef = useRef<HTMLButtonElement>(null);
  useEffect(() => playAgainRef.current?.focus(), []);

  const displayWord = word
    .split("")
    .map((l) => (!guessedLetters || guessedLetters.includes(l) ? l : "_"));

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn("flex flex-col items-center gap-6 text-center", className)}
      role="status"
    >
      <div className={cn("flex size-14 items-center justify-center rounded-2xl", toneClass)}>
        <Icon className="size-7" />
      </div>
      <div className="space-y-1">
        <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h2>
        {subtitle && <p className="text-muted-foreground">{subtitle}</p>}
      </div>

      <WordDisplay displayWord={displayWord} solution={word} />

      {highlight}

      <dl className="grid w-full max-w-md grid-cols-2 gap-2 sm:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="bg-muted/40 rounded-lg border px-3 py-2">
            <dt className="text-muted-foreground text-xs">{stat.label}</dt>
            <dd className="tabular text-lg font-semibold">{stat.value}</dd>
          </div>
        ))}
      </dl>

      <div className="flex flex-wrap justify-center gap-2">
        <Button ref={playAgainRef} size="xl" onClick={onPlayAgain}>
          {playAgainLabel}
        </Button>
        {secondaryAction}
      </div>
    </motion.div>
  );
};

export default GameResult;
