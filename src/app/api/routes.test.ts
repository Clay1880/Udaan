import { beforeEach, describe, expect, it, vi } from "vitest";
import { HttpError } from "@/lib/server/http";

const requireUser = vi.fn();
const getUser = vi.fn();
const startAttempt = vi.fn();
const get = vi.fn();

vi.mock("@/lib/server/auth", () => ({ requireUser: (r: Request) => requireUser(r) }));
vi.mock("@/lib/server/repo", () => ({
  getUser: (u: string) => getUser(u),
  saveUser: vi.fn(),
  FirestoreAttemptStore: class {
    get = get;
  },
}));
vi.mock("@/lib/server/deps", () => ({ quizDeps: () => ({}), posterDeps: () => ({}) }));
vi.mock("@/lib/quiz/service", async (orig) => ({
  ...(await orig<typeof import("@/lib/quiz/service")>()),
  startAttempt: (...a: unknown[]) => startAttempt(...a),
}));

const req = (body?: unknown) => new Request("http://x/api", { method: "POST", body: JSON.stringify(body ?? {}) });

beforeEach(() => {
  vi.clearAllMocks();
  requireUser.mockResolvedValue({ uid: "u1", email: "a@b.c", name: "A" });
});

describe("quiz/start", () => {
  it("401 when unauthenticated", async () => {
    requireUser.mockRejectedValue(new HttpError(401, "Sign in required"));
    const { POST } = await import("./quiz/start/route");
    expect((await POST(req())).status).toBe(401);
  });
  it("403 without profile", async () => {
    getUser.mockResolvedValue(null);
    const { POST } = await import("./quiz/start/route");
    expect((await POST(req())).status).toBe(403);
    expect(startAttempt).not.toHaveBeenCalled();
  });
  it("starts with profile", async () => {
    getUser.mockResolvedValue({ uid: "u1" });
    startAttempt.mockResolvedValue({ status: "in_progress" });
    const { POST } = await import("./quiz/start/route");
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "in_progress" });
  });
});

describe("profile", () => {
  it("409 when an attempt exists", async () => {
    get.mockResolvedValue({ status: "in_progress" });
    const { POST } = await import("./profile/route");
    const res = await POST(req({ name: "Ab Cd", rollNo: "12", year: "FE", branch: "IT" }));
    expect(res.status).toBe(409);
  });
  it("400 on invalid body", async () => {
    const { POST } = await import("./profile/route");
    expect((await POST(req({ name: "" }))).status).toBe(400);
  });
});
