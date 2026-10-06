import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryAttemptStore } from "@/lib/quiz/memory-store";
import type { PosterRecord } from "@/lib/poster/service";

// ---- fakes (hoisted so vi.mock factories can reach them) ----
const h = vi.hoisted(() => ({
  attempts: null as unknown as { store: unknown },
  users: new Map<string, Record<string, unknown>>(),
  posters: new Map<string, unknown>(),
  files: new Map<string, { contentType: string; size: number; owner: string }>(),
  started: [] as unknown[],
  removed: [] as string[],
  signed: [] as { path: string; ttlMs?: number }[],
  tokens: new Map<string, { uid: string; email: string; email_verified: boolean; name?: string }>(),
}));

vi.mock("@/lib/firebase/admin", () => ({
  adminAuth: () => ({
    verifyIdToken: async (t: string) => {
      const tok = h.tokens.get(t);
      if (!tok) throw new Error("bad token");
      return tok;
    },
  }),
}));

vi.mock("@/lib/server/repo", async () => {
  const { MemoryAttemptStore: M } = await import("@/lib/quiz/memory-store");
  const shared = new M();
  h.attempts = { store: shared };
  return {
    FirestoreAttemptStore: class {
      get = shared.get.bind(shared);
      create = shared.create.bind(shared);
      finalize = shared.finalize.bind(shared);
      setAnswer = shared.setAnswer.bind(shared);
    },
    DrivePosterStore: class {
      async startUpload(a: unknown) {
        h.started.push(a);
        return "https://upload.example/s";
      }
      async head(p: string) {
        return h.files.get(p) ?? null;
      }
      async remove(p: string) {
        h.removed.push(p);
      }
      async get(uid: string) {
        return (h.posters.get(uid) as PosterRecord) ?? null;
      }
      async set(uid: string, r: PosterRecord) {
        h.posters.set(uid, r);
      }
    },
    getUser: async (uid: string) => h.users.get(uid) ?? null,
    saveUser: async (u: { uid: string }) => void h.users.set(u.uid, u),
    getPosterRecord: async (uid: string) => h.posters.get(uid) ?? null,
    listUsers: async () => [...h.users.values()],
    listAttemptSummaries: async () =>
      new Map([...shared.data].map(([uid, a]) => [uid, { status: a.status, score: a.score, startedAt: a.startedAt }])),
    listPosterRecords: async () => new Map(h.posters as Map<string, PosterRecord>),
    signedReadUrl: async (p: string, ttlMs?: number) => {
      h.signed.push({ path: p, ttlMs });
      return `https://signed.example/${p}?sig=1`;
    },
  };
});

const mem = () => h.attempts.store as MemoryAttemptStore;

const AUTH = { authorization: "Bearer good" };
function call(
  handler: (r: Request) => Promise<Response>,
  opts: { method?: string; headers?: Record<string, string>; body?: unknown; raw?: string } = {},
) {
  const method = opts.method ?? "POST";
  return handler(
    new Request("http://x/api", {
      method,
      headers: opts.headers,
      body: method === "GET" ? undefined : (opts.raw ?? JSON.stringify(opts.body ?? {})),
    }),
  );
}

const profile = { name: "Ab Cd", rollNo: "12", year: "FE", branch: "IT" };

beforeEach(async () => {
  await import("@/lib/server/repo"); // runs the mock factory so the shared store exists
  h.users.clear();
  h.posters.clear();
  h.files.clear();
  h.removed.length = 0;
  h.started.length = 0;
  h.signed.length = 0;
  h.tokens.clear();
  h.tokens.set("good", { uid: "u1", email: "A@B.c", email_verified: true, name: "Ann" });
  mem().data.clear();
  const now = Date.now();
  process.env.WINDOW_OPEN_ISO = new Date(now - 3600_000).toISOString();
  process.env.WINDOW_CLOSE_ISO = new Date(now + 3600_000).toISOString();
  process.env.ADMIN_EMAILS = "admin@x.y";
  delete process.env.GEMINI_API_KEY;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

const routes: [string, () => Promise<{ GET?: any; POST?: any }>, string][] = [
  ["me", () => import("./me/route"), "GET"],
  ["profile", () => import("./profile/route"), "POST"],
  ["quiz/start", () => import("./quiz/start/route"), "POST"],
  ["quiz/attempt", () => import("./quiz/attempt/route"), "GET"],
  ["quiz/answer", () => import("./quiz/answer/route"), "POST"],
  ["quiz/submit", () => import("./quiz/submit/route"), "POST"],
  ["poster GET", () => import("./poster/route"), "GET"],
  ["poster/confirm", () => import("./poster/confirm/route"), "POST"],
  ["poster/start", () => import("./poster/start/route"), "POST"],
  ["admin/overview", () => import("./admin/overview/route"), "GET"],
];

describe("authentication on every route", () => {
  for (const [name, load, method] of routes) {
    it(`${name}: 401 with no token`, async () => {
      const m = await load();
      const res = await call(m[method as "GET" | "POST"], { method });
      expect(res.status).toBe(401);
    });
    it(`${name}: 401 with invalid token`, async () => {
      const m = await load();
      const res = await call(m[method as "GET" | "POST"], { method, headers: { authorization: "Bearer nope" } });
      expect(res.status).toBe(401);
      expect(JSON.stringify(await res.json())).not.toContain("bad token");
    });
    it(`${name}: 401 with unverified email`, async () => {
      h.tokens.set("unv", { uid: "u9", email: "z@z.z", email_verified: false });
      const m = await load();
      const res = await call(m[method as "GET" | "POST"], { method, headers: { authorization: "Bearer unv" } });
      expect(res.status).toBe(401);
    });
  }
});

describe("GET /api/me", () => {
  it("returns profile, window, attempt and poster summaries", async () => {
    h.users.set("u1", { uid: "u1", email: "a@b.c", ...profile, createdAt: 1 });
    h.posters.set("u1", { path: "posters/u1/a.pdf", fileType: "application/pdf", size: 5, uploadedAt: 99 });
    const { GET } = await import("./me/route");
    const res = await call(GET, { method: "GET", headers: AUTH });
    expect(res.status).toBe(200);
    const b = await res.json();
    expect(b).toMatchObject({
      email: "a@b.c",
      name: "Ann",
      isAdmin: false,
      profile,
      attempt: null,
      poster: { uploadedAt: 99, fileType: "application/pdf" },
    });
    expect(b.window.state).toBe("open");
    expect(typeof b.serverNow).toBe("number");
    expect(JSON.stringify(b)).not.toContain("posters/u1");
  });
  it("flags admins", async () => {
    h.tokens.set("adm", { uid: "a1", email: "admin@x.y", email_verified: true });
    const { GET } = await import("./me/route");
    const b = await (await call(GET, { method: "GET", headers: { authorization: "Bearer adm" } })).json();
    expect(b.isAdmin).toBe(true);
  });
});

describe("POST /api/profile", () => {
  it("saves a valid profile", async () => {
    const { POST } = await import("./profile/route");
    const res = await call(POST, { headers: AUTH, body: profile });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(h.users.get("u1")).toMatchObject({ uid: "u1", email: "a@b.c", ...profile });
  });
  it("409 when an attempt exists", async () => {
    mem().data.set("u1", { questions: [], answers: {}, startedAt: 1, status: "in_progress", score: null, submittedAt: null, source: "fallback" });
    const { POST } = await import("./profile/route");
    expect((await call(POST, { headers: AUTH, body: profile })).status).toBe(409);
    expect(h.users.size).toBe(0);
  });
  it("400 on invalid body", async () => {
    const { POST } = await import("./profile/route");
    expect((await call(POST, { headers: AUTH, body: { name: "" } })).status).toBe(400);
  });
  it("400 on malformed JSON", async () => {
    const { POST } = await import("./profile/route");
    const res = await call(POST, { headers: AUTH, raw: "{not json" });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid JSON body" });
  });
});

function hasAnswerKey(v: unknown): boolean {
  if (Array.isArray(v)) return v.some(hasAnswerKey);
  if (v && typeof v === "object") {
    return Object.entries(v).some(([k, x]) => /^(answer|correct\w*)$/i.test(k) || hasAnswerKey(x));
  }
  return false;
}

describe("quiz flow", () => {
  it("start requires a profile", async () => {
    const { POST } = await import("./quiz/start/route");
    expect((await call(POST, { headers: AUTH })).status).toBe(403);
    expect(mem().data.size).toBe(0);
  });

  it("start, attempt, answer, submit work without GEMINI_API_KEY and never leak answers", async () => {
    h.users.set("u1", { uid: "u1", email: "a@b.c", ...profile, createdAt: 1 });
    const start = await import("./quiz/start/route");
    const attempt = await import("./quiz/attempt/route");
    const answer = await import("./quiz/answer/route");
    const submit = await import("./quiz/submit/route");

    expect((await call(attempt.GET, { method: "GET", headers: AUTH })).status).toBe(404);

    const sres = await call(start.POST, { headers: AUTH });
    expect(sres.status).toBe(200);
    const sv = await sres.json();
    expect(sv.status).toBe("in_progress");
    expect(sv.questions).toHaveLength(20);
    expect(hasAnswerKey(sv)).toBe(false);

    const ares = await call(attempt.GET, { method: "GET", headers: AUTH });
    expect(ares.status).toBe(200);
    expect(hasAnswerKey(await ares.json())).toBe(false);

    const ans = await call(answer.POST, { headers: AUTH, body: { index: 0, choice: 1 } });
    expect(ans.status).toBe(200);
    expect(await ans.json()).toEqual({ ok: true });
    expect(mem().data.get("u1")!.answers["0"]).toBe(1);

    const subres = await call(submit.POST, { headers: AUTH });
    expect(subres.status).toBe(200);
    const subv = await subres.json();
    expect(subv.status).toBe("submitted");
    expect(typeof subv.score).toBe("number");
    expect(hasAnswerKey(subv)).toBe(false);

    // after submission, further answers are rejected
    expect((await call(answer.POST, { headers: AUTH, body: { index: 1, choice: 1 } })).status).toBe(409);
  });

  it("attempt/answer/submit do not need a Gemini key when an attempt exists", async () => {
    mem().data.set("u1", {
      questions: Array.from({ length: 20 }, (_, i) => ({ text: `q${i}`, options: ["a", "b", "c", "d"], answer: 0 })),
      answers: {},
      startedAt: Date.now(),
      status: "in_progress",
      score: null,
      submittedAt: null,
      source: "fallback",
    });
    expect(process.env.GEMINI_API_KEY).toBeUndefined();
    const attempt = await import("./quiz/attempt/route");
    const answer = await import("./quiz/answer/route");
    const submit = await import("./quiz/submit/route");
    expect((await call(attempt.GET, { method: "GET", headers: AUTH })).status).toBe(200);
    expect((await call(answer.POST, { headers: AUTH, body: { index: 2, choice: 0 } })).status).toBe(200);
    const sub = await (await call(submit.POST, { headers: AUTH })).json();
    expect(sub.score).toBe(1);
  });

  it("answer: 400 on invalid bodies", async () => {
    const { POST } = await import("./quiz/answer/route");
    for (const body of [{}, { index: 0 }, { choice: 0 }, { index: "0", choice: 1 }, { index: 1.5, choice: 1 }, { index: 0, choice: 0.5 }, { index: 0, choice: 4 }, { index: 99, choice: 0 }]) {
      const res = await call(POST, { headers: AUTH, body });
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
  });
  it("answer: 400 on malformed JSON", async () => {
    const { POST } = await import("./quiz/answer/route");
    const res = await call(POST, { headers: AUTH, raw: "}{" });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid JSON body" });
  });
  it("answer: 404 without an attempt", async () => {
    const { POST } = await import("./quiz/answer/route");
    expect((await call(POST, { headers: AUTH, body: { index: 0, choice: 0 } })).status).toBe(404);
  });
});

describe("poster", () => {
  beforeEach(() => {
    h.users.set("u1", { uid: "u1", email: "a@b.c", ...profile, createdAt: 1 });
  });

  it("GET returns null, then a signed url record", async () => {
    const { GET } = await import("./poster/route");
    expect(await (await call(GET, { method: "GET", headers: AUTH })).json()).toEqual({ poster: null });
    h.posters.set("u1", { path: "posters/u1/a.pdf", fileType: "application/pdf", size: 5, uploadedAt: 7 });
    const b = await (await call(GET, { method: "GET", headers: AUTH })).json();
    expect(b.poster).toMatchObject({ uploadedAt: 7, fileType: "application/pdf" });
    expect(b.poster.url).toContain("posters/u1/a.pdf");
  });

  const FILE_A = "1AbCdEfGhIjKlMnOpQrS";
  const FILE_B = "1ZyXwVuTsRqPoNmLkJiH";

  it("confirm 403 without profile", async () => {
    h.users.clear();
    const { POST } = await import("./poster/confirm/route");
    expect((await call(POST, { headers: AUTH, body: { path: FILE_A } })).status).toBe(403);
  });

  it("confirm accepts own uploaded file", async () => {
    h.files.set(FILE_A, { contentType: "application/pdf", size: 100, owner: "u1" });
    const { POST } = await import("./poster/confirm/route");
    const res = await call(POST, { headers: AUTH, body: { path: FILE_A } });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, fileType: "application/pdf" });
    expect(h.posters.get("u1")).toMatchObject({ path: FILE_A });
  });

  it("confirm rejects another student's file and malformed ids, leaving storage untouched", async () => {
    h.files.set(FILE_B, { contentType: "application/pdf", size: 100, owner: "u2" });
    const { POST } = await import("./poster/confirm/route");
    for (const path of [FILE_B, "../x", "short"]) {
      const res = await call(POST, { headers: AUTH, body: { path } });
      expect(res.status, path).toBe(400);
    }
    expect(h.removed).toEqual([]);
    expect(h.posters.size).toBe(0);
    expect(h.files.has(FILE_B)).toBe(true);
  });

  it("start 403 without profile", async () => {
    h.users.clear();
    const { POST } = await import("./poster/start/route");
    expect((await call(POST, { headers: AUTH, body: { type: "image/png", size: 100 } })).status).toBe(403);
  });

  it("start returns an upload url, named from the profile, for the caller's origin", async () => {
    const { POST } = await import("./poster/start/route");
    const res = await call(POST, { headers: { ...AUTH, origin: "https://udaan.example" }, body: { type: "image/png", size: 100 } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ uploadUrl: "https://upload.example/s" });
    expect(h.started).toEqual([{ uid: "u1", name: "FE_IT_12.png", contentType: "image/png", size: 100, origin: "https://udaan.example" }]);
  });

  it("start rejects bad type, oversize and bad bodies", async () => {
    const { POST } = await import("./poster/start/route");
    expect((await call(POST, { headers: AUTH, body: { type: "text/html", size: 100 } })).status).toBe(415);
    expect((await call(POST, { headers: AUTH, body: { type: "image/png", size: 11 * 1024 * 1024 } })).status).toBe(413);
    expect((await call(POST, { headers: AUTH, body: { type: "image/png" } })).status).toBe(400);
    expect(h.started).toEqual([]);
  });

  it("confirm 400 on missing path and malformed JSON", async () => {
    const { POST } = await import("./poster/confirm/route");
    expect((await call(POST, { headers: AUTH, body: {} })).status).toBe(400);
    const res = await call(POST, { headers: AUTH, raw: "nope" });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid JSON body" });
  });
});

describe("GET /api/admin/overview", () => {
  const ADMIN = { authorization: "Bearer adm" };
  beforeEach(() => {
    h.tokens.set("adm", { uid: "a1", email: "Admin@X.Y", email_verified: true });
    process.env.ADMIN_EMAILS = " someone@else.z , ADMIN@x.y ";
    h.users.set("u1", { uid: "u1", email: "a@b.c", name: "Zed =cmd", rollNo: "12", year: "FE", branch: "IT", createdAt: 1 });
    h.users.set("u2", { uid: "u2", email: "b@b.c", name: "Asha", rollNo: "7", year: "TE", branch: "COMP", createdAt: 2 });
    h.users.set("u3", { uid: "u3", email: "c@b.c", name: "Mira", rollNo: "9", year: "BE", branch: "MECH", createdAt: 3 });
    mem().data.set("u1", { questions: [], answers: {}, startedAt: 1, status: "submitted", score: 14, submittedAt: 2, source: "fallback" });
    mem().data.set("u3", { questions: [], answers: {}, startedAt: Date.now() - 1000, status: "in_progress", score: null, submittedAt: null, source: "fallback" });
    h.posters.set("u2", { path: "posters/u2/1-ab.png", fileType: "image/png", size: 9, uploadedAt: 55 });
  });

  it("403 for a signed-in non-admin, without leaking any rows", async () => {
    const { GET } = await import("./admin/overview/route");
    const res = await call(GET, { method: "GET", headers: AUTH });
    expect(res.status).toBe(403);
    const body = JSON.stringify(await res.json());
    expect(body).not.toContain("Asha");
    expect(h.signed).toEqual([]);
  });

  it("403 when ADMIN_EMAILS is empty, even for the would-be admin", async () => {
    process.env.ADMIN_EMAILS = "";
    const { GET } = await import("./admin/overview/route");
    expect((await call(GET, { method: "GET", headers: ADMIN })).status).toBe(403);
  });

  it("401 for an unverified admin email and without a token", async () => {
    h.tokens.set("adm-unv", { uid: "a2", email: "admin@x.y", email_verified: false });
    const { GET } = await import("./admin/overview/route");
    expect((await call(GET, { method: "GET", headers: { authorization: "Bearer adm-unv" } })).status).toBe(401);
    expect((await call(GET, { method: "GET" })).status).toBe(401);
  });

  it("returns every registered student sorted by name, matching emails case-insensitively", async () => {
    const { GET } = await import("./admin/overview/route");
    const res = await call(GET, { method: "GET", headers: ADMIN });
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toContain("no-store");
    const { rows } = await res.json();
    expect(rows.map((r: { name: string }) => r.name)).toEqual(["Asha", "Mira", "Zed =cmd"]);
    expect(rows[0]).toEqual({
      uid: "u2",
      name: "Asha",
      email: "b@b.c",
      rollNo: "7",
      year: "TE",
      branch: "COMP",
      quiz: null,
      poster: { uploadedAt: 55, fileType: "image/png", url: "https://signed.example/posters/u2/1-ab.png?sig=1" },
    });
    expect(rows[1].quiz).toEqual({ status: "in_progress", score: null });
    expect(rows[1].poster).toBeNull();
    expect(rows[2].quiz).toEqual({ status: "submitted", score: 14 });
  });

  it("scores an expired in-progress attempt that the student never came back to", async () => {
    const questions = Array.from({ length: 4 }, (_, i) => ({ text: `Q${i}`, options: ["a", "b", "c", "d"], answer: 0 }));
    mem().data.set("u2", { questions, answers: { "0": 0, "1": 0, "2": 1 }, startedAt: Date.now() - 20 * 60 * 1000, status: "in_progress", score: null, submittedAt: null, source: "fallback" });
    const { GET } = await import("./admin/overview/route");
    const { rows } = await (await call(GET, { method: "GET", headers: ADMIN })).json();
    const by = (n: string) => rows.find((r: { name: string }) => r.name === n);
    expect(by("Asha").quiz).toEqual({ status: "submitted", score: 2 });
    expect(by("Mira").quiz).toEqual({ status: "in_progress", score: null }); // not expired
    expect(by("Zed =cmd").quiz).toEqual({ status: "submitted", score: 14 }); // untouched
    expect(mem().data.get("u2")!.status).toBe("submitted");
  });

  it("only exposes posters through short-lived signed URLs", async () => {
    const { GET } = await import("./admin/overview/route");
    const { rows } = await (await call(GET, { method: "GET", headers: ADMIN })).json();
    expect(h.signed).toHaveLength(1);
    expect(h.signed[0].path).toBe("posters/u2/1-ab.png");
    expect(h.signed[0].ttlMs).toBeGreaterThan(0);
    expect(h.signed[0].ttlMs).toBeLessThanOrEqual(60 * 60 * 1000);
    // no raw storage path or record internals besides the signed url
    expect(Object.keys(rows[0].poster).sort()).toEqual(["fileType", "uploadedAt", "url"]);
  });

  it("is read-only: only GET is exported", async () => {
    const m: Record<string, unknown> = await import("./admin/overview/route");
    expect(m.GET).toBeTypeOf("function");
    for (const verb of ["POST", "PUT", "PATCH", "DELETE"]) expect(m[verb]).toBeUndefined();
  });
});
