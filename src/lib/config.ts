export const YEARS = ["FE", "SE", "TE", "BE"] as const;
export type Year = (typeof YEARS)[number];

export const BRANCHES = ["COMP", "IT", "ENTC", "MECH", "ARE"] as const;
export type Branch = (typeof BRANCHES)[number];

export const BRANCH_LABELS: Record<Branch, string> = {
  COMP: "Computer Engineering",
  IT: "Information Technology",
  ENTC: "Electronics & Telecommunication",
  MECH: "Mechanical Engineering",
  ARE: "Automation & Robotics",
};

export const QUIZ = {
  questionCount: 20,
  durationMs: 15 * 60 * 1000,
  graceMs: 5000,
} as const;

export const POSTER = {
  maxBytes: 10 * 1024 * 1024,
  allowedTypes: ["application/pdf", "image/jpeg", "image/png"],
} as const;

// 00:00 on 8 Oct 2026 IST (UTC+5:30) and 00:00 on 10 Oct 2026 IST (exclusive).
const DEFAULT_OPEN = "2026-10-07T18:30:00Z";
const DEFAULT_CLOSE = "2026-10-09T18:30:00Z";

type Env = Record<string, string | undefined>;

export function getWindow(env: Env = process.env) {
  return {
    openAt: Date.parse(env.WINDOW_OPEN_ISO || DEFAULT_OPEN),
    closeAt: Date.parse(env.WINDOW_CLOSE_ISO || DEFAULT_CLOSE),
  };
}

export function getAdminEmails(env: Env = process.env): string[] {
  return (env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email: string | null | undefined, env: Env = process.env): boolean {
  if (!email) return false;
  return getAdminEmails(env).includes(email.trim().toLowerCase());
}
