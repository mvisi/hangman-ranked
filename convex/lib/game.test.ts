import { describe, expect, it } from "vitest";
import {
  accuracy,
  applyGuess,
  calculateScore,
  countRevealed,
  GuessState,
  InvalidGuessError,
  maskWord,
  MAX_MISTAKES,
  normalizeGuess,
} from "./game";

const fresh = (word: string): GuessState => ({
  word,
  guessedLetters: [],
  correctGuesses: [],
  wrongGuesses: [],
  attempts: 0,
  mistakes: 0,
});

const play = (word: string, letters: string) =>
  letters.split("").reduce<GuessState>((s, l) => applyGuess(s, l), fresh(word));

describe("normalizeGuess", () => {
  it("accepts single letters in any case", () => {
    expect(normalizeGuess("A")).toBe("a");
    expect(normalizeGuess(" z ")).toBe("z");
  });
  it("rejects anything else", () => {
    expect(normalizeGuess("ab")).toBeNull();
    expect(normalizeGuess("1")).toBeNull();
    expect(normalizeGuess("é")).toBeNull();
    expect(normalizeGuess("")).toBeNull();
  });
});

describe("applyGuess", () => {
  it("records correct and wrong guesses", () => {
    const afterHit = applyGuess(fresh("apple"), "p");
    expect(afterHit.isCorrect).toBe(true);
    expect(afterHit.correctGuesses).toEqual(["p"]);
    expect(afterHit.mistakes).toBe(0);
    expect(afterHit.attempts).toBe(1);

    const afterMiss = applyGuess(afterHit, "z");
    expect(afterMiss.isCorrect).toBe(false);
    expect(afterMiss.wrongGuesses).toEqual(["z"]);
    expect(afterMiss.mistakes).toBe(1);
    expect(afterMiss.attempts).toBe(2);
  });

  it("does not mutate the input state", () => {
    const state = fresh("apple");
    applyGuess(state, "a");
    expect(state.guessedLetters).toEqual([]);
    expect(state.correctGuesses).toEqual([]);
  });

  it("wins once every unique letter is found", () => {
    const outcome = applyGuess(play("apple", "apl"), "e");
    expect(outcome.isWon).toBe(true);
    expect(outcome.isCompleted).toBe(true);
    expect(outcome.isLost).toBe(false);
  });

  it(`loses on the ${MAX_MISTAKES}th mistake`, () => {
    const almost = play("apple", "bcdfg");
    expect(almost.mistakes).toBe(MAX_MISTAKES - 1);
    const outcome = applyGuess(almost, "h");
    expect(outcome.isLost).toBe(true);
    expect(outcome.isCompleted).toBe(true);
  });

  it("rejects repeated and invalid guesses", () => {
    const state = play("apple", "a");
    expect(() => applyGuess(state, "a")).toThrow(InvalidGuessError);
    expect(() => applyGuess(state, "A")).toThrow(InvalidGuessError);
    expect(() => applyGuess(state, "1")).toThrow(InvalidGuessError);
  });
});

describe("word helpers", () => {
  it("masks unguessed letters", () => {
    expect(maskWord("apple", ["p"])).toEqual(["_", "p", "p", "_", "_"]);
  });
  it("counts revealed positions, not unique letters", () => {
    expect(countRevealed("apple", ["p"])).toBe(2);
  });
  it("computes accuracy as a percentage", () => {
    expect(accuracy(3, 4)).toBe(75);
    expect(accuracy(0, 0)).toBe(0);
  });
});

describe("calculateScore", () => {
  it("matches the historic formula", () => {
    // 5 letters, 4 guesses, 0 mistakes, 10s: 50 + 42 + 60 + 90
    expect(calculateScore({ wordLength: 5, attempts: 4, mistakes: 0, timeMs: 10_000 })).toBe(242);
  });
  it("never awards negative bonuses", () => {
    expect(
      calculateScore({ wordLength: 5, attempts: 40, mistakes: 9, timeMs: 1_000_000 }),
    ).toBe(50);
  });
});
