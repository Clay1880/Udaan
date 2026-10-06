import { describe, expect, it } from "vitest";
import { clockOffset, formatClock, remainingAt, spokenTime, timerTone } from "@/components/quiz/format-time";

describe("formatClock", () => {
  it("formats minutes and seconds", () => {
    expect(formatClock(15 * 60 * 1000)).toBe("15:00");
    expect(formatClock(65_000)).toBe("01:05");
  });
  it("rounds partial seconds up so 0:00 only shows at true zero", () => {
    expect(formatClock(1)).toBe("00:01");
    expect(formatClock(0)).toBe("00:00");
    expect(formatClock(-500)).toBe("00:00");
  });
});

describe("timerTone", () => {
  it("is ok above 3 minutes, warn at or below 3, critical at or below 1", () => {
    expect(timerTone(181_000)).toBe("ok");
    expect(timerTone(180_000)).toBe("warn");
    expect(timerTone(61_000)).toBe("warn");
    expect(timerTone(60_000)).toBe("critical");
    expect(timerTone(0)).toBe("critical");
  });
});

describe("clockOffset / remainingAt", () => {
  it("measures remaining time on the server's clock, not the local one", () => {
    // Local clock is 10 minutes fast; server says 1s is left.
    const localNow = 1_000_000 + 600_000;
    const offset = clockOffset(1_000_000, localNow);
    expect(remainingAt(1_001_000, localNow, offset)).toBe(1000);
    expect(remainingAt(1_001_000, localNow + 400, offset)).toBe(600);
  });
  it("never goes below zero", () => {
    expect(remainingAt(1000, 5000, 0)).toBe(0);
  });
});

describe("spokenTime", () => {
  it("reads whole minutes, and seconds only in the last minute", () => {
    expect(spokenTime(15 * 60_000)).toBe("15 minutes left");
    expect(spokenTime(179_500)).toBe("3 minutes left");
    expect(spokenTime(61_000)).toBe("2 minutes left");
    expect(spokenTime(60_000)).toBe("1 minute left");
    expect(spokenTime(30_000)).toBe("30 seconds left");
    expect(spokenTime(1)).toBe("1 second left");
    expect(spokenTime(0)).toBe("Time is up");
  });
});
