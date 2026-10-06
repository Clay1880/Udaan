import type { Firestore } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { createUploadSession, deleteFile, getFile } from "@/lib/drive";
import type { PosterStore } from "@/lib/poster/service";
import { signPosterUrl } from "@/lib/poster/signed-url";
import type { AttemptSummary } from "@/lib/quiz/service";
import {
  AlreadyExistsError,
  type AttemptRecord,
  type AttemptStore,
  type SetAnswerResult,
} from "@/lib/quiz/service";
import type { Profile } from "@/lib/profile";

export interface UserDoc extends Profile {
  uid: string;
  email: string;
  createdAt: number;
}
export interface PosterDoc {
  path: string;
  fileType: string;
  size: number;
  uploadedAt: number;
}

const col = (name: string) => adminDb().collection(name);

/** Firestore-backed AttemptStore. Mirrors MemoryAttemptStore; finalize/setAnswer run in transactions. */
export class FirestoreAttemptStore implements AttemptStore {
  constructor(private db: () => Firestore = adminDb) {}
  private ref(uid: string) {
    return this.db().collection("attempts").doc(uid);
  }

  async get(uid: string) {
    const s = await this.ref(uid).get();
    return s.exists ? (s.data() as AttemptRecord) : null;
  }

  async create(uid: string, a: AttemptRecord) {
    try {
      await this.ref(uid).create(a);
    } catch (e) {
      const err = e as { code?: number | string; message?: string };
      if (err.code === 6 || err.code === "already-exists" || /ALREADY_EXISTS/.test(err.message ?? "")) {
        throw new AlreadyExistsError();
      }
      throw e;
    }
  }

  async finalize(uid: string, compute: (rec: AttemptRecord) => Partial<AttemptRecord>) {
    const ref = this.ref(uid);
    return this.db().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return null;
      const cur = snap.data() as AttemptRecord;
      if (cur.status !== "in_progress") return cur;
      const patch = compute(cur);
      tx.update(ref, patch as Record<string, unknown>);
      return { ...cur, ...patch } as AttemptRecord;
    });
  }

  async setAnswer(
    uid: string,
    index: number,
    choice: number,
    opts: { now: number; notAfter: number },
  ): Promise<SetAnswerResult> {
    const ref = this.ref(uid);
    return this.db().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return "missing" as const;
      const cur = snap.data() as AttemptRecord;
      if (cur.status !== "in_progress" || opts.now > opts.notAfter) return "closed" as const;
      tx.update(ref, { [`answers.${index}`]: choice });
      return "ok" as const;
    });
  }
}

export async function getUser(uid: string): Promise<UserDoc | null> {
  const s = await col("users").doc(uid).get();
  return s.exists ? (s.data() as UserDoc) : null;
}

export async function saveUser(u: Omit<UserDoc, "createdAt">): Promise<void> {
  const ref = col("users").doc(u.uid);
  const existing = await ref.get();
  await ref.set({ ...u, createdAt: existing.exists ? (existing.data() as UserDoc).createdAt : Date.now() });
}

export async function getPosterRecord(uid: string): Promise<PosterDoc | null> {
  const s = await col("posters").doc(uid).get();
  return s.exists ? (s.data() as PosterDoc) : null;
}

export async function setPosterRecord(uid: string, r: PosterDoc): Promise<void> {
  await col("posters").doc(uid).set(r);
}

export async function listUsers(): Promise<UserDoc[]> {
  return (await col("users").get()).docs.map((d) => d.data() as UserDoc);
}

export async function listAttemptSummaries(): Promise<Map<string, AttemptSummary>> {
  const snap = await col("attempts").select("status", "score", "startedAt").get();
  return new Map(snap.docs.map((d) => [d.id, d.data() as AttemptSummary]));
}

export async function listPosterRecords(): Promise<Map<string, PosterDoc>> {
  const snap = await col("posters").get();
  return new Map(snap.docs.map((d) => [d.id, d.data() as PosterDoc]));
}

/** Posters live in a Google Drive folder; `PosterDoc.path` is the Drive file id. */
export class DrivePosterStore implements PosterStore {
  async head(id: string) {
    const f = await getFile(id);
    return f ? { contentType: f.mimeType, size: f.size, owner: f.uid } : null;
  }
  async remove(id: string) {
    await deleteFile(id);
  }
  startUpload(a: { uid: string; name: string; contentType: string; size: number; origin: string }) {
    return createUploadSession({ name: a.name, mimeType: a.contentType, size: a.size, uid: a.uid, origin: a.origin });
  }
  get = getPosterRecord;
  set = setPosterRecord;
}

/** A same-origin, expiring link to the poster (served by /api/poster/file). */
export async function signedReadUrl(id: string, ttlMs = 60 * 60 * 1000): Promise<string> {
  return signPosterUrl(process.env.POSTER_URL_SECRET ?? "", id, ttlMs);
}
