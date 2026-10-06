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
  quiz: { status: string; score: number | null } | null;
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

/** Highest score first; in-progress attempts, then students who never started, at the bottom. Stable. */
export function sortByScore(rows: AdminRow[]): AdminRow[] {
  return [...rows].sort((a, b) => rank(b) - rank(a));
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

const HEADERS = ["Name", "Roll No", "Year", "Branch", "Email", "Quiz status", "Quiz score", "Poster submitted", "Poster time (IST)"];

/** CSV of the given rows. Every cell goes through `csvCell`, which neutralises formula injection. */
export function adminCsv(rows: AdminRow[]): string {
  return toCsv(
    HEADERS,
    rows.map((r) => [
      r.name,
      r.rollNo,
      r.year,
      r.branch,
      r.email,
      r.quiz ? r.quiz.status.replace(/_/g, " ") : "not started",
      r.quiz?.status === "submitted" ? (r.quiz.score ?? "") : "",
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
