import { SettingsPatch } from "@/lib/event-mode";
import { readJson, route } from "@/lib/server/http";
import { requireAdmin } from "@/lib/server/auth";
import { getEventSettings, setEventSettings } from "@/lib/server/repo";

export const dynamic = "force-dynamic";

export const GET = route(async (req) => {
  await requireAdmin(req);
  return getEventSettings();
});

/** Organiser override of the quiz/poster windows, e.g. `{ "quiz": "open" }`. Admins only. */
export const POST = route(async (req) => {
  await requireAdmin(req);
  return setEventSettings(SettingsPatch.parse(await readJson(req)));
});
