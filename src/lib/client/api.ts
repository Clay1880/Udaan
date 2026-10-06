export class ApiError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
  }
}

/** A stalled request must not hang the UI (e.g. the quiz finish waiting on a save); callers treat it as a network failure. */
export const API_TIMEOUT_MS = 8000;
/** Quiz start generates questions (Gemini retries, route maxDuration 60s): allow nearly the full server budget. */
export const QUIZ_START_TIMEOUT_MS = 55000;

export async function api<T>(
  path: string,
  { method = "GET", body, token, timeoutMs = API_TIMEOUT_MS }: { method?: string; body?: unknown; token: string; timeoutMs?: number },
): Promise<T> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(path, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
      signal: ctl.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new ApiError(res.status, data.error ?? "Request failed", data.code);
    return data as T;
  } catch (e) {
    if (ctl.signal.aborted) throw new ApiError(0, "The request timed out. Check your connection.", "TIMEOUT");
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
