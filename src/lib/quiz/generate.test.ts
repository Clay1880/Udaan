import { describe, expect, it } from "vitest";
import { generateQuestions } from "@/lib/quiz/generate";
import type { BankQuestion } from "@/lib/quiz/bank";

const BANK: BankQuestion[] = Array.from({ length: 80 }, (_, i) => ({
  topic: `t${i % 8}`,
  text: `Bank question ${i} about the air force?`,
  options: [`bank-a${i}`, `bank-b${i}`, `bank-c${i}`, `bank-d${i}`],
  answer: i % 4,
}));

describe("generateQuestions", () => {
  it("returns the requested number of distinct bank questions", async () => {
    const r = await generateQuestions(20, { bank: BANK });
    expect(r.source).toBe("bank");
    expect(r.questions).toHaveLength(20);
    expect(new Set(r.questions.map((x) => x.text)).size).toBe(20);
  });

  it("keeps the answer pointing at the same option after shuffling", async () => {
    const r = await generateQuestions(20, { bank: BANK });
    for (const x of r.questions) {
      const i = Number(x.text.match(/\d+/)![0]);
      expect(x.options[x.answer]).toBe(`bank-${"abcd"[i % 4]}${i}`);
    }
  });

  it("spreads questions across topics", async () => {
    const r = await generateQuestions(16, { bank: BANK });
    const topics = new Set(r.questions.map((x) => BANK.find((b) => b.text === x.text)!.topic));
    expect(topics.size).toBe(8);
  });

  it("throws when the bank is too small", async () => {
    await expect(generateQuestions(20, { bank: BANK.slice(0, 5) })).rejects.toThrow();
  });
});
