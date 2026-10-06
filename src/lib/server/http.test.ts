import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { HttpError, errorResponse, route } from "@/lib/server/http";
import { QuizError } from "@/lib/quiz/service";

describe("errorResponse", () => {
  it("maps HttpError", async () => {
    const r = errorResponse(new HttpError(403, "Admins only"));
    expect(r.status).toBe(403);
    expect(await r.json()).toEqual({ error: "Admins only" });
  });
  it("maps QuizError codes", () => {
    expect(errorResponse(new QuizError("WINDOW_CLOSED")).status).toBe(403);
    expect(errorResponse(new QuizError("NO_ATTEMPT")).status).toBe(404);
    expect(errorResponse(new QuizError("NOT_IN_PROGRESS")).status).toBe(409);
    expect(errorResponse(new QuizError("BAD_INPUT")).status).toBe(400);
  });
  it("maps zod errors to 400", () => {
    const err = z.object({ a: z.string() }).safeParse({}).error!;
    expect(errorResponse(err).status).toBe(400);
  });
  it("hides unknown errors behind a 500", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const r = errorResponse(new Error("secret db password"));
    expect(r.status).toBe(500);
    expect(JSON.stringify(await r.json())).not.toContain("secret");
  });
});

describe("route", () => {
  it("wraps plain return values as JSON and thrown errors as responses", async () => {
    const ok = await route(async () => ({ hi: 1 }))(new Request("http://x"));
    expect(await ok.json()).toEqual({ hi: 1 });
    const bad = await route(async () => {
      throw new HttpError(401, "Sign in required");
    })(new Request("http://x"));
    expect(bad.status).toBe(401);
  });
});
