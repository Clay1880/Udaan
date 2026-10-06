import { z } from "zod";
import { HttpError, readJson, route } from "@/lib/server/http";
import { requireUser } from "@/lib/server/auth";
import { getUser } from "@/lib/server/repo";
import { posterDeps } from "@/lib/server/deps";
import { confirmPoster } from "@/lib/poster/service";

export const dynamic = "force-dynamic";

const Body = z.object({ path: z.string().min(1).max(300) });

export const POST = route(async (req) => {
  const u = await requireUser(req);
  if (!(await getUser(u.uid))) throw new HttpError(403, "Complete your profile first.");
  const { path } = Body.parse(await readJson(req));
  const r = await confirmPoster(u.uid, path, posterDeps());
  return { ok: true, uploadedAt: r.uploadedAt, fileType: r.fileType };
});
