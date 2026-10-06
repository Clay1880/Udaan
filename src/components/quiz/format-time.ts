/** "MM:SS", rounding partial seconds up so 00:00 only shows at true zero. */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function timerTone(ms: number): "ok" | "warn" | "critical" {
  if (ms <= 60_000) return "critical";
  if (ms <= 180_000) return "warn";
  return "ok";
}

/** server clock minus local clock, measured from one API response. */
export const clockOffset = (serverNow: number, localNow: number) => serverNow - localNow;

/** Time left before `deadlineAt` (a server timestamp), read on the server's clock. */
export const remainingAt = (deadlineAt: number, localNow: number, offset: number) =>
  Math.max(0, deadlineAt - (localNow + offset));

/** Short phrase for screen readers: whole minutes, then seconds in the last minute. */
export function spokenTime(ms: number): string {
  const secs = Math.max(0, Math.ceil(ms / 1000));
  if (secs === 0) return "Time is up";
  if (secs < 60) return `${secs} second${secs === 1 ? "" : "s"} left`;
  const mins = Math.ceil(secs / 60);
  return `${mins} minute${mins === 1 ? "" : "s"} left`;
}
