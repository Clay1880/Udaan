import { getWindow, isAdminEmail } from "@/lib/config";
import { windowState } from "@/lib/window";
import { route } from "@/lib/server/http";
import { requireUser } from "@/lib/server/auth";
import { FirestoreAttemptStore, getPosterRecord, getUser } from "@/lib/server/repo";

export const dynamic = "force-dynamic";

export const GET = route(async (req) => {
  const u = await requireUser(req);
  const [profile, attempt, poster] = await Promise.all([
    getUser(u.uid),
    new FirestoreAttemptStore().get(u.uid),
    getPosterRecord(u.uid),
  ]);
  const w = getWindow();
  const now = Date.now();
  return {
    email: u.email,
    name: u.name,
    isAdmin: isAdminEmail(u.email),
    profile: profile ? { name: profile.name, rollNo: profile.rollNo, year: profile.year, branch: profile.branch } : null,
    window: { state: windowState(now, w), ...w },
    serverNow: now,
    attempt: attempt ? { status: attempt.status, score: attempt.status === "submitted" ? attempt.score : null } : null,
    poster: poster ? { uploadedAt: poster.uploadedAt, fileType: poster.fileType } : null,
  };
});
