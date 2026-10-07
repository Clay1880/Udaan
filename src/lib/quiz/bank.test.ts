import { describe, expect, it } from "vitest";
import bank from "@/lib/quiz/bank.json";
import { pickFromBank, type BankQuestion } from "@/lib/quiz/bank";
import { QuestionSchema } from "@/lib/quiz/validate";

const seeded = (seed: number) => () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};
const topics = ["a", "b", "c", "d", "e", "f", "g", "h"];
const fake: BankQuestion[] = topics.flatMap((t) =>
  Array.from({ length: 30 }, (_, i) => ({ topic: t, text: `${t} question number ${i}?`, options: ["w", "x", "y", "z"], answer: i % 4 })),
);

describe("pickFromBank", () => {
  it("returns distinct questions, spread 2-3 per topic, without bank-only fields", () => {
    for (let s = 1; s <= 30; s++) {
      const picked = pickFromBank(fake, 20, seeded(s));
      expect(picked).toHaveLength(20);
      expect(new Set(picked.map((q) => q.text)).size).toBe(20);
      const per = topics.map((t) => picked.filter((q) => q.text.startsWith(`${t} `)).length);
      expect(Math.min(...per)).toBeGreaterThanOrEqual(2);
      expect(Math.max(...per)).toBeLessThanOrEqual(3);
      expect(Object.keys(picked[0]).sort()).toEqual(["answer", "options", "text"]);
    }
  });
  it("gives different sets to different students", () => {
    const sets = new Set(Array.from({ length: 20 }, (_, s) => pickFromBank(fake, 20, seeded(s + 1)).map((q) => q.text).sort().join("|")));
    expect(sets.size).toBeGreaterThan(15);
  });
  it("still fills the quiz when one topic is small", () => {
    const lopsided = [...fake.slice(0, 2), ...fake.slice(30)];
    expect(new Set(pickFromBank(lopsided, 20, seeded(1)).map((q) => q.text)).size).toBe(20);
  });
  it("refuses a bank that is too small", () => {
    expect(() => pickFromBank(fake.slice(0, 5), 20)).toThrow(/need 20/);
  });
});

describe("bank.json", () => {
  it("is large, valid, unique, with a correct answer in range", () => {
    expect(bank.length).toBeGreaterThanOrEqual(500);
    const keys = new Set<string>();
    for (const q of bank) {
      expect(QuestionSchema.safeParse(q).success, q.text).toBe(true);
      keys.add(q.text.toLowerCase().replace(/\s+/g, " "));
    }
    expect(keys.size).toBe(bank.length);
  });
});
