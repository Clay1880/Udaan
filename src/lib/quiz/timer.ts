import { QUIZ } from "@/lib/config";

export const deadlineOf = (startedAt: number) => startedAt + QUIZ.durationMs;
export const isExpired = (startedAt: number, now: number, graceMs: number = QUIZ.graceMs) =>
  now > deadlineOf(startedAt) + graceMs;
export const remainingMs = (startedAt: number, now: number) =>
  Math.max(0, deadlineOf(startedAt) - now);
