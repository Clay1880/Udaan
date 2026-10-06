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
  source: "gemini" | "fallback";
}

export class AlreadyExistsError extends Error {}

export interface AttemptStore {
  get(uid: string): Promise<AttemptRecord | null>;
  create(uid: string, a: AttemptRecord): Promise<void>;
  update(uid: string, patch: Partial<AttemptRecord>): Promise<void>;
  setAnswer(uid: string, index: number, choice: number): Promise<void>;
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
  generate: (count: number) => Promise<{ questions: Question[]; source: "gemini" | "fallback" }>;
}

export interface AttemptView {
  status: "in_progress" | "submitted";
  questions: PublicQuestion[];
  answers: Record<string, number>;
  startedAt: number;
  deadlineAt: number;
  serverNow: number;
  score: number | null;
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
    score: a.status === "submitted" ? a.score : null,
    total: a.questions.length,
  };
}

async function finalize(uid: string, a: AttemptRecord, deps: QuizDeps): Promise<AttemptRecord> {
  const patch = {
    status: "submitted" as const,
    score: scoreAttempt(a.questions, a.answers),
    submittedAt: Math.min(deps.now(), deadlineOf(a.startedAt)),
  };
  await deps.store.update(uid, patch);
  return { ...a, ...patch };
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
  const a = await settle(uid, found, deps);
  if (a.status !== "in_progress") throw new QuizError("NOT_IN_PROGRESS");
  await deps.store.setAnswer(uid, index, choice);
}

export async function submitAttempt(uid: string, deps: QuizDeps): Promise<AttemptView> {
  const a = await deps.store.get(uid);
  if (!a) throw new QuizError("NO_ATTEMPT");
  const done = a.status === "submitted" ? a : await finalize(uid, a, deps);
  return toView(done, deps.now());
}
