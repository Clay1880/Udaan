import { describe, expect, it } from "vitest";
import { FALLBACK_BANK } from "@/lib/quiz/fallback-bank";
import { cleanQuestions } from "@/lib/quiz/validate";

describe("FALLBACK_BANK", () => {
  it("has at least 30 valid, unique questions", () => {
    expect(FALLBACK_BANK.length).toBeGreaterThanOrEqual(30);
    expect(cleanQuestions(FALLBACK_BANK, FALLBACK_BANK.length)).toHaveLength(FALLBACK_BANK.length);
  });
});
