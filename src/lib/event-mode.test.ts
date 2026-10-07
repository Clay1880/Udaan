import { describe, expect, it } from "vitest";
import { applyMode, parseSettings, SettingsPatch } from "./event-mode";
import { windowState } from "./window";

const w = { openAt: 1000, closeAt: 2000 };

describe("applyMode", () => {
  it("auto keeps the real window", () => {
    expect(applyMode(w, "auto")).toEqual(w);
    expect(windowState(500, applyMode(w, "auto"))).toBe("before");
  });
  it("open is open before, during and after the dates", () => {
    for (const t of [0, 500, 1500, 5000, Date.now()]) expect(windowState(t, applyMode(w, "open"))).toBe("open");
  });
  it("closed is closed even inside the dates", () => {
    for (const t of [0, 500, 1500, 5000]) expect(windowState(t, applyMode(w, "closed"))).toBe("closed");
  });
});

describe("parseSettings", () => {
  it("defaults to auto for missing or junk data", () => {
    expect(parseSettings(undefined)).toEqual({ quiz: "auto", poster: "auto" });
    expect(parseSettings({ quiz: "nope", poster: 3 })).toEqual({ quiz: "auto", poster: "auto" });
  });
  it("reads valid modes", () => {
    expect(parseSettings({ quiz: "open", poster: "closed" })).toEqual({ quiz: "open", poster: "closed" });
  });
});

describe("SettingsPatch", () => {
  it("accepts one or both keys, rejects empty, unknown keys and bad modes", () => {
    expect(SettingsPatch.safeParse({ quiz: "open" }).success).toBe(true);
    expect(SettingsPatch.safeParse({ quiz: "open", poster: "auto" }).success).toBe(true);
    expect(SettingsPatch.safeParse({}).success).toBe(false);
    expect(SettingsPatch.safeParse({ quiz: "maybe" }).success).toBe(false);
    expect(SettingsPatch.safeParse({ quiz: "open", extra: 1 }).success).toBe(false);
  });
});
