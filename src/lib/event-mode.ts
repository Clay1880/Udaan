import { z } from "zod";

/** "auto" follows the event dates; "open"/"closed" is an organiser override for testing. */
export const MODES = ["auto", "open", "closed"] as const;
export type Mode = (typeof MODES)[number];

export interface EventSettings {
  quiz: Mode;
  poster: Mode;
}

export const DEFAULT_SETTINGS: EventSettings = { quiz: "auto", poster: "auto" };

export const SettingsPatch = z
  .object({ quiz: z.enum(MODES).optional(), poster: z.enum(MODES).optional() })
  .strict()
  .refine((p) => p.quiz !== undefined || p.poster !== undefined, "Nothing to change");

const asMode = (v: unknown): Mode => ((MODES as readonly unknown[]).includes(v) ? (v as Mode) : "auto");

/** Tolerant read of the stored document: anything missing or unknown falls back to "auto". */
export function parseSettings(raw: unknown): EventSettings {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return { quiz: asMode(o.quiz), poster: asMode(o.poster) };
}

/** The window the server enforces for a feature, given its mode. */
export function applyMode(w: { openAt: number; closeAt: number }, mode: Mode): { openAt: number; closeAt: number } {
  if (mode === "open") return { openAt: 0, closeAt: Number.MAX_SAFE_INTEGER };
  if (mode === "closed") return { openAt: 0, closeAt: 0 };
  return w;
}
