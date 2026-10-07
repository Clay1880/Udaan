import { QUIZ } from "@/lib/config";
import { windowState } from "@/lib/window";
import { scoreAttempt } from "./score";
import { deadlineOf, isExpired } from "./timer";
import type { PublicQuestion, Question } from "./types";

export interface AttemptRecord {
  questions: Question[];
  answers: Record<string, number>;
  startedAt: number;
  status: "in_progress" | "submitted";
  score: number | null;
  submittedAt: number | null;
  source: "gemini" | "fallback" | "bank";
}

export class AlreadyExistsError extends Error {}

export type SetAnswerResult = "ok" | "closed" | "missing";

/**
 * Store contract (a real store, e.g. Firestore, must implement these atomically, in a transaction):
 * - create: fails with AlreadyExistsError if the attempt exists (one attempt per uid).
 * - finalize: read the record, and ONLY if status is still "in_progress" call `compute(record)` on that
 *   freshly read record (so the score uses its CURRENT answers) and write the returned patch. If the
 *   record is already submitted, write nothing and return it unchanged (first finalize wins).
 *   Returns null if the attempt does not exist.
 * - setAnswer: in one transaction, write the answer only if status === "in_progress" AND
 *   opts.now <= opts.notAfter; otherwise write nothing and return "closed". "missing" if no attempt.
 */
export interface AttemptStore {
  get(uid: string): Promise<AttemptRecord | null>;
  create(uid: string, a: AttemptRecord): Promise<void>;
  finalize(uid: string, compute: (rec: AttemptRecord) => Partial<AttemptRecord>): Promise<AttemptRecord | null>;
  setAnswer(
    uid: string,
    index: number,
    choice: number,
    opts: { now: number; notAfter: number },
  ): Promise<SetAnswerResult>;
}

type QuizCode = "WINDOW_NOT_OPEN" | "WINDOW_CLOSED" | "NO_ATTEMPT" | "NOT_IN_PROGRESS" | "BAD_INPUT";

const MESSAGES: Record<QuizCode, string> = {
  WINDOW_NOT_OPEN: "The quiz has not opened yet.",
  WINDOW_CLOSED: "The quiz window has closed.",
  NO_ATTEMPT: "You have not started the quiz.",
  NOT_IN_PROGRESS: "This attempt is already finished.",
  BAD_INPUT: "Invalid answer.",
};

export class QuizError extends Error {
  constructor(public code: QuizCode) {
    super(MESSAGES[code]);
  }
}

export interface QuizDeps {
  store: AttemptStore;
  now: () => number;
  window: { openAt: number; closeAt: number };
  generate: (count: number) => Promise<{ questions: Question[]; source: "gemini" | "fallback" | "bank" }>;
}

export interface AttemptView {
  status: "in_progress" | "submitted";
  questions: PublicQuestion[];
  answers: Record<string, number>;
  startedAt: number;
  deadlineAt: number;
  serverNow: number;
  total: number;
}

function toView(a: AttemptRecord, now: number): AttemptView {
  return {
    status: a.status,
    questions: a.questions.map(({ text, options }) => ({ text, options })),
    answers: a.answers,
    startedAt: a.startedAt,
    deadlineAt: deadlineOf(a.startedAt),
    serverNow: now,
    total: a.questions.length,
  };
}

async function finalize(uid: string, a: AttemptRecord, deps: QuizDeps): Promise<AttemptRecord> {
  const done = await deps.store.finalize(uid, (rec) => ({
    status: "submitted" as const,
    score: scoreAttempt(rec.questions, rec.answers),
    submittedAt: Math.min(deps.now(), deadlineOf(rec.startedAt)),
  }));
  return done ?? a;
}

async function settle(uid: string, a: AttemptRecord, deps: QuizDeps): Promise<AttemptRecord> {
  if (a.status === "in_progress" && isExpired(a.startedAt, deps.now())) return finalize(uid, a, deps);
  return a;
}

export async function startAttempt(uid: string, deps: QuizDeps): Promise<AttemptView> {
  const existing = await deps.store.get(uid);
  if (existing) return toView(await settle(uid, existing, deps), deps.now());

  const state = windowState(deps.now(), deps.window);
  if (state === "before") throw new QuizError("WINDOW_NOT_OPEN");
  if (state === "closed") throw new QuizError("WINDOW_CLOSED");

  const { questions, source } = await deps.generate(QUIZ.questionCount);
  const record: AttemptRecord = {
    questions,
    answers: {},
    startedAt: deps.now(), // timer starts after generation so Gemini latency is free
    status: "in_progress",
    score: null,
    submittedAt: null,
    source,
  };
  try {
    await deps.store.create(uid, record);
  } catch (e) {
    if (e instanceof AlreadyExistsError) {
      const won = await deps.store.get(uid);
      if (won) return toView(await settle(uid, won, deps), deps.now());
    }
    throw e;
  }
  return toView(record, deps.now());
}

export interface AttemptSummary {
  status: string;
  score: number | null;
  startedAt: number;
  submittedAt?: number | null;
}

const SETTLE_BATCH = 10;

/**
 * Admin read path: scores in-progress attempts whose time is up (a student who never reopened /quiz).
 * Uses the race-safe finalize, so it is idempotent and never rescores submitted attempts.
 * Mutates the map; an attempt that fails to settle stays in_progress rather than failing the call.
 */
export async function settleExpiredSummaries(summaries: Map<string, AttemptSummary>, deps: QuizDeps): Promise<void> {
  const now = deps.now();
  const uids = [...summaries].filter(([, a]) => a.status === "in_progress" && isExpired(a.startedAt, now)).map(([u]) => u);
  for (let i = 0; i < uids.length; i += SETTLE_BATCH) {
    await Promise.all(
      uids.slice(i, i + SETTLE_BATCH).map(async (uid) => {
        try {
          const a = await deps.store.get(uid);
          if (!a) return;
          const done = await settle(uid, a, deps);
          if (done.status === "submitted") {
            summaries.set(uid, { ...summaries.get(uid)!, status: done.status, score: done.score, submittedAt: done.submittedAt });
          }
        } catch (e) {
          console.error("could not settle expired attempt", uid, e instanceof Error ? e.message : e);
        }
      }),
    );
  }
}

export async function getAttemptView(uid: string, deps: QuizDeps): Promise<AttemptView | null> {
  const a = await deps.store.get(uid);
  if (!a) return null;
  return toView(await settle(uid, a, deps), deps.now());
}

export async function saveAnswer(uid: string, index: number, choice: number, deps: QuizDeps): Promise<void> {
  if (!Number.isInteger(index) || index < 0 || index >= QUIZ.questionCount) throw new QuizError("BAD_INPUT");
  if (!Number.isInteger(choice) || choice < 0 || choice > 3) throw new QuizError("BAD_INPUT");
  const found = await deps.store.get(uid);
  if (!found) throw new QuizError("NO_ATTEMPT");
  const res = await deps.store.setAnswer(uid, index, choice, {
    now: deps.now(),
    notAfter: deadlineOf(found.startedAt) + QUIZ.graceMs,
  });
  if (res === "missing") throw new QuizError("NO_ATTEMPT");
  if (res === "closed") {
    await finalize(uid, found, deps); // idempotent: scores an expired attempt, no-op if already submitted
    throw new QuizError("NOT_IN_PROGRESS");
  }
}

export async function submitAttempt(uid: string, deps: QuizDeps): Promise<AttemptView> {
  const a = await deps.store.get(uid);
  if (!a) throw new QuizError("NO_ATTEMPT");
  const done = a.status === "submitted" ? a : await finalize(uid, a, deps);
  return toView(done, deps.now());
}
