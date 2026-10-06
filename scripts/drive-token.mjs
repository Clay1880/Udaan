// One-time helper: prints a Google OAuth refresh token for Drive uploads.
// Usage: node scripts/drive-token.mjs   (needs GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET in .env.local)
import { createServer } from "node:http";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^"|"$/g, "")]),
);
const id = env.GOOGLE_CLIENT_ID;
const secret = env.GOOGLE_CLIENT_SECRET;
if (!id || !secret) throw new Error("Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env.local first");

const redirect = "http://localhost:3000/oauth2callback";
const url =
  "https://accounts.google.com/o/oauth2/v2/auth?" +
  new URLSearchParams({
    client_id: id,
    redirect_uri: redirect,
    response_type: "code",
    scope: "https://www.googleapis.com/auth/drive.file",
    access_type: "offline",
    prompt: "consent",
  });
console.log("Stop `npm run dev` if it is running (port 3000), then open this URL and approve:\n\n" + url + "\n");

const server = createServer(async (req, res) => {
  const u = new URL(req.url, "http://localhost:3000");
  if (u.pathname !== "/oauth2callback") return void res.end();
  const code = u.searchParams.get("code");
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: id, client_secret: secret, redirect_uri: redirect, grant_type: "authorization_code" }),
  });
  const j = await r.json();
  res.end(j.refresh_token ? "Done. Return to the terminal." : "Failed. See the terminal.");
  if (j.refresh_token) console.log("GOOGLE_REFRESH_TOKEN=" + j.refresh_token);
  else console.error("No refresh token returned:", j);
  server.close();
});
server.listen(3000);
