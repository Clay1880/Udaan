import { createHmac, timingSafeEqual } from "node:crypto";

const sig = (secret: string, id: string, exp: number) => createHmac("sha256", secret).update(`${id}.${exp}`).digest("hex");

/** A same-origin link to a poster that works without a login header (for <img>, downloads) until it expires. */
export function signPosterUrl(secret: string, id: string, ttlMs: number, now = Date.now()): string {
  if (!secret) throw new Error("POSTER_URL_SECRET is not set");
  const exp = now + ttlMs;
  return `/api/poster/file?id=${encodeURIComponent(id)}&exp=${exp}&sig=${sig(secret, id, exp)}`;
}

/** The file id if the link is genuine and unexpired, else null. */
export function verifyPosterUrl(secret: string, params: URLSearchParams, now = Date.now()): string | null {
  const id = params.get("id") ?? "";
  const exp = Number(params.get("exp"));
  const given = params.get("sig") ?? "";
  if (!secret || !id || !Number.isFinite(exp) || exp < now) return null;
  const want = Buffer.from(sig(secret, id, exp));
  const got = Buffer.from(given);
  return got.length === want.length && timingSafeEqual(got, want) ? id : null;
}
