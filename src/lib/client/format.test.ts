import { describe, expect, it } from "vitest";
import { formatIst, windowMessage } from "./format";

const openAt = Date.parse("2026-10-07T18:30:00Z"); // 8 Oct 00:00 IST
const closeAt = Date.parse("2026-10-09T18:30:00Z"); // 10 Oct 00:00 IST

describe("formatIst", () => {
  it("renders in IST regardless of the machine zone", () => {
    expect(formatIst(openAt)).toBe("8 Oct, 12:00 am IST");
    expect(formatIst(Date.parse("2026-10-09T18:29:00Z"))).toBe("9 Oct, 11:59 pm IST");
  });
});

describe("windowMessage", () => {
  it("covers every window state", () => {
    expect(windowMessage({ state: "before", openAt, closeAt })).toBe("Opens 8 Oct, 12:00 am IST");
    expect(windowMessage({ state: "open", openAt, closeAt })).toBe("Open till 9 Oct, 11:59 pm IST");
    expect(windowMessage({ state: "closed", openAt, closeAt })).toBe("Submissions are closed");
  });
});
