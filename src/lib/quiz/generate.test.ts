import { describe, expect, it, vi } from "vitest";
import { generateQuestions } from "@/lib/quiz/generate";
import { FALLBACK_BANK } from "@/lib/quiz/fallback-bank";

const q = (i: number) => ({
  text: `Generated question ${i} about the air force?`,
  options: [`a${i}`, `b${i}`, `c${i}`, `d${i}`],
  answer: i % 4,
});
const json = (n: number) => JSON.stringify(Array.from({ length: n }, (_, i) => q(i)));
const base = { bank: FALLBACK_BANK, timeoutMs: 200 };

describe("generateQuestions", () => {
  it("uses Gemini output when valid", async () => {
    const r = await generateQuestions(20, { ...base, callModel: async () => json(23) });
    expect(r.source).toBe("gemini");
    expect(r.questions).toHaveLength(20);
  });
  it("accepts markdown-fenced JSON", async () => {
    const r = await generateQuestions(20, {
      ...base,
      callModel: async () => "```json\n" + json(23) + "\n```",
    });
    expect(r.source).toBe("gemini");
  });
  it("retries once after malformed output", async () => {
    const callModel = vi.fn().mockResolvedValueOnce("not json").mockResolvedValueOnce(json(23));
    const r = await generateQuestions(20, { ...base, callModel });
    expect(r.source).toBe("gemini");
    expect(callModel).toHaveBeenCalledTimes(2);
  });
  it("falls back when output has too few valid questions", async () => {
    const r = await generateQuestions(20, { ...base, callModel: async () => json(10) });
    expect(r.source).toBe("fallback");
    expect(r.questions).toHaveLength(20);
  });
  it("falls back when the model throws", async () => {
    const r = await generateQuestions(20, {
      ...base,
      callModel: async () => {
        throw new Error("503");
      },
    });
    expect(r.source).toBe("fallback");
  });
  it("falls back when the model hangs past the timeout", async () => {
    const r = await generateQuestions(20, {
      ...base,
      attempts: 1,
      callModel: () => new Promise<string>(() => {}),
    });
    expect(r.source).toBe("fallback");
  });
  it("fallback questions are unique", async () => {
    const r = await generateQuestions(20, { ...base, callModel: async () => "[]" });
    expect(new Set(r.questions.map((x) => x.text)).size).toBe(20);
  });
  it("abandons a hanging model after the 10s default timeout per attempt", async () => {
    vi.useFakeTimers();
    try {
      const callModel = vi.fn(() => new Promise<string>(() => {}));
      const p = generateQuestions(20, { bank: FALLBACK_BANK, callModel });
      await vi.advanceTimersByTimeAsync(9999);
      expect(callModel).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(callModel).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(10000);
      const r = await p;
      expect(r.source).toBe("fallback");
      expect(r.questions).toHaveLength(20);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("option shuffling", () => {
  const seeded = (seed: number) => () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  const fail = async () => {
    throw new Error("down");
  };

  for (const source of ["fallback", "gemini"] as const) {
    it(`${source}: keeps the correct text, permutes options, spreads answer positions`, async () => {
      const callModel = source === "gemini" ? async () => json(23) : fail;
      const seen = new Set<number>();
      const counts = [0, 0, 0, 0];
      for (let s = 1; s <= 40; s++) {
        const r = await generateQuestions(20, { ...base, attempts: 1, callModel, random: seeded(s) });
        expect(r.source).toBe(source);
        for (const out of r.questions) {
          const orig =
            source === "fallback"
              ? FALLBACK_BANK.find((b) => b.text === out.text)!
              : (() => {
                  const i = Number(out.text.match(/question (\d+)/)![1]);
                  return q(i);
                })();
          expect(out.options[out.answer]).toBe(orig.options[orig.answer]);
          expect([...out.options].sort()).toEqual([...orig.options].sort());
          seen.add(out.answer);
          counts[out.answer]++;
        }
      }
      expect([...seen].sort()).toEqual([0, 1, 2, 3]);
      for (const c of counts) expect(c).toBeGreaterThan(800 * 0.15);
    });
  }
});
