import { z } from "zod";
import type { Question } from "./types";

export const QuestionSchema = z
  .object({
    text: z.string().trim().min(10).max(400),
    options: z.array(z.string().trim().min(1).max(200)).length(4),
    answer: z.number().int().min(0).max(3),
  })
  .refine((q) => new Set(q.options.map((o) => o.toLowerCase())).size === 4, {
    message: "options must be distinct",
  });

export function cleanQuestions(raw: unknown, count: number): Question[] {
  if (!Array.isArray(raw)) throw new Error("model output is not an array");
  const seen = new Set<string>();
  const out: Question[] = [];
  for (const item of raw) {
    const r = QuestionSchema.safeParse(item);
    if (!r.success) continue;
    const key = r.data.text.toLowerCase().replace(/\s+/g, " ");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r.data);
    if (out.length === count) break;
  }
  if (out.length < count) throw new Error(`only ${out.length} valid questions`);
  return out;
}
