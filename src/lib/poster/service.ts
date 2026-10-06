import { POSTER } from "@/lib/config";
import { windowState } from "@/lib/window";

/** `path` is the Google Drive file id of the uploaded poster. */
export interface PosterRecord {
  path: string;
  fileType: string;
  size: number;
  uploadedAt: number;
}

export interface PosterFileMeta {
  contentType: string;
  size: number;
  /** uid stamped on the file when the upload session was created. */
  owner: string;
}

export interface PosterStore {
  head(id: string): Promise<PosterFileMeta | null>;
  remove(id: string): Promise<void>;
  get(uid: string): Promise<PosterRecord | null>;
  set(uid: string, r: PosterRecord): Promise<void>;
  /** Start a resumable upload for `uid` and return the URL the browser should PUT the file to. */
  startUpload(a: { uid: string; name: string; contentType: string; size: number; origin: string }): Promise<string>;
}

type PosterCode = "WINDOW_NOT_OPEN" | "WINDOW_CLOSED" | "BAD_PATH" | "NOT_FOUND" | "BAD_TYPE" | "TOO_LARGE";

const MESSAGES: Record<PosterCode, string> = {
  WINDOW_NOT_OPEN: "Poster submissions have not opened yet.",
  WINDOW_CLOSED: "Poster submissions have closed.",
  BAD_PATH: "Invalid upload.",
  NOT_FOUND: "The uploaded file was not found. Please try again.",
  BAD_TYPE: "Only PDF, JPG or PNG files are allowed.",
  TOO_LARGE: "The file is larger than 10 MB.",
};

export class PosterError extends Error {
  constructor(public code: PosterCode) {
    super(MESSAGES[code]);
  }
}

export interface PosterDeps {
  store: PosterStore;
  now: () => number;
  window: { openAt: number; closeAt: number };
}

const EXT: Record<string, string> = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png" };

/** Drive file ids are URL-safe; anything else is never a valid upload. */
export function validFileId(id: string): boolean {
  return /^[A-Za-z0-9_-]{10,100}$/.test(id);
}

const part = (s: string) => s.normalize("NFKD").replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40);

/** `<year>_<branch>_<roll>.<ext>`: what the organisers see in the Drive folder. */
export function posterDriveName(p: { year: string; branch: string; rollNo: string }, contentType: string): string {
  return `${[part(p.year), part(p.branch), part(p.rollNo) || "roll"].join("_")}.${EXT[contentType] ?? "bin"}`;
}

/** Validate a request to upload, then open a Drive upload session for it. */
export async function startPoster(
  uid: string,
  input: { name: string; contentType: string; size: number; origin: string },
  deps: PosterDeps,
): Promise<string> {
  const state = windowState(deps.now(), deps.window);
  if (state !== "open") throw new PosterError(state === "before" ? "WINDOW_NOT_OPEN" : "WINDOW_CLOSED");
  if (!(POSTER.allowedTypes as readonly string[]).includes(input.contentType)) throw new PosterError("BAD_TYPE");
  if (!Number.isInteger(input.size) || input.size <= 0 || input.size > POSTER.maxBytes) throw new PosterError("TOO_LARGE");
  return deps.store.startUpload({ uid, ...input });
}

/** Delete a rejected upload, but never the file the student's accepted poster record points at. */
async function discard(deps: PosterDeps, uid: string, id: string): Promise<void> {
  const current = await deps.store.get(uid);
  if (current?.path === id) return;
  await deps.store.remove(id);
}

export async function confirmPoster(uid: string, id: string, deps: PosterDeps): Promise<PosterRecord> {
  if (!validFileId(id)) throw new PosterError("BAD_PATH");

  // Ownership first: nothing below may touch (or delete) a file that isn't this student's.
  const meta = await deps.store.head(id);
  if (meta && meta.owner !== uid) throw new PosterError("BAD_PATH");

  const state = windowState(deps.now(), deps.window);
  if (state !== "open") {
    if (meta) await discard(deps, uid, id);
    throw new PosterError(state === "before" ? "WINDOW_NOT_OPEN" : "WINDOW_CLOSED");
  }

  if (!meta) throw new PosterError("NOT_FOUND");
  if (!(POSTER.allowedTypes as readonly string[]).includes(meta.contentType)) {
    await discard(deps, uid, id);
    throw new PosterError("BAD_TYPE");
  }
  if (meta.size > POSTER.maxBytes) {
    await discard(deps, uid, id);
    throw new PosterError("TOO_LARGE");
  }

  const previous = await deps.store.get(uid);
  const record: PosterRecord = { path: id, fileType: meta.contentType, size: meta.size, uploadedAt: deps.now() };
  await deps.store.set(uid, record);
  if (previous && previous.path !== id) await deps.store.remove(previous.path);
  return record;
}
