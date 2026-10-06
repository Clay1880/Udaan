import { POSTER } from "@/lib/config";
import { windowState } from "@/lib/window";

export interface PosterRecord {
  path: string;
  fileType: string;
  size: number;
  uploadedAt: number;
}

export interface PosterStore {
  head(path: string): Promise<{ contentType: string; size: number } | null>;
  remove(path: string): Promise<void>;
  get(uid: string): Promise<PosterRecord | null>;
  set(uid: string, r: PosterRecord): Promise<void>;
}

type PosterCode = "WINDOW_NOT_OPEN" | "WINDOW_CLOSED" | "BAD_PATH" | "NOT_FOUND" | "BAD_TYPE" | "TOO_LARGE";

const MESSAGES: Record<PosterCode, string> = {
  WINDOW_NOT_OPEN: "Poster submissions have not opened yet.",
  WINDOW_CLOSED: "Poster submissions have closed.",
  BAD_PATH: "Invalid upload path.",
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

function ownPath(uid: string, path: string): boolean {
  const prefix = `posters/${uid}/`;
  if (!path.startsWith(prefix)) return false;
  const name = path.slice(prefix.length);
  return /^[A-Za-z0-9._-]+$/.test(name) && !name.includes("..");
}

/** Delete a rejected upload, but never the file the student's accepted poster record points at. */
async function discard(deps: PosterDeps, uid: string, path: string): Promise<void> {
  const current = await deps.store.get(uid);
  if (current?.path === path) return;
  await deps.store.remove(path);
}

export async function confirmPoster(uid: string, path: string, deps: PosterDeps): Promise<PosterRecord> {
  if (!ownPath(uid, path)) throw new PosterError("BAD_PATH");

  const state = windowState(deps.now(), deps.window);
  if (state !== "open") {
    await discard(deps, uid, path);
    throw new PosterError(state === "before" ? "WINDOW_NOT_OPEN" : "WINDOW_CLOSED");
  }

  const meta = await deps.store.head(path);
  if (!meta) throw new PosterError("NOT_FOUND");
  if (!(POSTER.allowedTypes as readonly string[]).includes(meta.contentType)) {
    await discard(deps, uid, path);
    throw new PosterError("BAD_TYPE");
  }
  if (meta.size > POSTER.maxBytes) {
    await discard(deps, uid, path);
    throw new PosterError("TOO_LARGE");
  }

  const previous = await deps.store.get(uid);
  const record: PosterRecord = { path, fileType: meta.contentType, size: meta.size, uploadedAt: deps.now() };
  await deps.store.set(uid, record);
  if (previous && previous.path !== path) await deps.store.remove(previous.path);
  return record;
}
