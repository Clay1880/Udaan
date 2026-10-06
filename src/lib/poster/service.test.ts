import { beforeEach, describe, expect, it } from "vitest";
import { confirmPoster, posterDriveName, PosterError, startPoster, validFileId, type PosterDeps, type PosterFileMeta, type PosterRecord } from "@/lib/poster/service";

const OPEN = Date.parse("2026-10-07T18:30:00Z");
const CLOSE = Date.parse("2026-10-09T18:30:00Z");

const A = "1AbCdEfGhIjKlMnOpQrS";
const B = "1ZyXwVuTsRqPoNmLkJiH";
const C = "1QqWwEeRrTtYyUuIiOoP";

let files: Map<string, PosterFileMeta>;
let records: Map<string, PosterRecord>;
let removed: string[];
let started: unknown[];
let clock: number;
let deps: PosterDeps;

beforeEach(() => {
  files = new Map();
  records = new Map();
  removed = [];
  started = [];
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
      startUpload: async (a) => {
        started.push(a);
        return "https://upload.example/session";
      },
    },
  };
});

const code = (p: Promise<unknown>) => p.then(() => null, (e: PosterError) => e.code);
const put = (id: string, contentType = "image/png", size = 1000, owner = "u1") => files.set(id, { contentType, size, owner });

describe("confirmPoster", () => {
  it("records a valid upload", async () => {
    put(A);
    const r = await confirmPoster("u1", A, deps);
    expect(r).toMatchObject({ path: A, fileType: "image/png", size: 1000, uploadedAt: clock });
    expect(records.get("u1")).toEqual(r);
  });
  it("replacing deletes the previous file", async () => {
    put(A);
    put(B, "application/pdf");
    await confirmPoster("u1", A, deps);
    await confirmPoster("u1", B, deps);
    expect(removed).toEqual([A]);
    expect(records.get("u1")?.path).toBe(B);
  });
  it("rejects another student's file without touching it", async () => {
    put(A, "image/png", 1000, "u2");
    expect(await code(confirmPoster("u1", A, deps))).toBe("BAD_PATH");
    expect(removed).toEqual([]);
    expect(files.has(A)).toBe(true);
  });
  it("rejects another student's file after close without deleting it", async () => {
    put(A, "image/png", 1000, "u2");
    clock = CLOSE;
    expect(await code(confirmPoster("u1", A, deps))).toBe("BAD_PATH");
    expect(removed).toEqual([]);
  });
  it("rejects malformed ids", async () => {
    for (const id of ["", "short", "../etc/passwd", `${A}?alt=media`, "x".repeat(101)]) {
      expect(await code(confirmPoster("u1", id, deps)), id).toBe("BAD_PATH");
    }
  });
  it("rejects a file that was never uploaded", async () => {
    expect(await code(confirmPoster("u1", A, deps))).toBe("NOT_FOUND");
  });
  it("rejects and deletes a wrong content type", async () => {
    put(A, "text/plain");
    expect(await code(confirmPoster("u1", A, deps))).toBe("BAD_TYPE");
    expect(removed).toEqual([A]);
    expect(records.has("u1")).toBe(false);
  });
  it("rejects and deletes an oversize file", async () => {
    put(A, "application/pdf", 10 * 1024 * 1024 + 1);
    expect(await code(confirmPoster("u1", A, deps))).toBe("TOO_LARGE");
    expect(removed).toEqual([A]);
  });
  it("accepts exactly 10 MB", async () => {
    put(A, "application/pdf", 10 * 1024 * 1024);
    await expect(confirmPoster("u1", A, deps)).resolves.toBeTruthy();
  });
  it("rejects before the window opens and deletes the file", async () => {
    clock = OPEN - 1;
    put(A);
    expect(await code(confirmPoster("u1", A, deps))).toBe("WINDOW_NOT_OPEN");
    expect(removed).toEqual([A]);
  });
  it("rejects after the window closes, keeping the earlier poster", async () => {
    put(A);
    await confirmPoster("u1", A, deps);
    clock = CLOSE;
    put(B);
    expect(await code(confirmPoster("u1", B, deps))).toBe("WINDOW_CLOSED");
    expect(records.get("u1")?.path).toBe(A);
    expect(removed).toEqual([B]);
  });
  it("re-confirming the accepted file after close is rejected without deleting it", async () => {
    put(A);
    const rec = await confirmPoster("u1", A, deps);
    clock = CLOSE;
    expect(await code(confirmPoster("u1", A, deps))).toBe("WINDOW_CLOSED");
    expect(removed).toEqual([]);
    expect(files.has(A)).toBe(true);
    expect(records.get("u1")).toEqual(rec);
  });
  it("re-confirming the accepted file with a now-bad type or size keeps the file and record", async () => {
    put(A);
    const rec = await confirmPoster("u1", A, deps);
    put(A, "text/plain");
    expect(await code(confirmPoster("u1", A, deps))).toBe("BAD_TYPE");
    put(A, "image/png", 10 * 1024 * 1024 + 1);
    expect(await code(confirmPoster("u1", A, deps))).toBe("TOO_LARGE");
    expect(removed).toEqual([]);
    expect(records.get("u1")).toEqual(rec);
  });
  it("still deletes a different offending own file while a poster is recorded", async () => {
    put(A);
    await confirmPoster("u1", A, deps);
    put(B, "text/plain");
    expect(await code(confirmPoster("u1", B, deps))).toBe("BAD_TYPE");
    clock = CLOSE;
    put(C);
    expect(await code(confirmPoster("u1", C, deps))).toBe("WINDOW_CLOSED");
    expect(removed).toEqual([B, C]);
    expect(files.has(A)).toBe(true);
  });
});

describe("startPoster", () => {
  const input = { name: "FE_IT_12.png", contentType: "image/png", size: 5000, origin: "https://x.example" };
  it("opens an upload session for the student", async () => {
    expect(await startPoster("u1", input, deps)).toBe("https://upload.example/session");
    expect(started).toEqual([{ uid: "u1", ...input }]);
  });
  it("is closed outside the window", async () => {
    clock = OPEN - 1;
    expect(await code(startPoster("u1", input, deps))).toBe("WINDOW_NOT_OPEN");
    clock = CLOSE;
    expect(await code(startPoster("u1", input, deps))).toBe("WINDOW_CLOSED");
    expect(started).toEqual([]);
  });
  it("rejects bad types and sizes before contacting storage", async () => {
    expect(await code(startPoster("u1", { ...input, contentType: "text/html" }, deps))).toBe("BAD_TYPE");
    expect(await code(startPoster("u1", { ...input, size: 0 }, deps))).toBe("TOO_LARGE");
    expect(await code(startPoster("u1", { ...input, size: 10 * 1024 * 1024 + 1 }, deps))).toBe("TOO_LARGE");
    expect(await code(startPoster("u1", { ...input, size: 1.5 }, deps))).toBe("TOO_LARGE");
    expect(started).toEqual([]);
  });
});

describe("posterDriveName / validFileId", () => {
  it("names files by year, branch and roll number", () => {
    expect(posterDriveName({ year: "FE", branch: "IT", rollNo: "12" }, "image/png")).toBe("FE_IT_12.png");
    expect(posterDriveName({ year: "TE", branch: "COMP", rollNo: "A/12-3" }, "application/pdf")).toBe("TE_COMP_A_12-3.pdf");
    expect(posterDriveName({ year: "SE", branch: "ARE", rollNo: "7" }, "image/jpeg")).toBe("SE_ARE_7.jpg");
  });
  it("accepts Drive-style ids only", () => {
    expect(validFileId(A)).toBe(true);
    expect(validFileId("a b c d e f g h i j")).toBe(false);
  });
});
