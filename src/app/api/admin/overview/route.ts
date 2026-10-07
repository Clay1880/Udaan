import type { AdminRow } from "@/lib/admin/rows";
import { route } from "@/lib/server/http";
import { requireAdmin } from "@/lib/server/auth";
import { quizDeps } from "@/lib/server/deps";
import { settleExpiredSummaries } from "@/lib/quiz/service";
import { listAttemptSummaries, listPosterRecords, listUsers, signedReadUrl } from "@/lib/server/repo";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Signed poster links last an hour; the admin page refetches before they run out. */
const POSTER_URL_TTL_MS = 60 * 60 * 1000;

// Read-only: admins view and export. There is deliberately no write handler here.
export const GET = route(async (req) => {
  await requireAdmin(req);
  const [users, attempts, posters] = await Promise.all([listUsers(), listAttemptSummaries(), listPosterRecords()]);
  // Students who answered and left never trigger scoring themselves: finalize expired attempts first.
  await settleExpiredSummaries(attempts, await quizDeps());
  const rows: AdminRow[] = await Promise.all(
    users.map(async (u) => {
      const a = attempts.get(u.uid);
      const p = posters.get(u.uid);
      return {
        uid: u.uid,
        name: u.name,
        email: u.email,
        rollNo: u.rollNo,
        year: u.year,
        branch: u.branch,
        quiz: a
          ? {
              status: a.status,
              score: a.score ?? null,
              timeMs: a.status === "submitted" && a.submittedAt != null ? Math.max(0, a.submittedAt - a.startedAt) : null,
            }
          : null,
        poster: p
          ? { uploadedAt: p.uploadedAt, fileType: p.fileType, url: await signedReadUrl(p.path, POSTER_URL_TTL_MS) }
          : null,
      };
    }),
  );
  rows.sort((x, y) => x.name.localeCompare(y.name, "en", { sensitivity: "base" }) || x.rollNo.localeCompare(y.rollNo));
  // Student PII: never let a browser or proxy cache this.
  return Response.json({ rows }, { headers: { "Cache-Control": "private, no-store" } });
});
