import { describe, expect, it } from "vitest";
import { scoreAttempt } from "@/lib/quiz/score";

const qs = [0, 1, 2, 3].map((a) => ({ text: "t".repeat(12), options: ["a", "b", "c", "d"], answer: a }));

describe("scoreAttempt", () => {
  it("counts correct answers", () => {
    expect(scoreAttempt(qs, { "0": 0, "1": 1, "2": 0, "3": 3 })).toBe(3);
  });
  it("unanswered counts as zero, no negative marking", () => {
    expect(scoreAttempt(qs, {})).toBe(0);
  });
  it("ignores answers for indexes that do not exist", () => {
    expect(scoreAttempt(qs, { "9": 0 })).toBe(0);
  });
});
