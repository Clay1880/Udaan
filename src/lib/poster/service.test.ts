import { beforeEach, describe, expect, it } from "vitest";
import { confirmPoster, PosterError, type PosterDeps, type PosterRecord } from "@/lib/poster/service";

const OPEN = Date.parse("2026-10-07T18:30:00Z");
const CLOSE = Date.parse("2026-10-09T18:30:00Z");

let files: Map<string, { contentType: string; size: number }>;
let records: Map<string, PosterRecord>;
let removed: string[];
let clock: number;
let deps: PosterDeps;

beforeEach(() => {
  files = new Map();
  records = new Map();
  removed = [];
  clock = OPEN + 5000;
  deps = {
    now: () => clock,
    window: { openAt: OPEN, closeAt: CLOSE },
    store: {
      head: async (p) => files.get(p) ?? null,
      remove: async (p) => {
        removed.push(p);
        files.delete(p);
      },
      get: async (uid) => records.get(uid) ?? null,
      set: async (uid, r) => void records.set(uid, r),
    },
  };
});

const code = (p: Promise<unknown>) => p.then(() => null, (e: PosterError) => e.code);
const put = (path: string, contentType = "image/png", size = 1000) => files.set(path, { contentType, size });

describe("confirmPoster", () => {
  it("records a valid upload", async () => {
    put("posters/u1/1-a.png");
    const r = await confirmPoster("u1", "posters/u1/1-a.png", deps);
    expect(r).toMatchObject({ path: "posters/u1/1-a.png", fileType: "image/png", size: 1000, uploadedAt: clock });
    expect(records.get("u1")).toEqual(r);
  });
  it("replacing deletes the previous file", async () => {
    put("posters/u1/1-a.png");
    put("posters/u1/2-b.pdf", "application/pdf");
    await confirmPoster("u1", "posters/u1/1-a.png", deps);
    await confirmPoster("u1", "posters/u1/2-b.pdf", deps);
    expect(removed).toEqual(["posters/u1/1-a.png"]);
    expect(records.get("u1")?.path).toBe("posters/u1/2-b.pdf");
  });
  it("rejects another student's path without touching storage", async () => {
    put("posters/u2/1-a.png");
    expect(await code(confirmPoster("u1", "posters/u2/1-a.png", deps))).toBe("BAD_PATH");
    expect(removed).toEqual([]);
  });
  it("rejects traversal and nested paths", async () => {
    expect(await code(confirmPoster("u1", "posters/u1/../u2/x.png", deps))).toBe("BAD_PATH");
    expect(await code(confirmPoster("u1", "posters/u1/a/b.png", deps))).toBe("BAD_PATH");
    expect(await code(confirmPoster("u1", "posters/u1/..", deps))).toBe("BAD_PATH");
  });
  it("rejects a file that was never uploaded", async () => {
    expect(await code(confirmPoster("u1", "posters/u1/ghost.png", deps))).toBe("NOT_FOUND");
  });
  it("rejects and deletes a wrong content type", async () => {
    put("posters/u1/x.png", "text/plain");
    expect(await code(confirmPoster("u1", "posters/u1/x.png", deps))).toBe("BAD_TYPE");
    expect(removed).toEqual(["posters/u1/x.png"]);
    expect(records.has("u1")).toBe(false);
  });
  it("rejects and deletes an oversize file", async () => {
    put("posters/u1/x.pdf", "application/pdf", 10 * 1024 * 1024 + 1);
    expect(await code(confirmPoster("u1", "posters/u1/x.pdf", deps))).toBe("TOO_LARGE");
    expect(removed).toEqual(["posters/u1/x.pdf"]);
  });
  it("accepts exactly 10 MB", async () => {
    put("posters/u1/x.pdf", "application/pdf", 10 * 1024 * 1024);
    await expect(confirmPoster("u1", "posters/u1/x.pdf", deps)).resolves.toBeTruthy();
  });
  it("rejects before the window opens and deletes the file", async () => {
    clock = OPEN - 1;
    put("posters/u1/x.png");
    expect(await code(confirmPoster("u1", "posters/u1/x.png", deps))).toBe("WINDOW_NOT_OPEN");
    expect(removed).toEqual(["posters/u1/x.png"]);
  });
  it("rejects after the window closes, keeping the earlier poster", async () => {
    put("posters/u1/1-a.png");
    await confirmPoster("u1", "posters/u1/1-a.png", deps);
    clock = CLOSE;
    put("posters/u1/2-b.png");
    expect(await code(confirmPoster("u1", "posters/u1/2-b.png", deps))).toBe("WINDOW_CLOSED");
    expect(records.get("u1")?.path).toBe("posters/u1/1-a.png");
    expect(removed).toEqual(["posters/u1/2-b.png"]);
  });
  it("re-confirming the accepted path after close is rejected without deleting it", async () => {
    put("posters/u1/1-a.png");
    const rec = await confirmPoster("u1", "posters/u1/1-a.png", deps);
    clock = CLOSE;
    expect(await code(confirmPoster("u1", "posters/u1/1-a.png", deps))).toBe("WINDOW_CLOSED");
    expect(removed).toEqual([]);
    expect(files.has("posters/u1/1-a.png")).toBe(true);
    expect(records.get("u1")).toEqual(rec);
  });
  it("re-confirming the accepted path with a now-bad type or size keeps the file and record", async () => {
    put("posters/u1/1-a.png");
    const rec = await confirmPoster("u1", "posters/u1/1-a.png", deps);
    put("posters/u1/1-a.png", "text/plain");
    expect(await code(confirmPoster("u1", "posters/u1/1-a.png", deps))).toBe("BAD_TYPE");
    put("posters/u1/1-a.png", "image/png", 10 * 1024 * 1024 + 1);
    expect(await code(confirmPoster("u1", "posters/u1/1-a.png", deps))).toBe("TOO_LARGE");
    expect(removed).toEqual([]);
    expect(records.get("u1")).toEqual(rec);
  });
  it("still deletes a different offending own-path file while a poster is recorded", async () => {
    put("posters/u1/1-a.png");
    await confirmPoster("u1", "posters/u1/1-a.png", deps);
    put("posters/u1/2-b.txt", "text/plain");
    expect(await code(confirmPoster("u1", "posters/u1/2-b.txt", deps))).toBe("BAD_TYPE");
    clock = CLOSE;
    put("posters/u1/3-c.png");
    expect(await code(confirmPoster("u1", "posters/u1/3-c.png", deps))).toBe("WINDOW_CLOSED");
    expect(removed).toEqual(["posters/u1/2-b.txt", "posters/u1/3-c.png"]);
    expect(files.has("posters/u1/1-a.png")).toBe(true);
  });
});
