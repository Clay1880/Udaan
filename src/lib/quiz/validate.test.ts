import { describe, expect, it } from "vitest";
import { cleanQuestions } from "@/lib/quiz/validate";

const q = (i: number, over: object = {}) => ({
  text: `Question number ${i} about the air force?`,
  options: [`a${i}`, `b${i}`, `c${i}`, `d${i}`],
  answer: i % 4,
  ...over,
});
const many = (n: number) => Array.from({ length: n }, (_, i) => q(i));

describe("cleanQuestions", () => {
  it("returns exactly `count` valid questions", () => {
    expect(cleanQuestions(many(23), 20)).toHaveLength(20);
  });
  it("drops invalid items (answer index out of range, 3 options, duplicate options)", () => {
    const raw = [
      ...many(20),
      q(100, { answer: 7 }),
      q(101, { options: ["a", "b", "c"] }),
      q(102, { options: ["same", "same", "x", "y"] }),
    ];
    expect(cleanQuestions(raw, 20)).toHaveLength(20);
    const withBadFirst = [q(100, { answer: 7 }), ...many(20)];
    expect(cleanQuestions(withBadFirst, 20).some((x) => x.answer > 3)).toBe(false);
  });
  it("drops duplicate question texts case-insensitively", () => {
    const raw = [q(1), q(1, { text: "QUESTION NUMBER 1 ABOUT THE AIR FORCE?" }), ...many(25).slice(2)];
    const out = cleanQuestions(raw, 20);
    expect(new Set(out.map((x) => x.text.toLowerCase())).size).toBe(20);
  });
  it("throws when fewer than count valid remain", () => {
    expect(() => cleanQuestions(many(19), 20)).toThrow(/only 19/);
  });
  it("throws when input is not an array", () => {
    expect(() => cleanQuestions({ questions: [] }, 20)).toThrow();
  });
});
