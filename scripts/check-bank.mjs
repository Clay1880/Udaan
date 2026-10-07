// Cross-checks the question bank: a second Gemini model answers every question BLIND (it never sees the
// answer key, and options are re-shuffled), then we compare with the key. Disagreements are the likeliest
// wrong keys, so you only have to read those instead of the whole bank.
// Usage: node scripts/check-bank.mjs [--model gemini-3.7-flash] [--batch 20] [--delay 4000] [--limit N]
//                                    [--fresh] [--drop-disputed]
// Run it AFTER build-bank.mjs has finished (they share the API rate limit). Resumable via
// scripts/.check-progress.json. Writes scripts/bank-review.md (read this) and, with --drop-disputed,
// removes disputed questions from src/lib/quiz/bank.json.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { GoogleGenAI } from "@google/genai";

const BANK = "src/lib/quiz/bank.json";
const PROGRESS = "scripts/.check-progress.json";
const REPORT = "scripts/bank-review.md";
const LETTERS = ["A", "B", "C", "D"];

const args = process.argv.slice(2);
const flag = (name, dflt) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : dflt;
};
const batchSize = Number(flag("batch", 20));
const delayMs = Number(flag("delay", 4000));
const limit = Number(flag("limit", Infinity));
const fresh = args.includes("--fresh");
const dropDisputed = args.includes("--drop-disputed");
// A different model from the one that wrote the questions, so its mistakes are less likely to match.
const model = flag("model", "gemini-3.7-flash");

const env = existsSync(".env.local")
  ? Object.fromEntries(
      readFileSync(".env.local", "utf8")
        .split(/\r?\n/)
        .map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/))
        .filter(Boolean)
        .map((m) => [m[1], m[2].replace(/^"|"$/g, "")]),
    )
  : {};
const apiKey = process.env.GEMINI_API_KEY ?? env.GEMINI_API_KEY;
if (!apiKey) throw new Error("Set GEMINI_API_KEY in .env.local first");
const ai = new GoogleGenAI({ apiKey, httpOptions: { timeout: 180000 } });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const stripFences = (t) => t.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
const shuffled = (n) => {
  const a = [0, 1, 2, 3];
  for (let i = 3; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, n);
};

function prompt(items) {
  return [
    "You are a strict fact-checker for a quiz about the Indian Air Force (IAF) and Indian aerospace.",
    "For each numbered question choose the single option that is factually correct.",
    'Also set "issue" to one of: "ambiguous" (more than one option could be right, or none is), "outdated" (the answer changes over time or you are unsure it is current as of 2026), "unsure" (you do not reliably know), or null.',
    'Be honest: if you do not know, use "unsure" rather than guessing.',
    `Return ONLY a JSON array with one object per question: {"n": number, "pick": "A" | "B" | "C" | "D", "issue": string | null}`,
    "",
    ...items.map((it) => `${it.n}. ${it.text}\n${it.order.map((o, k) => `   ${LETTERS[k]}. ${it.q.options[o]}`).join("\n")}`),
  ].join("\n");
}

async function ask(items) {
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const res = await ai.models.generateContent({
        model,
        contents: prompt(items),
        config: { responseMimeType: "application/json", temperature: 0 },
      });
      if (!res.text) throw new Error("empty response");
      const raw = JSON.parse(stripFences(res.text));
      if (!Array.isArray(raw)) throw new Error("not an array");
      return raw;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/"code":\s*(400|401|403|404)|API key|UNAUTHENTICATED|PERMISSION_DENIED|NOT_FOUND/i.test(msg)) {
        throw new Error(`Gemini rejected the request (${msg.slice(0, 200)}). Check the key and --model.`);
      }
      const wait = delayMs * attempt * 2;
      console.warn(`  attempt ${attempt} failed (${msg.slice(0, 100)}); waiting ${wait / 1000}s`);
      await sleep(wait);
    }
  }
  return null;
}

// ---------- main ----------
const bank = JSON.parse(readFileSync(BANK, "utf8"));
const todoAll = bank.slice(0, limit);
/** { [id]: { pick: 0-3 | null, issue: string | null } } */
const done = !fresh && existsSync(PROGRESS) ? JSON.parse(readFileSync(PROGRESS, "utf8")) : {};
const save = () => writeFileSync(PROGRESS, JSON.stringify(done));

const todo = todoAll.filter((q) => !(q.id in done));
console.log(`Checking ${todo.length} of ${todoAll.length} questions with ${model} (${Math.ceil(todo.length / batchSize)} calls).`);

let failedBatches = 0;
for (let i = 0; i < todo.length; i += batchSize) {
  const chunk = todo.slice(i, i + batchSize);
  const items = chunk.map((q, k) => ({ q, n: k + 1, text: q.text, order: shuffled(4) }));
  const raw = await ask(items);
  if (!raw) {
    failedBatches++;
    console.warn(`  batch ${i / batchSize + 1} gave no answer; it will be retried on the next run`);
    continue;
  }
  for (const r of raw) {
    const it = items.find((x) => x.n === r?.n);
    const k = LETTERS.indexOf(r?.pick);
    if (!it) continue;
    done[it.q.id] = { pick: k >= 0 ? it.order[k] : null, issue: typeof r.issue === "string" ? r.issue : null };
  }
  save();
  console.log(`  ${Math.min(i + batchSize, todo.length)}/${todo.length} checked`);
  await sleep(delayMs);
}

// ---------- report ----------
const checked = bank.filter((q) => q.id in done);
const wrongKey = checked.filter((q) => done[q.id].pick !== q.answer);
const flagged = checked.filter((q) => done[q.id].pick === q.answer && done[q.id].issue);
const clean = checked.length - wrongKey.length - flagged.length;
const disputed = [...wrongKey, ...flagged];

const fmt = (q) => {
  const d = done[q.id];
  const opts = q.options.map((o, i) => `  - ${LETTERS[i]}. ${o}${i === q.answer ? "  ← key" : ""}${d.pick === i && d.pick !== q.answer ? "  ← checker's pick" : ""}`);
  return [`### ${q.id} · ${q.topic}`, q.text, ...opts, d.issue ? `  - checker note: ${d.issue}` : "", ""].filter((l) => l !== "").join("\n");
};
writeFileSync(
  REPORT,
  [
    `# Question bank review (${model})`,
    "",
    `Checked ${checked.length} of ${bank.length}. Agreed and clean: ${clean}. Checker disagrees with the key: ${wrongKey.length}. Agrees but flagged ambiguous/outdated/unsure: ${flagged.length}.`,
    "",
    "Where the checker disagrees, EITHER the key or the checker is wrong. Verify against a trusted source (IAF site, PIB, Wikipedia), then fix or delete the question in src/lib/quiz/bank.json.",
    "",
    `## Checker disagrees with the key (${wrongKey.length})`,
    "",
    ...wrongKey.map(fmt),
    `## Agrees, but flagged (${flagged.length})`,
    "",
    ...flagged.map(fmt),
  ].join("\n"),
);

console.log(`\nAgreed & clean ${clean} | disagree ${wrongKey.length} | flagged ${flagged.length} | unchecked ${bank.length - checked.length}${failedBatches ? ` | failed batches ${failedBatches} (re-run)` : ""}`);
console.log(`Report: ${REPORT}`);

if (dropDisputed) {
  const drop = new Set(disputed.map((q) => q.id));
  const kept = bank.filter((q) => !drop.has(q.id));
  writeFileSync(BANK, JSON.stringify(kept, null, 1));
  console.log(`Removed ${drop.size} disputed questions from ${BANK}; ${kept.length} remain.`);
} else if (disputed.length) {
  console.log(`Re-run with --drop-disputed to remove the ${disputed.length} disputed questions from the bank (or fix them by hand).`);
}
