"use client";
import { useEffect } from "react";
import type { Me } from "./use-me";

/** Re-fetches `me` when the window boundary (opening or closing) passes while the page stays open. */
export function useWindowBoundary(me: Me | null, refresh: () => Promise<unknown>, which: "window" | "posterWindow" = "window"): void {
  const w = me?.[which];
  // An organiser override has no schedule to wait for; it shows up on the next refresh.
  const boundary = w && w.mode === "auto" ? (w.state === "before" ? w.openAt : w.state === "open" ? w.closeAt : null) : null;
  const serverNow = me?.serverNow;
  useEffect(() => {
    if (boundary === null || serverNow === undefined) return;
    const wait = boundary - serverNow + 1000;
    if (wait > 2 ** 31 - 1) return;
    const t = setTimeout(() => void refresh().catch(() => {}), Math.max(wait, 0));
    return () => clearTimeout(t);
  }, [boundary, serverNow, refresh]);
}
