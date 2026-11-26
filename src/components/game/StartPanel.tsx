"use client";

import { PlayIcon } from "lucide-react";
import { useEffect, useRef } from "react";
import { MAX_MISTAKES } from "../../../convex/lib/game";
import { Button } from "@/components/ui/button";

/** Idle state before a game: rules summary and a big start button. */
const StartPanel = ({
  title,
  rules,
  onStart,
  startLabel = "Start game",
  loading = false,
  children,
}: {
  title: string;
  rules: string[];
  onStart: () => void;
  startLabel?: string;
  loading?: boolean;
  children?: React.ReactNode;
}) => {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => ref.current?.focus(), []);

  return (
    <div className="flex flex-col items-center gap-6 py-4 text-center">
      <div className="space-y-2">
        <h2 className="text-2xl font-bold tracking-tight">{title}</h2>
        <ul className="text-muted-foreground mx-auto max-w-md space-y-1 text-sm">
          {rules.map((rule) => (
            <li key={rule}>{rule}</li>
          ))}
        </ul>
      </div>
      <Button ref={ref} size="xl" onClick={onStart} disabled={loading}>
        <PlayIcon className="fill-current" /> {startLabel}
      </Button>
      {children}
    </div>
  );
};

export const SOLO_RULES = [
  "Guess the hidden word one letter at a time.",
  `You can make ${MAX_MISTAKES - 1} mistakes; the ${MAX_MISTAKES}th ends the game.`,
  "Faster wins with fewer guesses score higher.",
];

export default StartPanel;
