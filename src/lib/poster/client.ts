import { POSTER } from "@/lib/config";

export type PosterType = (typeof POSTER.allowedTypes)[number];

export const POSTER_EXT: Record<PosterType, string> = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png" };
const BY_EXT: Record<string, PosterType> = { pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png" };
const ALIASES: Record<string, PosterType> = { "image/jpg": "image/jpeg", "image/pjpeg": "image/jpeg" };

/**
 * The content type to upload a file as, or null if it isn't a PDF/JPG/PNG. Some browsers (and
 * Windows without a registered handler) report an empty type, so fall back to the extension then.
 */
export function posterFileType(f: { name: string; type: string }): PosterType | null {
  const t = f.type.toLowerCase();
  if ((POSTER.allowedTypes as readonly string[]).includes(t)) return t as PosterType;
  if (ALIASES[t]) return ALIASES[t];
  if (t) return null;
  const ext = /\.([a-z0-9]+)$/i.exec(f.name)?.[1]?.toLowerCase() ?? "";
  return BY_EXT[ext] ?? null;
}

const mb = (n: number) => `${(n / (1024 * 1024)).toFixed(1).replace(/\.0$/, "")} MB`;

export function checkPosterFile(f: { name: string; type: string; size: number }): { ok: true; type: PosterType } | { ok: false; message: string } {
  const type = posterFileType(f);
  if (!type) return { ok: false, message: `“${f.name}” is not a PDF, JPG or PNG file.` };
  if (f.size === 0) return { ok: false, message: `“${f.name}” is empty.` };
  if (f.size > POSTER.maxBytes) return { ok: false, message: `“${f.name}” is ${mb(f.size)}. The limit is ${mb(POSTER.maxBytes)}.` };
  return { ok: true, type };
}

function randomHex(bytes = 4): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * A brand-new object path for every upload: storage rules forbid overwriting, and the server's
 * confirm step only accepts `posters/<uid>/` followed by [A-Za-z0-9._-].
 */
export function posterPath(uid: string, type: PosterType, now = Date.now(), rand = randomHex()): string {
  return `posters/${uid}/${now}-${rand}.${POSTER_EXT[type]}`;
}
