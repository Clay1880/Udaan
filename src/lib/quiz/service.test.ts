import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { MemoryAttemptStore } from "@/lib/quiz/memory-store";
import { getAttemptView, QuizError, saveAnswer, startAttempt, submitAttempt, type QuizDeps } from "@/lib/quiz/service";
import { deadlineOf } from "@/lib/quiz/timer";

const OPEN = Date.parse("2026-10-07T18:30:00Z");
const CLOSE = Date.parse("2026-10-09T18:30:00Z");
const questions = Array.from({ length: 20 }, (_, i) => ({
  text: `Question ${i} about the air force?`,
  options: ["a", "b", "c", "d"],
  answer: i % 4,
}));

let clock = OPEN + 1000;
let store: MemoryAttemptStore;
let generate: Mock<QuizDeps["generate"]>;
let deps: QuizDeps;

beforeEach(() => {
  clock = OPEN + 1000;
  store = new MemoryAttemptStore();
  generate = vi.fn<QuizDeps["generate"]>(async () => ({ questions, source: "gemini" as const }));
  deps = { store, now: () => clock, window: { openAt: OPEN, closeAt: CLOSE }, generate };
});

const code = async (p: Promise<unknown>) => p.then(() => null, (e: QuizError) => e.code);

describe("startAttempt", () => {
  it("creates an attempt and never exposes answers", async () => {
    const v = await startAttempt("u1", deps);
    expect(v.status).toBe("in_progress");
    expect(v.questions).toHaveLength(20);
    expect(JSON.stringify(v)).not.toContain('"answer"');
    expect(v.deadlineAt).toBe(v.startedAt + 15 * 60 * 1000);
  });
  it("resumes the same attempt on a second start (no second generation)", async () => {
    const a = await startAttempt("u1", deps);
    clock += 60_000;
    const b = await startAttempt("u1", deps);
    expect(b.startedAt).toBe(a.startedAt);
    expect(generate).toHaveBeenCalledTimes(1);
  });
  it("double-tap creates exactly one attempt", async () => {
    const [a, b] = await Promise.all([startAttempt("u1", deps), startAttempt("u1", deps)]);
    expect(a.startedAt).toBe(b.startedAt);
    expect(store.data.size).toBe(1);
  });
  it("starts the timer after generation finishes", async () => {
    generate.mockImplementation(async () => {
      clock += 8000;
      return { questions, source: "gemini" as const };
    });
    const v = await startAttempt("u1", deps);
    expect(v.startedAt).toBe(OPEN + 1000 + 8000);
  });
  it("refuses before the window opens", async () => {
    clock = OPEN - 1;
    expect(await code(startAttempt("u1", deps))).toBe("WINDOW_NOT_OPEN");
  });
  it("refuses after the window closes", async () => {
    clock = CLOSE;
    expect(await code(startAttempt("u1", deps))).toBe("WINDOW_CLOSED");
  });
  it("allows resuming an attempt after the window closes if still inside its own 15 minutes", async () => {
    clock = CLOSE - 60_000;
    await startAttempt("u1", deps);
    clock = CLOSE + 60_000;
    const v = await getAttemptView("u1", deps);
    expect(v?.status).toBe("in_progress");
  });
});

describe("saveAnswer / getAttemptView", () => {
  it("persists answers across reload", async () => {
    await startAttempt("u1", deps);
    await saveAnswer("u1", 3, 2, deps);
    const v = await getAttemptView("u1", deps);
    expect(v?.answers).toEqual({ "3": 2 });
  });
  it("reload at 14:59 shows the same questions with about 1s left", async () => {
    const a = await startAttempt("u1", deps);
    clock = a.startedAt + 14 * 60_000 + 59_000;
    const v = await getAttemptView("u1", deps);
    expect(v!.deadlineAt - v!.serverNow).toBe(1000);
    expect(v?.questions).toEqual(a.questions);
  });
  it("rejects out-of-range input", async () => {
    await startAttempt("u1", deps);
    expect(await code(saveAnswer("u1", 20, 0, deps))).toBe("BAD_INPUT");
    expect(await code(saveAnswer("u1", 0, 4, deps))).toBe("BAD_INPUT");
    expect(await code(saveAnswer("u1", -1, 0, deps))).toBe("BAD_INPUT");
    expect(await code(saveAnswer("u1", 1.5, 0, deps))).toBe("BAD_INPUT");
  });
  it("rejects answers when no attempt exists", async () => {
    expect(await code(saveAnswer("nobody", 0, 0, deps))).toBe("NO_ATTEMPT");
  });
  it("accepts an answer inside the grace window", async () => {
    const a = await startAttempt("u1", deps);
    clock = deadlineOf(a.startedAt) + 4000;
    await saveAnswer("u1", 0, 0, deps);
    expect((await getAttemptView("u1", deps))?.answers).toEqual({ "0": 0 });
  });
  it("rejects an answer after deadline+grace and auto-scores earlier answers", async () => {
    const a = await startAttempt("u1", deps);
    await saveAnswer("u1", 0, 0, deps); // correct
    await saveAnswer("u1", 1, 1, deps); // correct
    clock = deadlineOf(a.startedAt) + 6000;
    expect(await code(saveAnswer("u1", 2, 2, deps))).toBe("NOT_IN_PROGRESS");
    const v = await getAttemptView("u1", deps);
    expect(v?.status).toBe("submitted");
    expect(v?.score).toBe(2);
    expect(v?.answers).toEqual({ "0": 0, "1": 1 });
  });
  it("returns null when there is no attempt", async () => {
    expect(await getAttemptView("nobody", deps)).toBeNull();
  });
});

describe("submitAttempt", () => {
  it("scores and locks the attempt", async () => {
    await startAttempt("u1", deps);
    await saveAnswer("u1", 0, 0, deps);
    await saveAnswer("u1", 1, 3, deps);
    const v = await submitAttempt("u1", deps);
    expect(v.status).toBe("submitted");
    expect(v.score).toBe(1);
    expect(await code(saveAnswer("u1", 2, 2, deps))).toBe("NOT_IN_PROGRESS");
  });
  it("is idempotent", async () => {
    await startAttempt("u1", deps);
    await saveAnswer("u1", 0, 0, deps);
    const a = await submitAttempt("u1", deps);
    clock += 10_000;
    const b = await submitAttempt("u1", deps);
    expect(b.score).toBe(a.score);
    expect(store.data.get("u1")!.submittedAt).toBe(OPEN + 1000);
  });
  it("shows the score only after submission", async () => {
    await startAttempt("u1", deps);
    expect((await getAttemptView("u1", deps))?.score).toBeNull();
  });
  it("fails without an attempt", async () => {
    expect(await code(submitAttempt("nobody", deps))).toBe("NO_ATTEMPT");
  });
});

describe("boundaries and secrecy", () => {
  it("accepts an answer at exactly deadline+5000ms", async () => {
    const a = await startAttempt("u1", deps);
    clock = deadlineOf(a.startedAt) + 5000;
    await saveAnswer("u1", 0, 0, deps);
    expect(store.data.get("u1")!.answers).toEqual({ "0": 0 });
    expect(store.data.get("u1")!.status).toBe("in_progress");
  });
  it("rejects an answer at deadline+5001ms and scores earlier answers only", async () => {
    const a = await startAttempt("u1", deps);
    await saveAnswer("u1", 0, 0, deps);
    clock = deadlineOf(a.startedAt) + 5001;
    expect(await code(saveAnswer("u1", 1, 1, deps))).toBe("NOT_IN_PROGRESS");
    const rec = store.data.get("u1")!;
    expect(rec.answers).toEqual({ "0": 0 });
    expect(rec.status).toBe("submitted");
    expect(rec.score).toBe(1);
    expect(rec.submittedAt).toBe(deadlineOf(a.startedAt));
  });
  it("reload at 14:59 returns identical questions, saved answers and 1s left", async () => {
    const a = await startAttempt("u1", deps);
    await saveAnswer("u1", 5, 1, deps);
    clock = a.startedAt + 14 * 60_000 + 59_000;
    const v = await getAttemptView("u1", deps);
    expect(v!.status).toBe("in_progress");
    expect(v!.questions).toEqual(a.questions);
    expect(v!.answers).toEqual({ "5": 1 });
    expect(v!.deadlineAt - v!.serverNow).toBe(1000);
  });
  it("two concurrent starts both return the single stored attempt", async () => {
    const [a, b] = await Promise.all([startAttempt("u1", deps), startAttempt("u1", deps)]);
    expect(store.data.size).toBe(1);
    const stored = store.data.get("u1")!;
    expect(a.startedAt).toBe(stored.startedAt);
    expect(b.startedAt).toBe(stored.startedAt);
    expect(b.questions).toEqual(a.questions);
  });
  it("never leaks answers in any view, including submitted", async () => {
    const check = (v: unknown) => {
      const s = JSON.stringify(v);
      expect(s).not.toContain('"answer"');
      for (const q of (v as { questions: object[] }).questions) expect(Object.keys(q).sort()).toEqual(["options", "text"]);
    };
    check(await startAttempt("u1", deps));
    check(await getAttemptView("u1", deps));
    check(await submitAttempt("u1", deps));
    check(await getAttemptView("u1", deps));
  });
});

describe("store atomicity contract", () => {
  const patchFor = (rec: { answers: Record<string, number> }, at: number) => ({
    status: "submitted" as const,
    score: Object.keys(rec.answers).length,
    submittedAt: at,
  });
  it("first finalize wins; a second finalize with different answers is a no-op", async () => {
    await startAttempt("u1", deps);
    await saveAnswer("u1", 0, 0, deps);
    const first = await store.finalize("u1", (r) => patchFor(r, 1));
    expect(first!.score).toBe(1);
    store.data.get("u1")!.answers["1"] = 1; // simulate a stale/late answer
    const second = await store.finalize("u1", (r) => patchFor(r, 2));
    expect(second!.score).toBe(1);
    expect(second!.submittedAt).toBe(1);
    expect(store.data.get("u1")!.score).toBe(1);
  });
  it("score is computed from the current answers inside finalize", async () => {
    await startAttempt("u1", deps);
    await saveAnswer("u1", 0, 0, deps);
    await saveAnswer("u1", 1, 1, deps);
    expect((await submitAttempt("u1", deps)).score).toBe(2);
  });
  it("setAnswer after finalize is refused and does not change the score", async () => {
    await startAttempt("u1", deps);
    await saveAnswer("u1", 0, 0, deps);
    await submitAttempt("u1", deps);
    const res = await store.setAnswer("u1", 1, 1, { now: clock, notAfter: clock + 100_000 });
    expect(res).toBe("closed");
    expect(store.data.get("u1")!.answers).toEqual({ "0": 0 });
    expect(store.data.get("u1")!.score).toBe(1);
  });
  it("setAnswer after deadline+grace is refused by the store itself", async () => {
    await startAttempt("u1", deps);
    expect(await store.setAnswer("u1", 0, 0, { now: 1001, notAfter: 1000 })).toBe("closed");
    expect(await store.setAnswer("u1", 0, 0, { now: 1000, notAfter: 1000 })).toBe("ok");
    expect(await store.setAnswer("nobody", 0, 0, { now: 0, notAfter: 1 })).toBe("missing");
    expect(store.data.get("u1")!.answers).toEqual({ "0": 0 });
  });
});

describe("settleExpiredSummaries", () => {
  const rec = (over: Partial<import("@/lib/quiz/service").AttemptRecord>) => ({
    questions, answers: {}, startedAt: 0, status: "in_progress" as const, score: null, submittedAt: null, source: "fallback" as const, ...over,
  });
  const sum = (startedAt: number, status = "in_progress", score: number | null = null) => ({ status, score, startedAt });

  it("scores expired in-progress attempts, leaves live and submitted ones alone", async () => {
    const { settleExpiredSummaries } = await import("@/lib/quiz/service");
    const old = clock - 20 * 60 * 1000;
    store.data.set("exp", rec({ startedAt: old, answers: { "0": 0, "1": 1, "2": 0 } }));
    store.data.set("live", rec({ startedAt: clock - 1000 }));
    store.data.set("done", rec({ startedAt: old, status: "submitted", score: 7, submittedAt: old + 1 }));
    const m = new Map([["exp", sum(old)], ["live", sum(clock - 1000)], ["done", sum(old, "submitted", 7)]]);
    await settleExpiredSummaries(m, deps);
    expect(m.get("exp")).toMatchObject({ status: "submitted", score: 2 });
    expect(m.get("live")).toMatchObject({ status: "in_progress", score: null });
    expect(m.get("done")).toMatchObject({ status: "submitted", score: 7 });
    expect(store.data.get("done")!.score).toBe(7);
    // idempotent
    await settleExpiredSummaries(m, deps);
    expect(m.get("exp")!.score).toBe(2);
  });
  it("one failing attempt stays in progress without failing the rest", async () => {
    const { settleExpiredSummaries } = await import("@/lib/quiz/service");
    const old = clock - 20 * 60 * 1000;
    store.data.set("a", rec({ startedAt: old }));
    store.data.set("b", rec({ startedAt: old }));
    const realGet = store.get.bind(store);
    store.get = async (uid: string) => {
      if (uid === "a") throw new Error("boom");
      return realGet(uid);
    };
    vi.spyOn(console, "error").mockImplementation(() => {});
    const m = new Map([["a", sum(old)], ["b", sum(old)]]);
    await settleExpiredSummaries(m, deps);
    expect(m.get("a")!.status).toBe("in_progress");
    expect(m.get("b")!.status).toBe("submitted");
  });
});
