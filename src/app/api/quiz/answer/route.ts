import { z } from "zod";
import { readJson, route } from "@/lib/server/http";
import { requireUser } from "@/lib/server/auth";
import { quizDeps } from "@/lib/server/deps";
import { saveAnswer } from "@/lib/quiz/service";

export const dynamic = "force-dynamic";

const Body = z.object({ index: z.number(), choice: z.number() });

export const POST = route(async (req) => {
  const u = await requireUser(req);
  const { index, choice } = Body.parse(await readJson(req));
  await saveAnswer(u.uid, index, choice, quizDeps());
  return { ok: true };
});
