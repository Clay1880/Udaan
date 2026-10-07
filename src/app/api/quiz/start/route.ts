import { HttpError, route } from "@/lib/server/http";
import { requireUser } from "@/lib/server/auth";
import { getUser } from "@/lib/server/repo";
import { quizDeps } from "@/lib/server/deps";
import { startAttempt } from "@/lib/quiz/service";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const POST = route(async (req) => {
  const u = await requireUser(req);
  if (!(await getUser(u.uid))) throw new HttpError(403, "Complete your profile first.");
  return startAttempt(u.uid, await quizDeps());
});
