import { shuffle } from "./random";
import type { Question } from "./types";

/** A reviewed question from `bank.json` (built by `scripts/build-bank.mjs`). */
export interface BankQuestion extends Question {
  topic?: string;
}

/**
 * Picks `count` distinct questions, spread evenly across topics (round-robin over shuffled topics,
 * so 20 questions from 8 topics is 2-3 each). Returns plain questions, without bank-only fields.
 */
export function pickFromBank(bank: readonly BankQuestion[], count: number, random: () => number = Math.random): Question[] {
  if (bank.length < count) throw new Error(`question bank has ${bank.length} questions, need ${count}`);
  const byTopic = new Map<string, BankQuestion[]>();
  for (const q of shuffle(bank, random)) {
    const key = q.topic ?? "";
    byTopic.set(key, [...(byTopic.get(key) ?? []), q]);
  }
  const queues = shuffle([...byTopic.values()], random);
  const out: Question[] = [];
  while (out.length < count) {
    for (const queue of queues) {
      const q = queue.pop();
      if (!q) continue;
      out.push({ text: q.text, options: q.options, answer: q.answer });
      if (out.length === count) break;
    }
  }
  return shuffle(out, random);
}
