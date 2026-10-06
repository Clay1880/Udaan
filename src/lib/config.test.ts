import { describe, expect, it } from "vitest";
import { getAdminEmails, getWindow, isAdminEmail } from "@/lib/config";

describe("getWindow", () => {
  it("defaults to 8-9 Oct 2026 IST", () => {
    const w = getWindow({});
    expect(w.openAt).toBe(Date.parse("2026-10-07T18:30:00Z"));
    expect(w.closeAt).toBe(Date.parse("2026-10-09T18:30:00Z"));
  });
  it("treats empty override strings as unset", () => {
    expect(getWindow({ WINDOW_OPEN_ISO: "", WINDOW_CLOSE_ISO: "" }).openAt).toBe(
      Date.parse("2026-10-07T18:30:00Z"),
    );
  });
  it("honours overrides", () => {
    expect(getWindow({ WINDOW_OPEN_ISO: "2026-01-01T00:00:00Z" }).openAt).toBe(
      Date.parse("2026-01-01T00:00:00Z"),
    );
  });
});

describe("admin allowlist", () => {
  const env = { ADMIN_EMAILS: " Boss@Gmail.com , second@gmail.com " };
  it("parses and lowercases", () => {
    expect(getAdminEmails(env)).toEqual(["boss@gmail.com", "second@gmail.com"]);
  });
  it("matches case-insensitively", () => {
    expect(isAdminEmail("BOSS@gmail.com", env)).toBe(true);
  });
  it("rejects others, empty and missing emails", () => {
    expect(isAdminEmail("student@gmail.com", env)).toBe(false);
    expect(isAdminEmail("", env)).toBe(false);
    expect(isAdminEmail(undefined, env)).toBe(false);
  });
  it("nobody is admin when env is unset", () => {
    expect(isAdminEmail("boss@gmail.com", {})).toBe(false);
  });
});
