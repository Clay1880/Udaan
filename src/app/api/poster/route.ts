import { route } from "@/lib/server/http";
import { requireUser } from "@/lib/server/auth";
import { getPosterRecord, signedReadUrl } from "@/lib/server/repo";

export const dynamic = "force-dynamic";

export const GET = route(async (req) => {
  const u = await requireUser(req);
  const p = await getPosterRecord(u.uid);
  if (!p) return { poster: null };
  return { poster: { uploadedAt: p.uploadedAt, fileType: p.fileType, url: await signedReadUrl(p.path, 15 * 60 * 1000) } };
});
