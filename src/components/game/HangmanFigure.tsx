"use client";

import { AnimatePresence, motion } from "motion/react";
import { MAX_MISTAKES } from "../../../convex/lib/game";
import { cn } from "@/lib/utils";

// Each mistake draws one body part, in this order.
const PARTS = [
  { key: "head", d: "M140 52 A18 18 0 1 1 140 88 A18 18 0 1 1 140 52" },
  { key: "body", d: "M140 88 L140 148" },
  { key: "leftArm", d: "M140 106 L114 128" },
  { key: "rightArm", d: "M140 106 L166 128" },
  { key: "leftLeg", d: "M140 148 L116 184" },
  { key: "rightLeg", d: "M140 148 L164 184" },
];

const HangmanFigure = ({
  mistakes = 0,
  className,
}: {
  mistakes?: number;
  className?: string;
}) => {
  const shown = Math.max(0, Math.min(mistakes, PARTS.length));
  const isDead = shown >= MAX_MISTAKES;

  return (
    <svg
      viewBox="0 0 200 240"
      role="img"
      aria-label={`Hangman: ${shown} of ${MAX_MISTAKES} mistakes`}
      className={cn("text-foreground h-auto w-full", className)}
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* Gallows */}
      <g stroke="currentColor" strokeWidth="6" opacity={0.85}>
        <path d="M20 226 L120 226" />
        <path d="M50 226 L50 18 L140 18 L140 52" />
        <path d="M50 54 L82 18" strokeWidth="4" opacity={0.6} />
      </g>

      <AnimatePresence initial={false}>
        {PARTS.slice(0, shown).map((part) => (
          <motion.path
            key={part.key}
            d={part.d}
            stroke={isDead ? "var(--danger)" : "currentColor"}
            strokeWidth="5"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35, ease: "easeOut" }}
          />
        ))}
        {isDead && (
          <motion.g
            key="eyes"
            stroke="var(--danger)"
            strokeWidth="2.5"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
          >
            <path d="M131 64 l6 6 M137 64 l-6 6 M143 64 l6 6 M149 64 l-6 6" />
          </motion.g>
        )}
      </AnimatePresence>
    </svg>
  );
};

export default HangmanFigure;
