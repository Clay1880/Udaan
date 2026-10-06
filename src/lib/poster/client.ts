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

export interface Upload {
  /** Resolves with the Drive file id once the upload finishes. */
  done: Promise<string>;
  abort(): void;
}

export class UploadError extends Error {
  code = "upload/failed";
}

/** PUT the file to a Drive resumable-upload URL, reporting progress as 0-100. */
export function putFile(url: string, file: File, type: PosterType, onProgress: (pct: number) => void): Upload {
  const xhr = new XMLHttpRequest();
  const done = new Promise<string>((resolve, reject) => {
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", type);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      let id = "";
      try {
        id = String(JSON.parse(xhr.responseText).id ?? "");
      } catch {}
      if (xhr.status >= 200 && xhr.status < 300 && id) resolve(id);
      else reject(new UploadError(`Upload failed (${xhr.status})`));
    };
    xhr.onerror = () => reject(new UploadError("Network error during upload"));
    xhr.onabort = () => reject(new UploadError("Upload cancelled"));
    xhr.send(file);
  });
  return { done, abort: () => xhr.abort() };
}
