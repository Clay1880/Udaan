import type { Question } from "./types";

export function scoreAttempt(questions: Question[], answers: Record<string, number>): number {
  let score = 0;
  questions.forEach((q, i) => {
    if (answers[String(i)] === q.answer) score++;
  });
  return score;
}
