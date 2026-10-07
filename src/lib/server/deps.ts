import { getWindow } from "@/lib/config";
import { applyMode } from "@/lib/event-mode";
import { FALLBACK_BANK } from "@/lib/quiz/fallback-bank";
import { geminiCallModel } from "@/lib/quiz/gemini";
import { generateQuestions } from "@/lib/quiz/generate";
import type { QuizDeps } from "@/lib/quiz/service";
import type { PosterDeps } from "@/lib/poster/service";
import { DrivePosterStore, FirestoreAttemptStore, getEventSettings } from "./repo";

// Server-only: reads the Gemini key from a non-NEXT_PUBLIC env var at request time.
export async function quizDeps(): Promise<QuizDeps> {
  const settings = await getEventSettings();
  // Built lazily: only generation needs the Gemini client, so other routes work without a key.
  const callModel = (prompt: string) =>
    geminiCallModel(process.env.GEMINI_API_KEY ?? "", process.env.GEMINI_MODEL ?? "gemini-2.5-flash")(prompt);
  return {
    store: new FirestoreAttemptStore(),
    now: Date.now,
    window: applyMode(getWindow(), settings.quiz),
    generate: (count) => generateQuestions(count, { callModel, bank: FALLBACK_BANK }),
  };
}

export async function posterDeps(): Promise<PosterDeps> {
  const settings = await getEventSettings();
  return { store: new DrivePosterStore(), now: Date.now, window: applyMode(getWindow(), settings.poster) };
}
