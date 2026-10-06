import { cleanQuestions } from "./validate";
import { shuffle } from "./random";
import type { Question } from "./types";

export const DEFAULT_TIMEOUT_MS = 10000;

export const TOPICS = [
  "History and wars of the Indian Air Force",
  "Aircraft and helicopters in IAF service",
  "Ranks, insignia and organisation of the IAF",
  "Air operations and missions (rescue, relief, strikes)",
  "Weapons, missiles and air-defence systems",
  "Famous IAF personalities and gallantry awards",
  "Training institutions and commands of the IAF",
  "Space and aerospace milestones linked to India",
];

export function buildPrompt(requested: number, topics: string[], seed: number): string {
  return [
    `Create ${requested} multiple-choice quiz questions about the Indian Air Force for college students.`,
    `Focus on these areas: ${topics.join("; ")}.`,
    "Rules:",
    "- Only include facts you are certain are correct and widely documented.",
    "- Each question has exactly 4 distinct options and exactly one correct option.",
    '- "answer" is the zero-based index of the correct option. Spread correct answers across positions 0-3.',
    "- Mix easy and medium difficulty. No trick questions. Each question under 200 characters.",
    "- All questions must be different from each other.",
    `Return ONLY a JSON array of ${requested} objects shaped {"text": string, "options": [string, string, string, string], "answer": number}.`,
    `Variation seed: ${seed}`,
  ].join("\n");
}

export interface GenerateDeps {
  callModel: (prompt: string) => Promise<string>;
  bank: Question[];
  random?: () => number;
  attempts?: number;
  timeoutMs?: number;
}

function stripFences(text: string): string {
  return text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, rej) => {
    timer = setTimeout(() => rej(new Error("model timeout")), ms);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}

/** Shuffles a question's options and remaps `answer` so it still points at the same option text. */
function shuffleOptions(q: Question, random: () => number): Question {
  const order = shuffle(q.options.map((_, i) => i), random);
  return { ...q, options: order.map((i) => q.options[i]), answer: order.indexOf(q.answer) };
}

export async function generateQuestions(
  count: number,
  d: GenerateDeps,
): Promise<{ questions: Question[]; source: "gemini" | "fallback" }> {
  const random = d.random ?? Math.random;
  const attempts = d.attempts ?? 2;
  for (let n = 0; n < attempts; n++) {
    try {
      const topics = shuffle(TOPICS, random).slice(0, 5);
      const prompt = buildPrompt(count + 3, topics, Math.floor(random() * 1e9));
      const text = await withTimeout(d.callModel(prompt), d.timeoutMs ?? DEFAULT_TIMEOUT_MS);
      return { questions: cleanQuestions(JSON.parse(stripFences(text)), count).map((x) => shuffleOptions(x, random)), source: "gemini" };
    } catch (e) {
      console.error(`question generation attempt ${n + 1} failed:`, e instanceof Error ? e.message : e);
    }
  }
  if (d.bank.length < count) throw new Error("fallback bank smaller than question count");
  return { questions: shuffle(d.bank, random).slice(0, count).map((x) => shuffleOptions(x, random)), source: "fallback" };
}
