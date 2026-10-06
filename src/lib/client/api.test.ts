import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, QUIZ_START_TIMEOUT_MS, api } from "@/lib/client/api";
import { SaveQueue } from "@/components/quiz/save-queue";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function stalledFetch() {
  return vi.fn((_u: string, init: RequestInit) => new Promise((_res, rej) => {
    init.signal!.addEventListener("abort", () => rej(new DOMException("aborted", "AbortError")));
  }));
}

describe("api timeout", () => {
  it("aborts a stalled request and throws ApiError(0, TIMEOUT)", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", stalledFetch());
    const p = api("/api/x", { token: "t" }).catch((e) => e);
    await vi.advanceTimersByTimeAsync(8100);
    const e = await p;
    expect(e).toBeInstanceOf(ApiError);
    expect(e).toMatchObject({ status: 0, code: "TIMEOUT" });
  });
  it("a long timeoutMs is not aborted at 8s but is at the limit", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", stalledFetch());
    let settled = false;
    const p = api("/api/quiz/start", { method: "POST", token: "t", timeoutMs: 55000 }).catch((e) => ((settled = true), e));
    await vi.advanceTimersByTimeAsync(8100);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(47000);
    expect(await p).toMatchObject({ status: 0, code: "TIMEOUT" });
  });
  it("quiz start timeout fits Gemini retries yet stays under the 60s route limit", () => {
    expect(QUIZ_START_TIMEOUT_MS).toBeGreaterThan(25000);
    expect(QUIZ_START_TIMEOUT_MS).toBeLessThan(60000);
  });
  it("does not time out a fast response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: 1 }), { status: 200 })));
    expect(await api("/api/x", { token: "t" })).toEqual({ ok: 1 });
  });
  it("a timed-out save keeps the answer queued and reports failed (retryable)", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", stalledFetch());
    // same shape as the runner's classifier: only 409 closes, 400/404 drop, anything else retries
    const classify = (e: unknown) =>
      e instanceof ApiError && e.status === 409 ? "closed" : e instanceof ApiError && (e.status === 400 || e.status === 404) ? "drop" : "retry";
    const q = new SaveQueue((i, c) => api<unknown>("/api/quiz/answer", { method: "POST", body: { index: i, choice: c }, token: "t" }).then(() => {}), classify);
    q.set(3, 1);
    const r = q.flush();
    await vi.advanceTimersByTimeAsync(8100);
    expect(await r).toBe("failed");
    expect(q.size).toBe(1);
  });
});
