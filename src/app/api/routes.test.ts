import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryAttemptStore } from "@/lib/quiz/memory-store";
import type { PosterRecord } from "@/lib/poster/service";

// ---- fakes (hoisted so vi.mock factories can reach them) ----
const h = vi.hoisted(() => ({
  attempts: null as unknown as { store: unknown },
  users: new Map<string, Record<string, unknown>>(),
  posters: new Map<string, unknown>(),
  files: new Map<string, { contentType: string; size: number }>(),
  removed: [] as string[],
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
    FirebasePosterStore: class {
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
    signedReadUrl: async (p: string) => `https://signed.example/${p}`,
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

  it("confirm 403 without profile", async () => {
    h.users.clear();
    const { POST } = await import("./poster/confirm/route");
    expect((await call(POST, { headers: AUTH, body: { path: "posters/u1/a.pdf" } })).status).toBe(403);
  });

  it("confirm accepts own uploaded file", async () => {
    h.files.set("posters/u1/a.pdf", { contentType: "application/pdf", size: 100 });
    const { POST } = await import("./poster/confirm/route");
    const res = await call(POST, { headers: AUTH, body: { path: "posters/u1/a.pdf" } });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, fileType: "application/pdf" });
    expect(h.posters.get("u1")).toMatchObject({ path: "posters/u1/a.pdf" });
  });

  it("confirm rejects another uid's path and traversal, leaving storage untouched", async () => {
    h.files.set("posters/u2/a.pdf", { contentType: "application/pdf", size: 100 });
    const { POST } = await import("./poster/confirm/route");
    for (const path of ["posters/u2/a.pdf", "posters/u1/../u2/a.pdf", "posters/u1/..", "../posters/u1/a.pdf"]) {
      const res = await call(POST, { headers: AUTH, body: { path } });
      expect(res.status, path).toBe(400);
    }
    expect(h.removed).toEqual([]);
    expect(h.posters.size).toBe(0);
    expect(h.files.has("posters/u2/a.pdf")).toBe(true);
  });

  it("confirm 400 on missing path and malformed JSON", async () => {
    const { POST } = await import("./poster/confirm/route");
    expect((await call(POST, { headers: AUTH, body: {} })).status).toBe(400);
    const res = await call(POST, { headers: AUTH, raw: "nope" });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid JSON body" });
  });
});
