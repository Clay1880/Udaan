import { HttpError, route } from "@/lib/server/http";
import { requireUser } from "@/lib/server/auth";
import { quizDeps } from "@/lib/server/deps";
import { getAttemptView } from "@/lib/quiz/service";

export const dynamic = "force-dynamic";

export const GET = route(async (req) => {
  const u = await requireUser(req);
  const view = await getAttemptView(u.uid, quizDeps());
  if (!view) throw new HttpError(404, "You have not started the quiz.");
  return view;
});
