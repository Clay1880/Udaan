import { getWindow } from "@/lib/config";
import { applyMode } from "@/lib/event-mode";
import bank from "@/lib/quiz/bank.json";
import type { BankQuestion } from "@/lib/quiz/bank";
import { generateQuestions } from "@/lib/quiz/generate";
import type { QuizDeps } from "@/lib/quiz/service";
import type { PosterDeps } from "@/lib/poster/service";
import { DrivePosterStore, FirestoreAttemptStore, getEventSettings } from "./repo";

export async function quizDeps(): Promise<QuizDeps> {
  const settings = await getEventSettings();
  return {
    store: new FirestoreAttemptStore(),
    now: Date.now,
    window: applyMode(getWindow(), settings.quiz),
    generate: (count) => generateQuestions(count, { bank: bank as BankQuestion[] }),
  };
}

export async function posterDeps(): Promise<PosterDeps> {
  const settings = await getEventSettings();
  return { store: new DrivePosterStore(), now: Date.now, window: applyMode(getWindow(), settings.poster) };
}
