import { QUIZ } from "@/lib/config";
import { formatIst } from "@/lib/client/format";
import { toCsv } from "@/lib/csv";

/** One registered student as returned by `GET /api/admin/overview`. */
export interface AdminRow {
  uid: string;
  name: string;
  email: string;
  rollNo: string;
  year: string;
  branch: string;
  quiz: { status: string; score: number | null; timeMs?: number | null } | null;
  poster: { uploadedAt: number; fileType: string; url: string } | null;
}

export interface Filters {
  year: string;
  branch: string;
  q: string;
}

export function filterRows(rows: AdminRow[], { year, branch, q }: Filters): AdminRow[] {
  const needle = q.trim().toLowerCase();
  return rows.filter(
    (r) =>
      (!year || r.year === year) &&
      (!branch || r.branch === branch) &&
      (!needle || `${r.name}\n${r.rollNo}\n${r.email}`.toLowerCase().includes(needle)),
  );
}

const rank = (r: AdminRow) => (r.quiz?.status === "submitted" ? (r.quiz.score ?? 0) : r.quiz ? -1 : -2);

const timeOf = (r: AdminRow) => r.quiz?.timeMs ?? Infinity;

/** Highest score first, then fastest; in-progress attempts, then students who never started, at the bottom. Stable. */
export function sortByScore(rows: AdminRow[]): AdminRow[] {
  return [...rows].sort((a, b) => rank(b) - rank(a) || (timeOf(a) === timeOf(b) ? 0 : timeOf(a) < timeOf(b) ? -1 : 1));
}

/** uid -> rank (1 = winner) for submitted attempts only. Equal score and equal time share a rank (1, 1, 3). */
export function rankRows(rows: AdminRow[]): Map<string, number> {
  const ranks = new Map<string, number>();
  const done = sortByScore(rows).filter((r) => r.quiz?.status === "submitted");
  done.forEach((r, i) => {
    const p = done[i - 1];
    const same = p && (p.quiz!.score ?? 0) === (r.quiz!.score ?? 0) && timeOf(p) === timeOf(r);
    ranks.set(r.uid, same ? ranks.get(p.uid)! : i + 1);
  });
  return ranks;
}

/** mm:ss, or "" when there is no finished attempt. */
export function formatDuration(ms: number | null | undefined): string {
  if (ms == null) return "";
  const t = Math.round(ms / 1000);
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
}

export function quizLabel(r: AdminRow): string {
  if (!r.quiz) return "Not started";
  if (r.quiz.status === "submitted") return `${r.quiz.score ?? 0}/${QUIZ.questionCount}`;
  return "In progress";
}

export function summarise(rows: AdminRow[]) {
  return {
    registered: rows.length,
    quizDone: rows.filter((r) => r.quiz?.status === "submitted").length,
    quizInProgress: rows.filter((r) => r.quiz && r.quiz.status !== "submitted").length,
    posters: rows.filter((r) => r.poster).length,
  };
}

const HEADERS = ["Name", "Registration No", "Year", "Branch", "Email", "Quiz status", "Quiz score", "Quiz time (sec)", "Poster submitted", "Poster time (IST)"];

/** CSV of the given rows. Every cell goes through `csvCell`, which neutralises formula injection. */
export function adminCsv(rows: AdminRow[], withRank = false): string {
  const ranks = withRank ? rankRows(rows) : null;
  return toCsv(
    withRank ? ["Rank", ...HEADERS] : HEADERS,
    rows.map((r) => [
      ...(ranks ? [ranks.get(r.uid) ?? ""] : []),
      r.name,
      r.rollNo,
      r.year,
      r.branch,
      r.email,
      r.quiz ? r.quiz.status.replace(/_/g, " ") : "not started",
      r.quiz?.status === "submitted" ? (r.quiz.score ?? "") : "",
      r.quiz?.status === "submitted" && r.quiz.timeMs != null ? Math.round(r.quiz.timeMs / 1000) : "",
      r.poster ? "yes" : "no",
      r.poster ? formatIst(r.poster.uploadedAt) : "",
    ]),
  );
}

export const FILE_EXT: Record<string, string> = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png" };

/** Fold accents away and keep only [A-Za-z0-9], joining the rest with `sep`. */
function ascii(s: string, sep: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9]+/g, sep)
    .replace(new RegExp(`^\\${sep}+|\\${sep}+$`, "g"), "");
}

/** `<year>_<branch>_<roll>_<name>.<ext>`, ASCII-only and unique within `used` (which it updates). */
export function posterFileName(r: AdminRow, used: Set<string>): string {
  const base = [ascii(r.year, "-"), ascii(r.branch, "-"), ascii(r.rollNo, "-") || "roll", ascii(r.name, "_") || "student"].join("_");
  const ext = FILE_EXT[r.poster?.fileType ?? ""] ?? "bin";
  let name = `${base}.${ext}`;
  for (let i = 2; used.has(name.toLowerCase()); i++) name = `${base}-${i}.${ext}`;
  used.add(name.toLowerCase());
  return name;
}
