/**
 * Minimal Google Drive client for poster storage (server-only). Authenticates as the organiser's
 * own Google account with a long-lived OAuth refresh token, because service accounts have no Drive
 * quota. The `drive.file` scope only ever sees files this app created.
 */

const FIELDS = "id,mimeType,size,appProperties,trashed";

export interface DriveFile {
  id: string;
  mimeType: string;
  size: number;
  uid: string;
}

let cached: { token: string; expiresAt: number } | null = null;

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set`);
  return v;
}

async function accessToken(): Promise<string> {
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env("GOOGLE_CLIENT_ID"),
      client_secret: env("GOOGLE_CLIENT_SECRET"),
      refresh_token: env("GOOGLE_REFRESH_TOKEN"),
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`Google token refresh failed (${res.status}): ${await res.text()}`);
  const j = (await res.json()) as { access_token: string; expires_in: number };
  cached = { token: j.access_token, expiresAt: Date.now() + j.expires_in * 1000 };
  return cached.token;
}

const auth = async () => ({ Authorization: `Bearer ${await accessToken()}` });

/** Open a resumable upload session; the browser PUTs the file bytes to the returned URL. */
export async function createUploadSession(a: { name: string; mimeType: string; size: number; uid: string; origin: string }): Promise<string> {
  const res = await fetch(`https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=${FIELDS}`, {
    method: "POST",
    headers: {
      ...(await auth()),
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": a.mimeType,
      "X-Upload-Content-Length": String(a.size),
      // Lets the browser at this origin read the upload response (CORS).
      Origin: a.origin,
    },
    body: JSON.stringify({ name: a.name, parents: [env("DRIVE_FOLDER_ID")], appProperties: { uid: a.uid } }),
  });
  const url = res.headers.get("location");
  if (!res.ok || !url) throw new Error(`Drive upload session failed (${res.status}): ${await res.text()}`);
  return url;
}

export async function getFile(id: string): Promise<DriveFile | null> {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?fields=${FIELDS}`, { headers: await auth() });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Drive get failed (${res.status}): ${await res.text()}`);
  const j = (await res.json()) as { id: string; mimeType: string; size?: string; appProperties?: { uid?: string }; trashed?: boolean };
  if (j.trashed) return null;
  return { id: j.id, mimeType: j.mimeType, size: Number(j.size ?? 0), uid: j.appProperties?.uid ?? "" };
}

export async function deleteFile(id: string): Promise<void> {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}`, { method: "DELETE", headers: await auth() });
  if (!res.ok && res.status !== 404) throw new Error(`Drive delete failed (${res.status}): ${await res.text()}`);
}

/** The raw upstream response for a file's bytes (stream it; don't buffer). */
export async function downloadFile(id: string): Promise<Response> {
  return fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?alt=media`, { headers: await auth() });
}
