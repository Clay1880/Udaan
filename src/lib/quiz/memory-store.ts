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
  async update(uid: string, patch: Partial<AttemptRecord>) {
    this.data.set(uid, { ...this.data.get(uid)!, ...patch });
  }
  async setAnswer(uid: string, index: number, choice: number) {
    this.data.get(uid)!.answers[String(index)] = choice;
  }
}
