import { describe, expect, it } from "vitest";
import { windowState } from "@/lib/window";
import { getWindow } from "@/lib/config";

const w = getWindow({});

describe("event window (IST)", () => {
  it("is before the window one second before 00:00 IST on 8 Oct", () => {
    expect(windowState(Date.parse("2026-10-07T18:29:59Z"), w)).toBe("before");
  });
  it("opens exactly at 00:00 IST on 8 Oct", () => {
    expect(windowState(Date.parse("2026-10-07T18:30:00Z"), w)).toBe("open");
  });
  it("is still open at 23:59:59 IST on 9 Oct", () => {
    expect(windowState(Date.parse("2026-10-09T18:29:59Z"), w)).toBe("open");
  });
  it("is closed at 00:00 IST on 10 Oct", () => {
    expect(windowState(Date.parse("2026-10-09T18:30:00Z"), w)).toBe("closed");
  });
});
