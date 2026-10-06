import { AlreadyExistsError, type AttemptRecord, type AttemptStore } from "./service";

export class MemoryAttemptStore implements AttemptStore {
  data = new Map<string, AttemptRecord>();
  async get(uid: string) {
    const a = this.data.get(uid);
    return a ? structuredClone(a) : null;
  }
  async create(uid: string, a: AttemptRecord) {
    if (this.data.has(uid)) throw new AlreadyExistsError();
    this.data.set(uid, structuredClone(a));
  }
  async finalize(uid: string, compute: (rec: AttemptRecord) => Partial<AttemptRecord>) {
    const cur = this.data.get(uid);
    if (!cur) return null;
    if (cur.status !== "in_progress") return structuredClone(cur);
    const next = { ...cur, ...compute(structuredClone(cur)) };
    this.data.set(uid, next);
    return structuredClone(next);
  }
  async setAnswer(uid: string, index: number, choice: number, opts: { now: number; notAfter: number }) {
    const cur = this.data.get(uid);
    if (!cur) return "missing" as const;
    if (cur.status !== "in_progress" || opts.now > opts.notAfter) return "closed" as const;
    cur.answers[String(index)] = choice;
    return "ok" as const;
  }
}
