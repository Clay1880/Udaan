import { describe, expect, it } from "vitest";
import { deadlineOf, isExpired, remainingMs } from "@/lib/quiz/timer";

const start = 1_000_000;
describe("timer", () => {
  it("deadline is start + 15 minutes", () => {
    expect(deadlineOf(start)).toBe(start + 15 * 60 * 1000);
  });
  it("remaining at 14:59 is 1000ms", () => {
    expect(remainingMs(start, start + 14 * 60 * 1000 + 59_000)).toBe(1000);
  });
  it("remaining never goes negative", () => {
    expect(remainingMs(start, start + 20 * 60 * 1000)).toBe(0);
  });
  it("is not expired inside the grace window", () => {
    expect(isExpired(start, deadlineOf(start) + 5000)).toBe(false);
  });
  it("is expired just after the grace window", () => {
    expect(isExpired(start, deadlineOf(start) + 5001)).toBe(true);
  });
});
