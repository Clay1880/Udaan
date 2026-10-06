import { describe, expect, it } from "vitest";
import { POSTER } from "@/lib/config";
import { checkPosterFile, posterFileType, posterPath } from "@/lib/poster/client";
import { confirmPoster, type PosterDeps, type PosterRecord } from "@/lib/poster/service";

const MB = 1024 * 1024;

describe("posterFileType", () => {
  it("uses the browser's type when it is allowed", () => {
    expect(posterFileType({ name: "a.png", type: "image/png" })).toBe("image/png");
    expect(posterFileType({ name: "a.pdf", type: "application/pdf" })).toBe("application/pdf");
  });
  it("normalises legacy JPEG types", () => {
    expect(posterFileType({ name: "a.jpg", type: "image/jpg" })).toBe("image/jpeg");
    expect(posterFileType({ name: "a.jpg", type: "image/pjpeg" })).toBe("image/jpeg");
  });
  it("falls back to the extension when the browser gives no type", () => {
    expect(posterFileType({ name: "My Poster.PDF", type: "" })).toBe("application/pdf");
    expect(posterFileType({ name: "x.jpeg", type: "" })).toBe("image/jpeg");
    expect(posterFileType({ name: "x.JPG", type: "" })).toBe("image/jpeg");
    expect(posterFileType({ name: "x.png", type: "" })).toBe("image/png");
  });
  it("rejects everything else, even with an allowed-looking extension", () => {
    expect(posterFileType({ name: "x.gif", type: "image/gif" })).toBeNull();
    expect(posterFileType({ name: "x.png", type: "image/webp" })).toBeNull();
    expect(posterFileType({ name: "x.heic", type: "" })).toBeNull();
    expect(posterFileType({ name: "noext", type: "" })).toBeNull();
  });
});

describe("checkPosterFile", () => {
  it("accepts allowed files up to exactly 10 MB", () => {
    expect(checkPosterFile({ name: "a.png", type: "image/png", size: POSTER.maxBytes })).toEqual({ ok: true, type: "image/png" });
  });
  it("explains a wrong type, naming the file", () => {
    const r = checkPosterFile({ name: "art.gif", type: "image/gif", size: 10 });
    expect(r).toEqual({ ok: false, message: "“art.gif” is not a PDF, JPG or PNG file." });
  });
  it("explains an oversized file with its size", () => {
    const r = checkPosterFile({ name: "big.pdf", type: "application/pdf", size: 12.4 * MB });
    expect(r).toEqual({ ok: false, message: "“big.pdf” is 12.4 MB. The limit is 10 MB." });
  });
  it("rejects an empty file", () => {
    expect(checkPosterFile({ name: "e.png", type: "image/png", size: 0 })).toEqual({ ok: false, message: "“e.png” is empty." });
  });
});

describe("posterPath", () => {
  it("builds posters/<uid>/<time>-<random>.<ext>", () => {
    expect(posterPath("u1", "image/png", 1700000000000, "a1b2c3d4")).toBe("posters/u1/1700000000000-a1b2c3d4.png");
    expect(posterPath("u1", "image/jpeg", 1, "ff")).toBe("posters/u1/1-ff.jpg");
    expect(posterPath("u1", "application/pdf", 1, "ff")).toBe("posters/u1/1-ff.pdf");
  });
  it("defaults to a fresh name every call, so uploads never overwrite", () => {
    const seen = new Set(Array.from({ length: 200 }, () => posterPath("u1", "image/png")));
    expect(seen.size).toBe(200);
  });
  it("is accepted by the server's confirm path check", async () => {
    const files = new Map<string, { contentType: string; size: number }>();
    const records = new Map<string, PosterRecord>();
    const deps: PosterDeps = {
      now: () => 5,
      window: { openAt: 0, closeAt: 10 },
      store: {
        head: async (p) => files.get(p) ?? null,
        remove: async () => {},
        get: async (uid) => records.get(uid) ?? null,
        set: async (uid, r) => void records.set(uid, r),
      },
    };
    for (const type of POSTER.allowedTypes) {
      const uid = "AbC123xyzDEF456ghiJKL789mno";
      const path = posterPath(uid, type);
      files.set(path, { contentType: type, size: 100 });
      await expect(confirmPoster(uid, path, deps)).resolves.toMatchObject({ path, fileType: type });
    }
  });
});
