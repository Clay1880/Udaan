import { shuffle } from "./random";
import { pickFromBank, type BankQuestion } from "./bank";
import type { Question } from "./types";

export interface GenerateDeps {
  bank: readonly BankQuestion[];
  random?: () => number;
}

/** Shuffles a question's options and remaps `answer` so it still points at the same option text. */
function shuffleOptions(q: Question, random: () => number): Question {
  const order = shuffle(q.options.map((_, i) => i), random);
  return { ...q, options: order.map((i) => q.options[i]), answer: order.indexOf(q.answer) };
}

/** Every quiz is a fresh topic-balanced random pick from the question bank, with options shuffled. */
export async function generateQuestions(
  count: number,
  d: GenerateDeps,
): Promise<{ questions: Question[]; source: "bank" }> {
  const random = d.random ?? Math.random;
  return { questions: pickFromBank(d.bank, count, random).map((x) => shuffleOptions(x, random)), source: "bank" };
}
