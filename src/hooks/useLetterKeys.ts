"use client";

import { useEffect, useRef } from "react";

/**
 * Calls `onLetter` for physical a–z key presses. Ignores shortcuts (Ctrl/⌘/Alt),
 * auto-repeat and typing inside form fields.
 */
export function useLetterKeys(onLetter: (letter: string) => void, enabled = true) {
  const handler = useRef(onLetter);
  useEffect(() => {
    handler.current = onLetter;
  }, [onLetter]);

  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || event.repeat) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      const key = event.key.toLowerCase();
      if (/^[a-z]$/.test(key)) {
        event.preventDefault();
        handler.current(key);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled]);
}
