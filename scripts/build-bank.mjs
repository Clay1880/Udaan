// One-time, offline: builds the quiz question bank with Gemini.
// Usage: node scripts/build-bank.mjs [--per-topic 160] [--delay 6000] [--model gemini-2.5-flash] [--fresh]
// Needs GEMINI_API_KEY in .env.local. Resumable: progress is saved after every batch to
// scripts/.bank-progress.json, so re-running continues where it stopped (use --fresh to start over).
// Output: src/lib/quiz/bank.json. REVIEW IT before the event: Gemini can state wrong facts.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { GoogleGenAI } from "@google/genai";
import { z } from "zod";

const OUT = "src/lib/quiz/bank.json";
const PROGRESS = "scripts/.bank-progress.json";
const BATCH = 25;

// Same topics as src/lib/quiz/generate.ts, each split into angles so batches don't repeat each other.
const TOPICS = {
  "History and wars of the Indian Air Force": [
    "founding of the IAF (1932-1947) and early squadrons",
    "1947-48 Kashmir operations and the 1962 war",
    "1965 Indo-Pak war",
    "1971 war and Bangladesh liberation",
    "Kargil 1999 (Operation Safed Sagar) and later conflicts",
    "milestones, firsts, anniversaries and Air Force Day traditions",
  ],
  "Aircraft and helicopters in IAF service": [
    "fighter jets (Su-30MKI, Rafale, Mirage 2000, MiG-29, Jaguar, Tejas)",
    "retired and historic aircraft (Hunter, Gnat, Canberra, MiG-21, Vampire)",
    "transport aircraft (C-17, C-130J, An-32, IL-76, Dornier)",
    "helicopters (Apache, Chinook, Mi-17, Dhruv, Chetak, Prachand)",
    "trainers, AWACS, tankers and UAVs",
    "manufacturers, origins and nicknames of IAF aircraft",
  ],
  "Ranks, insignia and organisation of the IAF": [
    "commissioned officer ranks and their order",
    "airmen and non-commissioned ranks",
    "commands and their headquarters",
    "squadrons, wings, stations and their nicknames",
    "uniform, flag, ensign, crest and motto",
    "chiefs of the Air Staff and the Marshal of the IAF",
  ],
  "Air operations and missions (rescue, relief, strikes)": [
    "Operation Safed Sagar, Meghdoot, Cactus and other named operations",
    "Balakot 2019 and recent strikes",
    "humanitarian aid and disaster relief (Uttarakhand, Kerala, Nepal quake)",
    "evacuation operations (Ganga, Raahat, Vande Bharat, Devi Shakti)",
    "Himalayan and high-altitude operations (Siachen, Leh, Chushul)",
    "air shows, flypasts and parade traditions",
  ],
  "Weapons, missiles and air-defence systems": [
    "air-to-air missiles (Astra, Meteor, R-77, MICA, R-73)",
    "air-to-ground weapons and BrahMos",
    "surface-to-air missiles (S-400, Akash, Barak, SPYDER)",
    "radars, AEW&C and electronic warfare",
    "guns, bombs, rockets and countermeasures",
    "indigenous defence programmes (DRDO, HAL, BEL, Make in India)",
  ],
  "Famous IAF personalities and gallantry awards": [
    "Param Vir Chakra, Maha Vir Chakra and Vir Chakra recipients",
    "Ashoka Chakra, Kirti Chakra, Shaurya Chakra and Vayu Sena Medal",
    "Arjan Singh, Subroto Mukerjee and other chiefs",
    "Rakesh Sharma, Shubhanshu Shukla and astronauts from the IAF",
    "women in the IAF (fighter pilots, Flying Branch, firsts)",
    "Abhinandan Varthaman, Nirmal Jit Singh Sekhon and war heroes",
  ],
  "Training institutions and commands of the IAF": [
    "Air Force Academy Dundigal and flying training",
    "NDA, AFCAT, CDSE and how officers are commissioned",
    "Air Force Station training establishments and technical training",
    "Operational commands (Western, Eastern, Central, Southern, South Western, Training, Maintenance)",
    "Air Force Day, Air Force Association and welfare institutions",
    "test pilots, ASTE, and the National Cadet Corps air wing",
  ],
  "Space and aerospace milestones linked to India": [
    "ISRO missions (Chandrayaan, Mangalyaan, Aditya-L1)",
    "Gaganyaan and Indian human spaceflight",
    "Indian satellites and launch vehicles (PSLV, GSLV, SSLV)",
    "military space and DRDO missile tests (Agni, Prithvi, ASAT)",
    "history of Indian aviation (Tata, Air India, HAL, first flights)",
    "general aerospace: how aircraft fly, aviation records and terms",
  ],
};

const SCHEMA = z
  .object({
    text: z.string().trim().min(10).max(400),
    options: z.array(z.string().trim().min(1).max(200)).length(4),
    answer: z.number().int().min(0).max(3),
    difficulty: z.enum(["easy", "medium"]).default("medium"),
  })
  .refine((q) => new Set(q.options.map((o) => o.toLowerCase())).size === 4, { message: "options must be distinct" });

// ---------- args / env ----------
const args = process.argv.slice(2);
const flag = (name, dflt) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : dflt;
};
const perTopic = Number(flag("per-topic", 160));
const delayMs = Number(flag("delay", 6000)); // ~10 requests/min, safe for the free tier
const fresh = args.includes("--fresh");

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
const model = flag("model", "gemini-3.5-flash"); // 2.5-flash is closed to new keys; override with --model
const ai = new GoogleGenAI({ apiKey, httpOptions: { timeout: 180000 } });

// ---------- helpers ----------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
const words = (s) => new Set(norm(s).split(" ").filter((w) => w.length > 2));
function similar(a, b) {
  const A = words(a), B = words(b);
  if (!A.size || !B.size) return false;
  let hit = 0;
  for (const w of A) if (B.has(w)) hit++;
  return hit / (A.size + B.size - hit) >= 0.7; // Jaccard
}
/** Questions with years, numbers or exact names are the likeliest to be wrong: flag them for review. */
const needsCheck = (q) => /\b\d{3,4}\b|\b\d+(\.\d+)?\s?(km|kg|m|mach|%|years?)\b/i.test(`${q.text} ${q.options.join(" ")}`);

const stripFences = (t) => t.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");

function prompt(topic, angle, taken) {
  return [
    `Create ${BATCH} multiple-choice quiz questions about the Indian Air Force for college students.`,
    `Topic: ${topic}.`,
    `Specific angle for this batch: ${angle}.`,
    "Rules:",
    "- Only include facts you are certain are correct and widely documented (Wikipedia / official IAF / PIB level). If unsure, skip the fact.",
    "- Avoid facts that change often (current chief, current aircraft counts) unless you are certain they are current as of 2026.",
    "- Each question has exactly 4 distinct, plausible options and exactly one correct option.",
    '- "answer" is the zero-based index of the correct option. Spread correct answers evenly across positions 0-3.',
    '- "difficulty" is "easy" or "medium" (about 60% easy, 40% medium). No trick questions. Each question under 200 characters.',
    "- All questions must be different from each other and from the questions already taken below.",
    taken.length ? `Already taken (do not repeat or rephrase):\n${taken.slice(-60).map((t) => `- ${t}`).join("\n")}` : "",
    `Return ONLY a JSON array of ${BATCH} objects shaped {"text": string, "options": [string, string, string, string], "answer": number, "difficulty": "easy" | "medium"}.`,
    `Variation seed: ${Math.floor(Math.random() * 1e9)}`,
  ]
    .filter(Boolean)
    .join("\n");
}

async function generate(p) {
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const res = await ai.models.generateContent({
        model,
        contents: p,
        config: { responseMimeType: "application/json", temperature: 1 },
      });
      if (!res.text) throw new Error("empty response");
      const raw = JSON.parse(stripFences(res.text));
      if (!Array.isArray(raw)) throw new Error("not an array");
      return raw;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // A bad key will never start working: stop now instead of retrying for minutes.
      if (/"code":\s*(400|401|403)|API key|UNAUTHENTICATED|PERMISSION_DENIED/i.test(msg)) {
        throw new Error(`Gemini rejected the key (${msg.slice(0, 160)}). Use an AI Studio key (starts with "AIza").`);
      }
      const wait = delayMs * attempt * 2;
      console.warn(`  attempt ${attempt} failed (${e instanceof Error ? e.message.slice(0, 120) : e}); waiting ${wait / 1000}s`);
      await sleep(wait);
    }
  }
  return [];
}

// ---------- main ----------
/** progress: { [topic]: { done: number (batches run), questions: [...] } } */
const progress = !fresh && existsSync(PROGRESS) ? JSON.parse(readFileSync(PROGRESS, "utf8")) : {};
const save = () => writeFileSync(PROGRESS, JSON.stringify(progress));
const everyQuestion = () => Object.values(progress).flatMap((t) => t.questions);

console.log(`Model ${model}, target ${perTopic}/topic (${perTopic * Object.keys(TOPICS).length} total), ${BATCH} per call.`);

for (const [topic, angles] of Object.entries(TOPICS)) {
  const st = (progress[topic] ??= { done: 0, questions: [] });
  const maxBatches = angles.length * 2; // never loop forever on a topic that has run dry
  let failures = 0; // consecutive calls that returned nothing (overloaded model); they do not use up a batch slot
  while (st.questions.length < perTopic && st.done < maxBatches && failures < 4) {
    const angle = angles[st.done % angles.length];
    console.log(`[${topic.slice(0, 32)}…] batch ${st.done + 1}/${maxBatches} — ${angle} (${st.questions.length}/${perTopic})`);
    const raw = await generate(prompt(topic, angle, st.questions.map((q) => q.text)));
    const all = everyQuestion();
    let kept = 0;
    for (const item of raw) {
      const r = SCHEMA.safeParse(item);
      if (!r.success) continue;
      if (all.some((q) => similar(q.text, r.data.text))) continue;
      const q = { topic, ...r.data };
      if (needsCheck(q)) q.check = true;
      st.questions.push(q);
      all.push(q);
      kept++;
    }
    if (raw.length === 0) {
      failures++;
      console.warn(`  no response (${failures}/4); trying again`);
      continue;
    }
    failures = 0;
    st.done++;
    save();
    console.log(`  kept ${kept}/${raw.length}`);
    await sleep(delayMs);
  }
}

// Finalize: stable ids, topic order, balanced answer positions.
const bank = [];
let n = 0;
for (const topic of Object.keys(TOPICS)) {
  for (const q of progress[topic]?.questions ?? []) {
    bank.push({ id: `q${String(++n).padStart(4, "0")}`, ...q });
  }
}
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(bank, null, 1));

const count = (f) => bank.filter(f).length;
console.log(`\nWrote ${bank.length} questions to ${OUT}`);
for (const t of Object.keys(TOPICS)) console.log(`  ${String(count((q) => q.topic === t)).padStart(4)}  ${t}`);
console.log(`Difficulty: easy ${count((q) => q.difficulty === "easy")}, medium ${count((q) => q.difficulty === "medium")}`);
console.log(`Answer positions: ${[0, 1, 2, 3].map((i) => `${i}:${count((q) => q.answer === i)}`).join("  ")}`);
console.log(`Flagged "check" (years/numbers, likeliest to be wrong): ${count((q) => q.check)} — verify these first.`);
if (bank.length < 1000) console.log(`Under 1000: re-run with a higher --per-topic (it resumes and only adds more).`);
