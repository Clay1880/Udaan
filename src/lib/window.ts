export type WindowState = "before" | "open" | "closed";

export function windowState(now: number, w: { openAt: number; closeAt: number }): WindowState {
  if (now < w.openAt) return "before";
  if (now >= w.closeAt) return "closed";
  return "open";
}
