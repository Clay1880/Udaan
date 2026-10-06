import { route } from "@/lib/server/http";
import { requireUser } from "@/lib/server/auth";
import { quizDeps } from "@/lib/server/deps";
import { submitAttempt } from "@/lib/quiz/service";

export const dynamic = "force-dynamic";

export const POST = route(async (req) => submitAttempt((await requireUser(req)).uid, quizDeps()));
