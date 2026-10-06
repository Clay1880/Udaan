import { downloadFile, getFile } from "@/lib/drive";
import { route } from "@/lib/server/http";
import { verifyPosterUrl } from "@/lib/poster/signed-url";
import { POSTER } from "@/lib/config";

export const dynamic = "force-dynamic";

/** Streams a poster from Drive for a valid signed link (see signedReadUrl). No login header, so <img> works. */
export const GET = route(async (req) => {
  const id = verifyPosterUrl(process.env.POSTER_URL_SECRET ?? "", new URL(req.url).searchParams);
  if (!id) return Response.json({ error: "This link has expired. Refresh the page." }, { status: 403 });

  const meta = await getFile(id);
  if (!meta || !(POSTER.allowedTypes as readonly string[]).includes(meta.mimeType)) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  const upstream = await downloadFile(id);
  if (!upstream.ok || !upstream.body) return Response.json({ error: "Not found" }, { status: 404 });

  return new Response(upstream.body, {
    headers: {
      "Content-Type": meta.mimeType,
      ...(meta.size ? { "Content-Length": String(meta.size) } : {}),
      "Content-Disposition": "inline",
      "Cache-Control": "private, max-age=300",
      // Uploads are untrusted: never let a browser sniff or run them as a page.
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox; default-src 'none'",
    },
  });
});
