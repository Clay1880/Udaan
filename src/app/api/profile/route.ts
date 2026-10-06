import { ProfileSchema } from "@/lib/profile";
import { HttpError, route } from "@/lib/server/http";
import { requireUser } from "@/lib/server/auth";
import { FirestoreAttemptStore, saveUser } from "@/lib/server/repo";

export const dynamic = "force-dynamic";

export const POST = route(async (req) => {
  const u = await requireUser(req);
  const input = ProfileSchema.parse(await req.json());
  if (await new FirestoreAttemptStore().get(u.uid)) {
    throw new HttpError(409, "Your profile is locked once the quiz has started.");
  }
  await saveUser({ uid: u.uid, email: u.email, ...input });
  return { ok: true };
});
