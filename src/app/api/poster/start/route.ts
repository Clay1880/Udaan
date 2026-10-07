import { z } from "zod";
import { HttpError, readJson, route } from "@/lib/server/http";
import { requireUser } from "@/lib/server/auth";
import { getUser } from "@/lib/server/repo";
import { posterDeps } from "@/lib/server/deps";
import { posterDriveName, startPoster } from "@/lib/poster/service";

export const dynamic = "force-dynamic";

const Body = z.object({ type: z.string().min(1).max(100), size: z.number() });

/** Opens a Drive upload session (named by roll number); the browser then uploads straight to Drive. */
export const POST = route(async (req) => {
  const u = await requireUser(req);
  const profile = await getUser(u.uid);
  if (!profile) throw new HttpError(403, "Complete your profile first.");
  const { type, size } = Body.parse(await readJson(req));
  const origin = req.headers.get("origin") ?? new URL(req.url).origin;
  const uploadUrl = await startPoster(u.uid, { name: posterDriveName(profile, type), contentType: type, size, origin }, await posterDeps());
  return { uploadUrl };
});
