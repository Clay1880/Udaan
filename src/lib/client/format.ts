const fmt = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

export const formatIst = (ms: number) => `${fmt.format(new Date(ms))} IST`;

export function windowMessage(w: { state: "before" | "open" | "closed"; openAt: number; closeAt: number }): string {
  if (w.state === "before") return `Opens ${formatIst(w.openAt)}`;
  // closeAt is exclusive (00:00 on 10 Oct); show the last open minute so it reads as "9 Oct".
  if (w.state === "open") return `Open till ${formatIst(w.closeAt - 1)}`;
  return "Submissions are closed";
}
