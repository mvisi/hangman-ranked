/**
 * Pure, framework-agnostic game rules shared by the Convex backend and the
 * Next.js client (guest mode, optimistic updates). Keep this file free of any
 * Convex/React imports so it can run anywhere.
 */

export const MAX_MISTAKES = 6;
export const MIN_WORD_LENGTH = 5;

/** A solo game is abandoned after this long without a guess. */
export const SOLO_TURN_TIMEOUT_MS = 60_000;
/** A ranked player loses after this long without a guess. */
export const RANKED_TURN_TIMEOUT_MS = 30_000;

export const ALPHABET = "abcdefghijklmnopqrstuvwxyz".split("");

export type GuessState = {
  word: string;
  guessedLetters: string[];
  correctGuesses: string[];
  wrongGuesses: string[];
  attempts: number;
  mistakes: number;
};

export type GuessOutcome = GuessState & {
  letter: string;
  isCorrect: boolean;
  isWon: boolean;
  isLost: boolean;
  isCompleted: boolean;
};

export class InvalidGuessError extends Error {}

/** Lowercases a guess and returns it if it's a single a-z letter. */
export function normalizeGuess(raw: string): string | null {
  const letter = raw.trim().toLowerCase();
  return /^[a-z]$/.test(letter) ? letter : null;
}

export function uniqueLetters(word: string) {
  return [...new Set(word.split(""))];
}

/**
 * Applies a single guess to a game state and returns the new state. Throws an
 * {@link InvalidGuessError} if the guess is not a letter or was already made.
 */
export function applyGuess(state: GuessState, rawGuess: string): GuessOutcome {
  const letter = normalizeGuess(rawGuess);
  if (!letter) {
    throw new InvalidGuessError("Invalid guess. Please enter a single letter.");
  }
  if (state.guessedLetters.includes(letter)) {
    throw new InvalidGuessError("You have already guessed this letter");
  }

  const isCorrect = state.word.includes(letter);
  const correctGuesses = isCorrect
    ? [...state.correctGuesses, letter]
    : [...state.correctGuesses];
  const wrongGuesses = isCorrect
    ? [...state.wrongGuesses]
    : [...state.wrongGuesses, letter];
  const mistakes = state.mistakes + (isCorrect ? 0 : 1);

  const isWon = uniqueLetters(state.word).every((l) =>
    correctGuesses.includes(l),
  );
  const isLost = !isWon && mistakes >= MAX_MISTAKES;

  return {
    word: state.word,
    guessedLetters: [...state.guessedLetters, letter],
    correctGuesses,
    wrongGuesses,
    attempts: state.attempts + 1,
    mistakes,
    letter,
    isCorrect,
    isWon,
    isLost,
    isCompleted: isWon || isLost,
  };
}

/**
 * Score for a won solo game. The formula is unchanged from earlier versions so
 * historic leaderboard entries stay comparable.
 */
export function calculateScore({
  wordLength,
  attempts,
  mistakes,
  timeMs,
}: {
  wordLength: number;
  attempts: number;
  mistakes: number;
  timeMs: number;
}) {
  const timeInSeconds = Math.floor(timeMs / 1000);
  const baseScore = wordLength * 10;
  const attemptBonus = Math.max(0, 50 - attempts * 2);
  const mistakeBonus = Math.max(0, 60 - mistakes * 10);
  const timeBonus = Math.max(0, 100 - timeInSeconds);
  return baseScore + attemptBonus + mistakeBonus + timeBonus;
}

/** Returns the word with unguessed letters replaced by "_". */
export function maskWord(word: string, guessedLetters: string[]) {
  return word
    .split("")
    .map((letter) => (guessedLetters.includes(letter) ? letter : "_"));
}

/** Number of letter positions revealed by the guesses so far. */
export function countRevealed(word: string, guessedLetters: string[]) {
  return word.split("").filter((l) => guessedLetters.includes(l)).length;
}

/** Share of guesses that were correct, as a 0-100 percentage. */
export function accuracy(correct: number, attempts: number) {
  return attempts > 0 ? Math.round((correct / attempts) * 100) : 0;
}

export function pickRandomWord(
  words: readonly string[],
  random: () => number = Math.random,
) {
  return words[Math.floor(random() * words.length)].toLowerCase();
}
