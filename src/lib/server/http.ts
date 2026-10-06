import { ZodError } from "zod";
import { QuizError } from "@/lib/quiz/service";

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

/** Extra mappers (e.g. PosterError in Task 7). Return a Response to claim the error, or null to pass. */
export type ErrorMapper = (e: unknown) => Response | null;
const extraMappers: ErrorMapper[] = [];
export function registerErrorMapper(m: ErrorMapper): void {
  extraMappers.push(m);
}

export function errorResponse(e: unknown): Response {
  if (e instanceof HttpError) return Response.json({ error: e.message }, { status: e.status });
  if (e instanceof QuizError) return Response.json({ error: e.message, code: e.code }, { status: QUIZ_STATUS[e.code] });
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
