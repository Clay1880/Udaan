import { ZodError } from "zod";
import { QuizError } from "@/lib/quiz/service";
import { PosterError } from "@/lib/poster/service";

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const QUIZ_STATUS: Record<QuizError["code"], number> = {
  WINDOW_NOT_OPEN: 403,
  WINDOW_CLOSED: 403,
  NO_ATTEMPT: 404,
  NOT_IN_PROGRESS: 409,
  BAD_INPUT: 400,
};

const POSTER_STATUS: Record<PosterError["code"], number> = {
  WINDOW_NOT_OPEN: 403,
  WINDOW_CLOSED: 403,
  BAD_PATH: 400,
  NOT_FOUND: 404,
  BAD_TYPE: 415,
  TOO_LARGE: 413,
};

/** Parse a JSON request body; malformed JSON becomes a 400 rather than an unmapped 500. */
export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new HttpError(400, "Invalid JSON body");
  }
}

/** Extra mappers for other error types. Return a Response to claim the error, or null to pass. */
export type ErrorMapper = (e: unknown) => Response | null;
const extraMappers: ErrorMapper[] = [];
export function registerErrorMapper(m: ErrorMapper): void {
  extraMappers.push(m);
}

export function errorResponse(e: unknown): Response {
  if (e instanceof HttpError) return Response.json({ error: e.message }, { status: e.status });
  if (e instanceof QuizError) return Response.json({ error: e.message, code: e.code }, { status: QUIZ_STATUS[e.code] });
  if (e instanceof PosterError) return Response.json({ error: e.message, code: e.code }, { status: POSTER_STATUS[e.code] });
  if (e instanceof ZodError) {
    return Response.json({ error: "Invalid input", issues: e.issues.map((i) => i.message) }, { status: 400 });
  }
  for (const m of extraMappers) {
    const r = m(e);
    if (r) return r;
  }
  console.error(e);
  return Response.json({ error: "Something went wrong" }, { status: 500 });
}

export function route(fn: (req: Request) => Promise<unknown>) {
  return async (req: Request): Promise<Response> => {
    try {
      const out = await fn(req);
      return out instanceof Response ? out : Response.json(out);
    } catch (e) {
      return errorResponse(e);
    }
  };
}
