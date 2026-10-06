import { describe, expect, it } from "vitest";
import type { Firestore } from "firebase-admin/firestore";
import { FirestoreAttemptStore } from "@/lib/server/repo";
import { AlreadyExistsError, type AttemptRecord } from "@/lib/quiz/service";

/** Minimal in-memory fake of the Firestore surface the store uses (get/create + runTransaction get/update). */
function fakeDb() {
  const docs = new Map<string, Record<string, unknown>>();
  const ref = (id: string) => ({
    id,
    async get() {
      const d = docs.get(id);
      return { exists: !!d, data: () => (d ? structuredClone(d) : undefined) };
    },
    async create(v: Record<string, unknown>) {
      if (docs.has(id)) throw Object.assign(new Error("6 ALREADY_EXISTS"), { code: 6 });
      docs.set(id, structuredClone(v));
    },
  });
  const db = {
    collection: () => ({ doc: ref }),
    async runTransaction<T>(fn: (tx: unknown) => Promise<T>) {
      const writes: Array<() => void> = [];
      const tx = {
        get: (r: { get: () => Promise<unknown> }) => r.get(),
        update(r: { id: string }, patch: Record<string, unknown>) {
          writes.push(() => {
            const d = docs.get(r.id)!;
            for (const [k, v] of Object.entries(patch)) {
              if (k.startsWith("answers.")) (d.answers as Record<string, unknown>)[k.slice(8)] = v;
              else d[k] = v;
            }
          });
        },
      };
      const out = await fn(tx);
      writes.forEach((w) => w());
      return out;
    },
  };
  return { db: db as unknown as Firestore, docs };
}

const rec = (over: Partial<AttemptRecord> = {}): AttemptRecord => ({
  questions: [],
  answers: {},
  startedAt: 1000,
  status: "in_progress",
  score: null,
  submittedAt: null,
  source: "fallback",
  ...over,
});

describe("FirestoreAttemptStore (fake Firestore)", () => {
  it("create fails with AlreadyExistsError on duplicate", async () => {
    const { db } = fakeDb();
    const s = new FirestoreAttemptStore(() => db);
    await s.create("u", rec());
    await expect(s.create("u", rec())).rejects.toBeInstanceOf(AlreadyExistsError);
  });
  it("setAnswer: ok, missing, closed (late / submitted)", async () => {
    const { db } = fakeDb();
    const s = new FirestoreAttemptStore(() => db);
    expect(await s.setAnswer("u", 0, 1, { now: 5, notAfter: 10 })).toBe("missing");
    await s.create("u", rec());
    expect(await s.setAnswer("u", 0, 2, { now: 5, notAfter: 10 })).toBe("ok");
    expect((await s.get("u"))!.answers).toEqual({ "0": 2 });
    expect(await s.setAnswer("u", 1, 2, { now: 11, notAfter: 10 })).toBe("closed");
    expect((await s.get("u"))!.answers).toEqual({ "0": 2 });
    await s.finalize("u", () => ({ status: "submitted", score: 0, submittedAt: 6 }));
    expect(await s.setAnswer("u", 1, 2, { now: 5, notAfter: 10 })).toBe("closed");
  });
  it("finalize: null if missing, computes on fresh record, first finalize wins", async () => {
    const { db } = fakeDb();
    const s = new FirestoreAttemptStore(() => db);
    expect(await s.finalize("u", () => ({}))).toBeNull();
    await s.create("u", rec());
    await s.setAnswer("u", 0, 3, { now: 1, notAfter: 10 });
    const first = await s.finalize("u", (r) => ({
      status: "submitted",
      score: Object.keys(r.answers).length,
      submittedAt: 7,
    }));
    expect(first).toMatchObject({ status: "submitted", score: 1, submittedAt: 7 });
    let called = false;
    const second = await s.finalize("u", () => {
      called = true;
      return { score: 99 };
    });
    expect(called).toBe(false);
    expect(second!.score).toBe(1);
    expect((await s.get("u"))!.score).toBe(1);
  });
});
