import { getWindow } from "@/lib/config";
import { FALLBACK_BANK } from "@/lib/quiz/fallback-bank";
import { geminiCallModel } from "@/lib/quiz/gemini";
import { generateQuestions } from "@/lib/quiz/generate";
import type { QuizDeps } from "@/lib/quiz/service";
import type { PosterDeps } from "@/lib/poster/service";
import { FirebasePosterStore, FirestoreAttemptStore } from "./repo";

// Server-only: reads the Gemini key from a non-NEXT_PUBLIC env var at request time.
export function quizDeps(): QuizDeps {
  // Built lazily: only generation needs the Gemini client, so other routes work without a key.
  const callModel = (prompt: string) =>
    geminiCallModel(process.env.GEMINI_API_KEY ?? "", process.env.GEMINI_MODEL ?? "gemini-2.5-flash")(prompt);
  return {
    store: new FirestoreAttemptStore(),
    now: Date.now,
    window: getWindow(),
    generate: (count) => generateQuestions(count, { callModel, bank: FALLBACK_BANK }),
  };
}

export function posterDeps(): PosterDeps {
  return { store: new FirebasePosterStore(), now: Date.now, window: getWindow() };
}
