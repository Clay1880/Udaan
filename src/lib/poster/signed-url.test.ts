import { describe, expect, it } from "vitest";
import { signPosterUrl, verifyPosterUrl } from "@/lib/poster/signed-url";

const params = (u: string) => new URL(u, "http://x").searchParams;

describe("signed poster urls", () => {
  it("round-trips until expiry", () => {
    const u = signPosterUrl("s3cret", "abc123", 1000, 5000);
    expect(u.startsWith("/api/poster/file?")).toBe(true);
    expect(verifyPosterUrl("s3cret", params(u), 5999)).toBe("abc123");
    expect(verifyPosterUrl("s3cret", params(u), 6001)).toBeNull();
  });
  it("rejects a tampered id, expiry, signature or secret", () => {
    const u = params(signPosterUrl("s3cret", "abc123", 1000, 5000));
    const swap = (k: string, v: string) => {
      const p = new URLSearchParams(u);
      p.set(k, v);
      return p;
    };
    expect(verifyPosterUrl("s3cret", swap("id", "other"), 5100)).toBeNull();
    expect(verifyPosterUrl("s3cret", swap("exp", "999999"), 5100)).toBeNull();
    expect(verifyPosterUrl("s3cret", swap("sig", "00"), 5100)).toBeNull();
    expect(verifyPosterUrl("wrong", u, 5100)).toBeNull();
    expect(verifyPosterUrl("", u, 5100)).toBeNull();
  });
  it("refuses to sign without a secret", () => {
    expect(() => signPosterUrl("", "abc", 1000)).toThrow();
  });
});
