# Udaan Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Udaan Air Force Day website: Google sign-in, profile registration, a one-attempt Gemini-generated 20-question quiz, poster upload/replace, and an admin view/export page, all active only 8-9 Oct 2026 IST.

**Architecture:** Next.js (App Router, TypeScript) app. The browser talks to Firebase Auth directly (Google sign-in) and uploads posters directly to Firebase Storage. Everything else goes through Next.js route handlers that verify the Firebase ID token and use the Firebase Admin SDK (Firestore, Storage). Business logic (window, timer, scoring, attempt lifecycle, poster confirmation, CSV) lives in pure, dependency-injected modules under `src/lib` that are unit tested without Firebase. Firestore is closed to clients entirely; Storage allows only owner `create` of size/type-limited files.

**Tech Stack:** Next.js 15, React 19, TypeScript, Tailwind CSS v4, Firebase (Auth, Firestore, Storage) + firebase-admin, `@google/genai`, zod, jszip, Vitest, `@firebase/rules-unit-testing`.

**Spec:** `docs/superpowers/specs/2026-10-06-udaan-design.md`

## Global Constraints

- Quiz: **1 attempt, 20 questions, 15 minutes**; reload resumes the same attempt; timer is server-clock based (`startedAt + 15 min`).
- Window: **00:00 on 8 Oct 2026 IST to 23:59:59 on 9 Oct 2026 IST** (`2026-10-07T18:30:00Z` inclusive to `2026-10-09T18:30:00Z` exclusive). Outside it the site is visible but quiz/poster are locked. An attempt started inside the window may be finished within its own 15 minutes.
- Poster: PDF, JPG or PNG, max **10 MB**, replaceable any time inside the window.
- Years: `FE, SE, TE, BE`. Branches: `COMP, IT, ENTC, MECH, ARE` (ARE = Automation & Robotics).
- Admins: fixed allowlist of Gmail addresses from env `ADMIN_EMAILS` (comma separated, case-insensitive). Admin = view + export only.
- Gemini key and correct answers never reach the browser. Quiz never fails to start: fallback bank used if Gemini fails.
- Look: match `poster.jpeg` (NSS event poster) with an air-force twist: cream grainy paper, blue gridded panels, chunky outlined bubble lettering (Chango) in yellow/red, sticker cards with dark outline and hard offset shadow, pink/green accents, QUIZ! starburst, jet/cloud/tricolour-badge art, footer credit "NSS · 2026 · On the occasion of Air Force Day". NSS logo is a placeholder component (`src/components/logo.tsx`) until the real file is supplied. **Mobile-first**, must also look good on laptop. Interactive targets at least 48px tall on phones.
- Motion limited to page-load fades and the timer.

## Review Focus

1. Student reloads at 14:59 into the quiz: same questions, saved answers, ~1s left; an answer arriving after `deadline + 5s` is rejected and the attempt is scored from earlier answers (Task 5).
2. Double-tap on Start, or two tabs: exactly one attempt is created and both calls return it (Task 5).
3. Gemini returns malformed JSON, markdown-fenced JSON, duplicate questions, an answer index of 7, fewer than 20 valid questions, a timeout, or throws: student still gets 20 valid questions (Task 4).
4. Name or roll number beginning with `=`, `+`, `-` or `@` (spreadsheet formula injection) is neutralised in the CSV export; commas/quotes/newlines are quoted (Task 12).
5. Poster confirm with another student's path, a path containing `..`, a file that was never uploaded, a `text/plain` or oversize upload, or a confirm after the window closed: rejected, and the offending own-path file is deleted (Task 7).

---

### Task 1: Project scaffold and tooling

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`, `vitest.config.ts`, `.gitignore`, `.env.example`, `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`

**Interfaces:**
- Produces: working `npm run dev`, `npm run build`, `npm test`, `npm run typecheck`; `@/` import alias to `src/`.

- [ ] **Step 1: Initialise git and install dependencies**

Run (in `C:\Users\princ\Desktop\Udaan`):
```bash
git init
npm init -y
npm i next@15 react@19 react-dom@19 firebase firebase-admin @google/genai zod jszip
npm i -D typescript @types/node @types/react @types/react-dom tailwindcss @tailwindcss/postcss postcss vitest @firebase/rules-unit-testing firebase-tools
```
Expected: installs without errors.

- [ ] **Step 2: Overwrite `package.json` scripts**

Open the generated `package.json`, keep the `dependencies`/`devDependencies` that npm wrote, set `"name": "udaan"`, `"private": true`, remove `"main"`, and set:
```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "typecheck": "tsc --noEmit",
  "test": "vitest run",
  "test:rules": "firebase emulators:exec --only firestore,storage --project demo-udaan \"vitest run --config vitest.rules.config.ts\""
}
```

- [ ] **Step 3: Write config files**

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```
`next.config.ts`:
```ts
import type { NextConfig } from "next";

const config: NextConfig = { reactStrictMode: true };
export default config;
```
`postcss.config.mjs`:
```js
export default { plugins: { "@tailwindcss/postcss": {} } };
```
`vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: { environment: "node", include: ["src/**/*.test.ts"], passWithNoTests: true },
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
});
```
`.gitignore`:
```
node_modules
.next
.env
.env*.local
next-env.d.ts
*.tsbuildinfo
firebase-debug.log
firestore-debug.log
ui-debug.log
```
`.env.example`:
```
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_APP_ID=
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
FIREBASE_STORAGE_BUCKET=
GEMINI_API_KEY=
GEMINI_MODEL=gemini-2.5-flash
ADMIN_EMAILS=admin1@gmail.com,admin2@gmail.com
# Optional overrides for local testing before 8 Oct (ISO 8601, UTC)
WINDOW_OPEN_ISO=
WINDOW_CLOSE_ISO=
```

- [ ] **Step 4: Minimal app shell**

`src/app/globals.css`:
```css
@import "tailwindcss";
```
`src/app/layout.tsx`:
```tsx
import "./globals.css";

export const metadata = { title: "Udaan" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```
`src/app/page.tsx`:
```tsx
export default function Home() {
  return <main>Udaan</main>;
}
```

- [ ] **Step 5: Verify**

Run: `npm run typecheck && npm test && npm run build`
Expected: typecheck clean, vitest reports no test files (passes), build succeeds.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "chore: scaffold Next.js, Tailwind, Vitest"
```

---

### Task 2: Config and event-window logic

**Files:**
- Create: `src/lib/config.ts`, `src/lib/window.ts`
- Test: `src/lib/config.test.ts`, `src/lib/window.test.ts`

**Interfaces:**
- Produces (`config.ts`): `YEARS`, `Year`, `BRANCHES`, `Branch`, `BRANCH_LABELS`, `QUIZ = {questionCount, durationMs, graceMs}`, `POSTER = {maxBytes, allowedTypes}`, `getWindow(env?) => {openAt:number; closeAt:number}`, `getAdminEmails(env?) => string[]`, `isAdminEmail(email, env?) => boolean`.
- Produces (`window.ts`): `type WindowState = "before" | "open" | "closed"`, `windowState(now:number, w:{openAt:number; closeAt:number}): WindowState`.

- [ ] **Step 1: Write failing tests**

`src/lib/window.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { windowState } from "@/lib/window";
import { getWindow } from "@/lib/config";

const w = getWindow({});

describe("event window (IST)", () => {
  it("is before the window one second before 00:00 IST on 8 Oct", () => {
    expect(windowState(Date.parse("2026-10-07T18:29:59Z"), w)).toBe("before");
  });
  it("opens exactly at 00:00 IST on 8 Oct", () => {
    expect(windowState(Date.parse("2026-10-07T18:30:00Z"), w)).toBe("open");
  });
  it("is still open at 23:59:59 IST on 9 Oct", () => {
    expect(windowState(Date.parse("2026-10-09T18:29:59Z"), w)).toBe("open");
  });
  it("is closed at 00:00 IST on 10 Oct", () => {
    expect(windowState(Date.parse("2026-10-09T18:30:00Z"), w)).toBe("closed");
  });
});
```
`src/lib/config.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { getAdminEmails, getWindow, isAdminEmail } from "@/lib/config";

describe("getWindow", () => {
  it("defaults to 8-9 Oct 2026 IST", () => {
    const w = getWindow({});
    expect(w.openAt).toBe(Date.parse("2026-10-07T18:30:00Z"));
    expect(w.closeAt).toBe(Date.parse("2026-10-09T18:30:00Z"));
  });
  it("treats empty override strings as unset", () => {
    expect(getWindow({ WINDOW_OPEN_ISO: "", WINDOW_CLOSE_ISO: "" }).openAt).toBe(
      Date.parse("2026-10-07T18:30:00Z"),
    );
  });
  it("honours overrides", () => {
    expect(getWindow({ WINDOW_OPEN_ISO: "2026-01-01T00:00:00Z" }).openAt).toBe(
      Date.parse("2026-01-01T00:00:00Z"),
    );
  });
});

describe("admin allowlist", () => {
  const env = { ADMIN_EMAILS: " Boss@Gmail.com , second@gmail.com " };
  it("parses and lowercases", () => {
    expect(getAdminEmails(env)).toEqual(["boss@gmail.com", "second@gmail.com"]);
  });
  it("matches case-insensitively", () => {
    expect(isAdminEmail("BOSS@gmail.com", env)).toBe(true);
  });
  it("rejects others, empty and missing emails", () => {
    expect(isAdminEmail("student@gmail.com", env)).toBe(false);
    expect(isAdminEmail("", env)).toBe(false);
    expect(isAdminEmail(undefined, env)).toBe(false);
  });
  it("nobody is admin when env is unset", () => {
    expect(isAdminEmail("boss@gmail.com", {})).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib`
Expected: FAIL, cannot resolve `@/lib/config` / `@/lib/window`.

- [ ] **Step 3: Implement**

`src/lib/config.ts`:
```ts
export const YEARS = ["FE", "SE", "TE", "BE"] as const;
export type Year = (typeof YEARS)[number];

export const BRANCHES = ["COMP", "IT", "ENTC", "MECH", "ARE"] as const;
export type Branch = (typeof BRANCHES)[number];

export const BRANCH_LABELS: Record<Branch, string> = {
  COMP: "Computer Engineering",
  IT: "Information Technology",
  ENTC: "Electronics & Telecommunication",
  MECH: "Mechanical Engineering",
  ARE: "Automation & Robotics",
};

export const QUIZ = {
  questionCount: 20,
  durationMs: 15 * 60 * 1000,
  graceMs: 5000,
} as const;

export const POSTER = {
  maxBytes: 10 * 1024 * 1024,
  allowedTypes: ["application/pdf", "image/jpeg", "image/png"],
} as const;

// 00:00 on 8 Oct 2026 IST (UTC+5:30) and 00:00 on 10 Oct 2026 IST (exclusive).
const DEFAULT_OPEN = "2026-10-07T18:30:00Z";
const DEFAULT_CLOSE = "2026-10-09T18:30:00Z";

type Env = Record<string, string | undefined>;

export function getWindow(env: Env = process.env) {
  return {
    openAt: Date.parse(env.WINDOW_OPEN_ISO || DEFAULT_OPEN),
    closeAt: Date.parse(env.WINDOW_CLOSE_ISO || DEFAULT_CLOSE),
  };
}

export function getAdminEmails(env: Env = process.env): string[] {
  return (env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email: string | null | undefined, env: Env = process.env): boolean {
  if (!email) return false;
  return getAdminEmails(env).includes(email.trim().toLowerCase());
}
```
`src/lib/window.ts`:
```ts
export type WindowState = "before" | "open" | "closed";

export function windowState(now: number, w: { openAt: number; closeAt: number }): WindowState {
  if (now < w.openAt) return "before";
  if (now >= w.closeAt) return "closed";
  return "open";
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/lib`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: event window and admin allowlist config"
```

---

### Task 3: Quiz core (types, validation, timer, scoring)

**Files:**
- Create: `src/lib/quiz/types.ts`, `src/lib/quiz/validate.ts`, `src/lib/quiz/timer.ts`, `src/lib/quiz/score.ts`, `src/lib/quiz/random.ts`
- Test: `src/lib/quiz/validate.test.ts`, `src/lib/quiz/timer.test.ts`, `src/lib/quiz/score.test.ts`

**Interfaces:**
- Produces: `Question {text; options:string[]; answer:number}`, `PublicQuestion {text; options}`; `cleanQuestions(raw:unknown, count:number): Question[]` (throws if fewer than `count` valid, unique questions); `deadlineOf(startedAt)`, `isExpired(startedAt, now, graceMs?)`, `remainingMs(startedAt, now)`; `scoreAttempt(questions, answers: Record<string, number>): number`; `shuffle<T>(arr, random?): T[]`.

- [ ] **Step 1: Write failing tests**

`src/lib/quiz/validate.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { cleanQuestions } from "@/lib/quiz/validate";

const q = (i: number, over: object = {}) => ({
  text: `Question number ${i} about the air force?`,
  options: [`a${i}`, `b${i}`, `c${i}`, `d${i}`],
  answer: i % 4,
  ...over,
});
const many = (n: number) => Array.from({ length: n }, (_, i) => q(i));

describe("cleanQuestions", () => {
  it("returns exactly `count` valid questions", () => {
    expect(cleanQuestions(many(23), 20)).toHaveLength(20);
  });
  it("drops invalid items (answer index out of range, 3 options, duplicate options)", () => {
    const raw = [
      ...many(20),
      q(100, { answer: 7 }),
      q(101, { options: ["a", "b", "c"] }),
      q(102, { options: ["same", "same", "x", "y"] }),
    ];
    expect(cleanQuestions(raw, 20)).toHaveLength(20);
    const withBadFirst = [q(100, { answer: 7 }), ...many(20)];
    expect(cleanQuestions(withBadFirst, 20).some((x) => x.answer > 3)).toBe(false);
  });
  it("drops duplicate question texts case-insensitively", () => {
    const raw = [q(1), q(1, { text: "QUESTION NUMBER 1 ABOUT THE AIR FORCE?" }), ...many(25).slice(2)];
    const out = cleanQuestions(raw, 20);
    expect(new Set(out.map((x) => x.text.toLowerCase())).size).toBe(20);
  });
  it("throws when fewer than count valid remain", () => {
    expect(() => cleanQuestions(many(19), 20)).toThrow(/only 19/);
  });
  it("throws when input is not an array", () => {
    expect(() => cleanQuestions({ questions: [] }, 20)).toThrow();
  });
});
```
`src/lib/quiz/timer.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { deadlineOf, isExpired, remainingMs } from "@/lib/quiz/timer";

const start = 1_000_000;
describe("timer", () => {
  it("deadline is start + 15 minutes", () => {
    expect(deadlineOf(start)).toBe(start + 15 * 60 * 1000);
  });
  it("remaining at 14:59 is 1000ms", () => {
    expect(remainingMs(start, start + 14 * 60 * 1000 + 59_000)).toBe(1000);
  });
  it("remaining never goes negative", () => {
    expect(remainingMs(start, start + 20 * 60 * 1000)).toBe(0);
  });
  it("is not expired inside the grace window", () => {
    expect(isExpired(start, deadlineOf(start) + 5000)).toBe(false);
  });
  it("is expired just after the grace window", () => {
    expect(isExpired(start, deadlineOf(start) + 5001)).toBe(true);
  });
});
```
`src/lib/quiz/score.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { scoreAttempt } from "@/lib/quiz/score";

const qs = [0, 1, 2, 3].map((a) => ({ text: "t".repeat(12), options: ["a", "b", "c", "d"], answer: a }));

describe("scoreAttempt", () => {
  it("counts correct answers", () => {
    expect(scoreAttempt(qs, { "0": 0, "1": 1, "2": 0, "3": 3 })).toBe(3);
  });
  it("unanswered counts as zero, no negative marking", () => {
    expect(scoreAttempt(qs, {})).toBe(0);
  });
  it("ignores answers for indexes that do not exist", () => {
    expect(scoreAttempt(qs, { "9": 0 })).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/quiz`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement**

`src/lib/quiz/types.ts`:
```ts
export interface Question {
  text: string;
  options: string[];
  answer: number;
}
export interface PublicQuestion {
  text: string;
  options: string[];
}
```
`src/lib/quiz/random.ts`:
```ts
export function shuffle<T>(arr: readonly T[], random: () => number = Math.random): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
```
`src/lib/quiz/validate.ts`:
```ts
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
```
`src/lib/quiz/timer.ts`:
```ts
import { QUIZ } from "@/lib/config";

export const deadlineOf = (startedAt: number) => startedAt + QUIZ.durationMs;
export const isExpired = (startedAt: number, now: number, graceMs: number = QUIZ.graceMs) =>
  now > deadlineOf(startedAt) + graceMs;
export const remainingMs = (startedAt: number, now: number) =>
  Math.max(0, deadlineOf(startedAt) - now);
```
`src/lib/quiz/score.ts`:
```ts
import type { Question } from "./types";

export function scoreAttempt(questions: Question[], answers: Record<string, number>): number {
  let score = 0;
  questions.forEach((q, i) => {
    if (answers[String(i)] === q.answer) score++;
  });
  return score;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/lib/quiz`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: quiz validation, timer and scoring"
```

---

### Task 4: Question generation with Gemini and fallback bank

**Files:**
- Create: `src/lib/quiz/fallback-bank.ts`, `src/lib/quiz/generate.ts`, `src/lib/quiz/gemini.ts`
- Test: `src/lib/quiz/generate.test.ts`, `src/lib/quiz/fallback-bank.test.ts`

**Interfaces:**
- Consumes: `cleanQuestions`, `shuffle`, `Question`.
- Produces: `FALLBACK_BANK: Question[]` (30 items); `generateQuestions(count, deps: {callModel:(prompt:string)=>Promise<string>; bank:Question[]; random?:()=>number; attempts?:number; timeoutMs?:number}): Promise<{questions:Question[]; source:"gemini"|"fallback"}>`; `geminiCallModel(apiKey:string, model:string): (prompt:string)=>Promise<string>`.

- [ ] **Step 1: Write failing tests**

`src/lib/quiz/fallback-bank.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { FALLBACK_BANK } from "@/lib/quiz/fallback-bank";
import { cleanQuestions } from "@/lib/quiz/validate";

describe("FALLBACK_BANK", () => {
  it("has at least 30 valid, unique questions", () => {
    expect(FALLBACK_BANK.length).toBeGreaterThanOrEqual(30);
    expect(cleanQuestions(FALLBACK_BANK, FALLBACK_BANK.length)).toHaveLength(FALLBACK_BANK.length);
  });
});
```
`src/lib/quiz/generate.test.ts`:
```ts
import { describe, expect, it, vi } from "vitest";
import { generateQuestions } from "@/lib/quiz/generate";
import { FALLBACK_BANK } from "@/lib/quiz/fallback-bank";

const q = (i: number) => ({
  text: `Generated question ${i} about the air force?`,
  options: [`a${i}`, `b${i}`, `c${i}`, `d${i}`],
  answer: i % 4,
});
const json = (n: number) => JSON.stringify(Array.from({ length: n }, (_, i) => q(i)));
const base = { bank: FALLBACK_BANK, timeoutMs: 200 };

describe("generateQuestions", () => {
  it("uses Gemini output when valid", async () => {
    const r = await generateQuestions(20, { ...base, callModel: async () => json(23) });
    expect(r.source).toBe("gemini");
    expect(r.questions).toHaveLength(20);
  });
  it("accepts markdown-fenced JSON", async () => {
    const r = await generateQuestions(20, {
      ...base,
      callModel: async () => "```json\n" + json(23) + "\n```",
    });
    expect(r.source).toBe("gemini");
  });
  it("retries once after malformed output", async () => {
    const callModel = vi.fn().mockResolvedValueOnce("not json").mockResolvedValueOnce(json(23));
    const r = await generateQuestions(20, { ...base, callModel });
    expect(r.source).toBe("gemini");
    expect(callModel).toHaveBeenCalledTimes(2);
  });
  it("falls back when output has too few valid questions", async () => {
    const r = await generateQuestions(20, { ...base, callModel: async () => json(10) });
    expect(r.source).toBe("fallback");
    expect(r.questions).toHaveLength(20);
  });
  it("falls back when the model throws", async () => {
    const r = await generateQuestions(20, {
      ...base,
      callModel: async () => {
        throw new Error("503");
      },
    });
    expect(r.source).toBe("fallback");
  });
  it("falls back when the model hangs past the timeout", async () => {
    const r = await generateQuestions(20, {
      ...base,
      attempts: 1,
      callModel: () => new Promise<string>(() => {}),
    });
    expect(r.source).toBe("fallback");
  });
  it("fallback questions are unique", async () => {
    const r = await generateQuestions(20, { ...base, callModel: async () => "[]" });
    expect(new Set(r.questions.map((x) => x.text)).size).toBe(20);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/quiz/generate.test.ts src/lib/quiz/fallback-bank.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement the fallback bank**

`src/lib/quiz/fallback-bank.ts`:
```ts
import type { Question } from "./types";

const q = (text: string, options: string[], answer: number): Question => ({ text, options, answer });

export const FALLBACK_BANK: Question[] = [
  q("On which date is Indian Air Force Day celebrated every year?", ["1 August", "15 August", "8 October", "26 January"], 2),
  q("In which year was the Indian Air Force established?", ["1932", "1947", "1950", "1962"], 0),
  q("What is the motto of the Indian Air Force?", ["Service Before Self", "Touch the Sky with Glory", "Victory Through Valour", "Guardians of the Nation"], 1),
  q("Who was the first Indian Chief of the Air Staff?", ["Arjan Singh", "Subroto Mukerjee", "P. C. Lal", "Idris Hasan Latif"], 1),
  q("Who is the only IAF officer to have attained the rank of Marshal of the Indian Air Force?", ["Arjan Singh", "Subroto Mukerjee", "Om Prakash Mehra", "Dilbagh Singh"], 0),
  q("Which IAF officer is the only airman to have received the Param Vir Chakra?", ["Abhinandan Varthaman", "Nirmal Jit Singh Sekhon", "Ajay Ahuja", "Rakesh Sharma"], 1),
  q("Which air operation was carried out by the IAF during the 1999 Kargil conflict?", ["Operation Vijay", "Operation Meghdoot", "Operation Safed Sagar", "Operation Cactus"], 2),
  q("Which company manufactures the Rafale fighter aircraft operated by the IAF?", ["Lockheed Martin", "Dassault Aviation", "Sukhoi", "Eurofighter GmbH"], 1),
  q("Which public-sector company manufactures the Tejas light combat aircraft?", ["Bharat Electronics Limited", "Bharat Dynamics Limited", "Mishra Dhatu Nigam", "Hindustan Aeronautics Limited"], 3),
  q("The Sukhoi Su-30MKI was originally developed in which country?", ["France", "United States", "Russia", "Sweden"], 2),
  q("Which IAF pilot became the first Indian to travel to space, in 1984?", ["Rakesh Sharma", "Kalpana Chawla", "Sunita Williams", "Ravish Malhotra"], 0),
  q("Wing Commander Abhinandan Varthaman was flying which aircraft when he was shot down in February 2019?", ["Mirage 2000", "MiG-21 Bison", "Jaguar", "Su-30MKI"], 1),
  q("Which aircraft did the IAF use in the Balakot air strike of February 2019?", ["MiG-29", "Mirage 2000", "Tejas", "Hawk"], 1),
  q("Where is the Indian Air Force Academy located?", ["Pune", "Bengaluru", "Dundigal, near Hyderabad", "Nagpur"], 2),
  q("Which IAF rank is equivalent to a Colonel in the Indian Army?", ["Wing Commander", "Group Captain", "Squadron Leader", "Air Commodore"], 1),
  q("What is the highest serving rank in the IAF in peacetime?", ["Marshal of the Indian Air Force", "Air Marshal", "Air Chief Marshal", "Air Vice Marshal"], 2),
  q("Which IAF aerobatic display team flies the Hawk Mk 132 jet trainers?", ["Sarang", "Suryakiran", "Akash Ganga", "Vajra"], 1),
  q("The IAF's Sarang helicopter display team flies which helicopter?", ["Mi-17", "Chetak", "Apache", "HAL Dhruv"], 3),
  q("Which company manufactures the C-17 Globemaster III used by the IAF for strategic airlift?", ["Airbus", "Boeing", "Ilyushin", "Embraer"], 1),
  q("The Apache AH-64E and Chinook CH-47F helicopters in IAF service are built by which company?", ["Boeing", "Airbus", "Leonardo", "Sikorsky"], 0),
  q("Which IAF officer travelled to the International Space Station in 2025 on the Axiom-4 mission?", ["Prashanth Nair", "Ajit Krishnan", "Shubhanshu Shukla", "Angad Pratap"], 2),
  q("In 1988, Operation Cactus saw the IAF airlift paratroopers to help which country?", ["Sri Lanka", "Maldives", "Nepal", "Seychelles"], 1),
  q("Which missile can the Su-30MKI carry in its air-launched version, developed jointly by India and Russia?", ["Agni-V", "BrahMos", "Prithvi", "Nag"], 1),
  q("What is the name of the IAF's special forces unit?", ["MARCOS", "Para SF", "Garud Commando Force", "NSG"], 2),
  q("Where is the Southern Air Command of the IAF headquartered?", ["Chennai", "Thiruvananthapuram", "Bengaluru", "Kochi"], 1),
  q("The Jaguar strike aircraft in IAF service was jointly developed by which two countries?", ["India and Russia", "France and Germany", "United Kingdom and France", "United States and Israel"], 2),
  q("Which small fighter was nicknamed 'Sabre Slayer' for its performance against Pakistan's F-86 Sabres in 1965?", ["Hunter", "Gnat", "Vampire", "Canberra"], 1),
  q("In which year was the Kargil conflict fought?", ["1971", "1999", "2001", "1965"], 1),
  q("Which 2025 operation saw Indian forces strike terrorist infrastructure after the Pahalgam attack?", ["Operation Rahat", "Operation Vijay", "Operation Meghdoot", "Operation Sindoor"], 3),
  q("By what name is the Mirage 2000 known in Indian Air Force service?", ["Garuda", "Shakti", "Vajra", "Trishul"], 2),
];
```

- [ ] **Step 4: Implement generator and Gemini adapter**

`src/lib/quiz/generate.ts`:
```ts
import { cleanQuestions } from "./validate";
import { shuffle } from "./random";
import type { Question } from "./types";

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
      const text = await withTimeout(d.callModel(prompt), d.timeoutMs ?? 20000);
      return { questions: cleanQuestions(JSON.parse(stripFences(text)), count), source: "gemini" };
    } catch (e) {
      console.error(`question generation attempt ${n + 1} failed:`, e instanceof Error ? e.message : e);
    }
  }
  if (d.bank.length < count) throw new Error("fallback bank smaller than question count");
  return { questions: shuffle(d.bank, random).slice(0, count), source: "fallback" };
}
```
`src/lib/quiz/gemini.ts`:
```ts
import { GoogleGenAI } from "@google/genai";

export function geminiCallModel(apiKey: string, model: string) {
  const ai = new GoogleGenAI({ apiKey });
  return async (prompt: string): Promise<string> => {
    const res = await ai.models.generateContent({
      model,
      contents: prompt,
      config: { responseMimeType: "application/json", temperature: 1 },
    });
    if (!res.text) throw new Error("empty model response");
    return res.text;
  };
}
```

- [ ] **Step 5: Run to verify pass**

Run: `npx vitest run src/lib/quiz && npm run typecheck`
Expected: PASS, typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: Gemini question generation with fallback bank"
```

---

### Task 5: Attempt lifecycle service

**Files:**
- Create: `src/lib/quiz/service.ts`, `src/lib/quiz/memory-store.ts`
- Test: `src/lib/quiz/service.test.ts`

**Interfaces:**
- Consumes: `Question`, `PublicQuestion`, `scoreAttempt`, `isExpired`, `deadlineOf`, `windowState`, `QUIZ`.
- Produces:
```ts
interface AttemptRecord { questions: Question[]; answers: Record<string, number>; startedAt: number; status: "in_progress"|"submitted"; score: number|null; submittedAt: number|null; source: "gemini"|"fallback" }
class AlreadyExistsError extends Error {}
interface AttemptStore { get(uid): Promise<AttemptRecord|null>; create(uid, a): Promise<void> /* throws AlreadyExistsError */; update(uid, patch: Partial<AttemptRecord>): Promise<void>; setAnswer(uid, index:number, choice:number): Promise<void> }
class QuizError extends Error { code: "WINDOW_NOT_OPEN"|"WINDOW_CLOSED"|"NO_ATTEMPT"|"NOT_IN_PROGRESS"|"BAD_INPUT" }
interface QuizDeps { store: AttemptStore; now: () => number; window: {openAt:number; closeAt:number}; generate: (count:number) => Promise<{questions: Question[]; source: "gemini"|"fallback"}> }
interface AttemptView { status; questions: PublicQuestion[]; answers: Record<string,number>; startedAt:number; deadlineAt:number; serverNow:number; score:number|null; total:number }
startAttempt(uid, deps): Promise<AttemptView>
getAttemptView(uid, deps): Promise<AttemptView|null>
saveAnswer(uid, index, choice, deps): Promise<void>
submitAttempt(uid, deps): Promise<AttemptView>
```
- `MemoryAttemptStore` implements `AttemptStore` for tests.

- [ ] **Step 1: Write the store and failing tests**

`src/lib/quiz/memory-store.ts`:
```ts
import { AlreadyExistsError, type AttemptRecord, type AttemptStore } from "./service";

export class MemoryAttemptStore implements AttemptStore {
  data = new Map<string, AttemptRecord>();
  async get(uid: string) {
    const a = this.data.get(uid);
    return a ? structuredClone(a) : null;
  }
  async create(uid: string, a: AttemptRecord) {
    if (this.data.has(uid)) throw new AlreadyExistsError();
    this.data.set(uid, structuredClone(a));
  }
  async update(uid: string, patch: Partial<AttemptRecord>) {
    this.data.set(uid, { ...this.data.get(uid)!, ...patch });
  }
  async setAnswer(uid: string, index: number, choice: number) {
    this.data.get(uid)!.answers[String(index)] = choice;
  }
}
```
`src/lib/quiz/service.test.ts`:
```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryAttemptStore } from "@/lib/quiz/memory-store";
import { getAttemptView, QuizError, saveAnswer, startAttempt, submitAttempt, type QuizDeps } from "@/lib/quiz/service";
import { deadlineOf } from "@/lib/quiz/timer";

const OPEN = Date.parse("2026-10-07T18:30:00Z");
const CLOSE = Date.parse("2026-10-09T18:30:00Z");
const questions = Array.from({ length: 20 }, (_, i) => ({
  text: `Question ${i} about the air force?`,
  options: ["a", "b", "c", "d"],
  answer: i % 4,
}));

let clock = OPEN + 1000;
let store: MemoryAttemptStore;
let generate: ReturnType<typeof vi.fn>;
let deps: QuizDeps;

beforeEach(() => {
  clock = OPEN + 1000;
  store = new MemoryAttemptStore();
  generate = vi.fn(async () => ({ questions, source: "gemini" as const }));
  deps = { store, now: () => clock, window: { openAt: OPEN, closeAt: CLOSE }, generate };
});

const code = async (p: Promise<unknown>) => p.then(() => null, (e: QuizError) => e.code);

describe("startAttempt", () => {
  it("creates an attempt and never exposes answers", async () => {
    const v = await startAttempt("u1", deps);
    expect(v.status).toBe("in_progress");
    expect(v.questions).toHaveLength(20);
    expect(JSON.stringify(v)).not.toContain('"answer"');
    expect(v.deadlineAt).toBe(v.startedAt + 15 * 60 * 1000);
  });
  it("resumes the same attempt on a second start (no second generation)", async () => {
    const a = await startAttempt("u1", deps);
    clock += 60_000;
    const b = await startAttempt("u1", deps);
    expect(b.startedAt).toBe(a.startedAt);
    expect(generate).toHaveBeenCalledTimes(1);
  });
  it("double-tap creates exactly one attempt", async () => {
    const [a, b] = await Promise.all([startAttempt("u1", deps), startAttempt("u1", deps)]);
    expect(a.startedAt).toBe(b.startedAt);
    expect(store.data.size).toBe(1);
  });
  it("starts the timer after generation finishes", async () => {
    generate.mockImplementation(async () => {
      clock += 8000;
      return { questions, source: "gemini" as const };
    });
    const v = await startAttempt("u1", deps);
    expect(v.startedAt).toBe(OPEN + 1000 + 8000);
  });
  it("refuses before the window opens", async () => {
    clock = OPEN - 1;
    expect(await code(startAttempt("u1", deps))).toBe("WINDOW_NOT_OPEN");
  });
  it("refuses after the window closes", async () => {
    clock = CLOSE;
    expect(await code(startAttempt("u1", deps))).toBe("WINDOW_CLOSED");
  });
  it("allows resuming an attempt after the window closes if still inside its own 15 minutes", async () => {
    clock = CLOSE - 60_000;
    await startAttempt("u1", deps);
    clock = CLOSE + 60_000;
    const v = await getAttemptView("u1", deps);
    expect(v?.status).toBe("in_progress");
  });
});

describe("saveAnswer / getAttemptView", () => {
  it("persists answers across reload", async () => {
    await startAttempt("u1", deps);
    await saveAnswer("u1", 3, 2, deps);
    const v = await getAttemptView("u1", deps);
    expect(v?.answers).toEqual({ "3": 2 });
  });
  it("reload at 14:59 shows the same questions with about 1s left", async () => {
    const a = await startAttempt("u1", deps);
    clock = a.startedAt + 14 * 60_000 + 59_000;
    const v = await getAttemptView("u1", deps);
    expect(v?.deadlineAt - v!.serverNow).toBe(1000);
    expect(v?.questions).toEqual(a.questions);
  });
  it("rejects out-of-range input", async () => {
    await startAttempt("u1", deps);
    expect(await code(saveAnswer("u1", 20, 0, deps))).toBe("BAD_INPUT");
    expect(await code(saveAnswer("u1", 0, 4, deps))).toBe("BAD_INPUT");
    expect(await code(saveAnswer("u1", -1, 0, deps))).toBe("BAD_INPUT");
    expect(await code(saveAnswer("u1", 1.5, 0, deps))).toBe("BAD_INPUT");
  });
  it("rejects answers when no attempt exists", async () => {
    expect(await code(saveAnswer("nobody", 0, 0, deps))).toBe("NO_ATTEMPT");
  });
  it("accepts an answer inside the grace window", async () => {
    const a = await startAttempt("u1", deps);
    clock = deadlineOf(a.startedAt) + 4000;
    await saveAnswer("u1", 0, 0, deps);
    expect((await getAttemptView("u1", deps))?.answers).toEqual({ "0": 0 });
  });
  it("rejects an answer after deadline+grace and auto-scores earlier answers", async () => {
    const a = await startAttempt("u1", deps);
    await saveAnswer("u1", 0, 0, deps); // correct
    await saveAnswer("u1", 1, 1, deps); // correct
    clock = deadlineOf(a.startedAt) + 6000;
    expect(await code(saveAnswer("u1", 2, 2, deps))).toBe("NOT_IN_PROGRESS");
    const v = await getAttemptView("u1", deps);
    expect(v?.status).toBe("submitted");
    expect(v?.score).toBe(2);
    expect(v?.answers).toEqual({ "0": 0, "1": 1 });
  });
  it("returns null when there is no attempt", async () => {
    expect(await getAttemptView("nobody", deps)).toBeNull();
  });
});

describe("submitAttempt", () => {
  it("scores and locks the attempt", async () => {
    await startAttempt("u1", deps);
    await saveAnswer("u1", 0, 0, deps);
    await saveAnswer("u1", 1, 3, deps);
    const v = await submitAttempt("u1", deps);
    expect(v.status).toBe("submitted");
    expect(v.score).toBe(1);
    expect(await code(saveAnswer("u1", 2, 2, deps))).toBe("NOT_IN_PROGRESS");
  });
  it("is idempotent", async () => {
    await startAttempt("u1", deps);
    await saveAnswer("u1", 0, 0, deps);
    const a = await submitAttempt("u1", deps);
    clock += 10_000;
    const b = await submitAttempt("u1", deps);
    expect(b.score).toBe(a.score);
    expect(store.data.get("u1")!.submittedAt).toBe(OPEN + 1000);
  });
  it("shows the score only after submission", async () => {
    await startAttempt("u1", deps);
    expect((await getAttemptView("u1", deps))?.score).toBeNull();
  });
  it("fails without an attempt", async () => {
    expect(await code(submitAttempt("nobody", deps))).toBe("NO_ATTEMPT");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/quiz/service.test.ts`
Expected: FAIL, `@/lib/quiz/service` not found.

- [ ] **Step 3: Implement the service**

`src/lib/quiz/service.ts`:
```ts
import { QUIZ } from "@/lib/config";
import { windowState } from "@/lib/window";
import { scoreAttempt } from "./score";
import { deadlineOf, isExpired } from "./timer";
import type { PublicQuestion, Question } from "./types";

export interface AttemptRecord {
  questions: Question[];
  answers: Record<string, number>;
  startedAt: number;
  status: "in_progress" | "submitted";
  score: number | null;
  submittedAt: number | null;
  source: "gemini" | "fallback";
}

export class AlreadyExistsError extends Error {}

export interface AttemptStore {
  get(uid: string): Promise<AttemptRecord | null>;
  create(uid: string, a: AttemptRecord): Promise<void>;
  update(uid: string, patch: Partial<AttemptRecord>): Promise<void>;
  setAnswer(uid: string, index: number, choice: number): Promise<void>;
}

type QuizCode = "WINDOW_NOT_OPEN" | "WINDOW_CLOSED" | "NO_ATTEMPT" | "NOT_IN_PROGRESS" | "BAD_INPUT";

const MESSAGES: Record<QuizCode, string> = {
  WINDOW_NOT_OPEN: "The quiz has not opened yet.",
  WINDOW_CLOSED: "The quiz window has closed.",
  NO_ATTEMPT: "You have not started the quiz.",
  NOT_IN_PROGRESS: "This attempt is already finished.",
  BAD_INPUT: "Invalid answer.",
};

export class QuizError extends Error {
  constructor(public code: QuizCode) {
    super(MESSAGES[code]);
  }
}

export interface QuizDeps {
  store: AttemptStore;
  now: () => number;
  window: { openAt: number; closeAt: number };
  generate: (count: number) => Promise<{ questions: Question[]; source: "gemini" | "fallback" }>;
}

export interface AttemptView {
  status: "in_progress" | "submitted";
  questions: PublicQuestion[];
  answers: Record<string, number>;
  startedAt: number;
  deadlineAt: number;
  serverNow: number;
  score: number | null;
  total: number;
}

function toView(a: AttemptRecord, now: number): AttemptView {
  return {
    status: a.status,
    questions: a.questions.map(({ text, options }) => ({ text, options })),
    answers: a.answers,
    startedAt: a.startedAt,
    deadlineAt: deadlineOf(a.startedAt),
    serverNow: now,
    score: a.status === "submitted" ? a.score : null,
    total: a.questions.length,
  };
}

async function finalize(uid: string, a: AttemptRecord, deps: QuizDeps): Promise<AttemptRecord> {
  const patch = {
    status: "submitted" as const,
    score: scoreAttempt(a.questions, a.answers),
    submittedAt: Math.min(deps.now(), deadlineOf(a.startedAt)),
  };
  await deps.store.update(uid, patch);
  return { ...a, ...patch };
}

async function settle(uid: string, a: AttemptRecord, deps: QuizDeps): Promise<AttemptRecord> {
  if (a.status === "in_progress" && isExpired(a.startedAt, deps.now())) return finalize(uid, a, deps);
  return a;
}

export async function startAttempt(uid: string, deps: QuizDeps): Promise<AttemptView> {
  const existing = await deps.store.get(uid);
  if (existing) return toView(await settle(uid, existing, deps), deps.now());

  const state = windowState(deps.now(), deps.window);
  if (state === "before") throw new QuizError("WINDOW_NOT_OPEN");
  if (state === "closed") throw new QuizError("WINDOW_CLOSED");

  const { questions, source } = await deps.generate(QUIZ.questionCount);
  const record: AttemptRecord = {
    questions,
    answers: {},
    startedAt: deps.now(), // timer starts after generation so Gemini latency is free
    status: "in_progress",
    score: null,
    submittedAt: null,
    source,
  };
  try {
    await deps.store.create(uid, record);
  } catch (e) {
    if (e instanceof AlreadyExistsError) {
      const won = await deps.store.get(uid);
      if (won) return toView(await settle(uid, won, deps), deps.now());
    }
    throw e;
  }
  return toView(record, deps.now());
}

export async function getAttemptView(uid: string, deps: QuizDeps): Promise<AttemptView | null> {
  const a = await deps.store.get(uid);
  if (!a) return null;
  return toView(await settle(uid, a, deps), deps.now());
}

export async function saveAnswer(uid: string, index: number, choice: number, deps: QuizDeps): Promise<void> {
  if (!Number.isInteger(index) || index < 0 || index >= QUIZ.questionCount) throw new QuizError("BAD_INPUT");
  if (!Number.isInteger(choice) || choice < 0 || choice > 3) throw new QuizError("BAD_INPUT");
  const found = await deps.store.get(uid);
  if (!found) throw new QuizError("NO_ATTEMPT");
  const a = await settle(uid, found, deps);
  if (a.status !== "in_progress") throw new QuizError("NOT_IN_PROGRESS");
  await deps.store.setAnswer(uid, index, choice);
}

export async function submitAttempt(uid: string, deps: QuizDeps): Promise<AttemptView> {
  const a = await deps.store.get(uid);
  if (!a) throw new QuizError("NO_ATTEMPT");
  const done = a.status === "submitted" ? a : await finalize(uid, a, deps);
  return toView(done, deps.now());
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/lib/quiz && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: quiz attempt lifecycle service"
```

---

### Task 6: Firebase setup, server auth, HTTP helpers, profile

**Files:**
- Create: `src/lib/firebase/admin.ts`, `src/lib/firebase/client.ts`, `src/lib/server/http.ts`, `src/lib/server/auth.ts`, `src/lib/server/repo.ts`, `src/lib/profile.ts`
- Test: `src/lib/server/http.test.ts`, `src/lib/profile.test.ts`

**Interfaces:**
- Produces:
  - `adminAuth()`, `adminDb()`, `adminBucket()` (lazy).
  - `HttpError(status, message)`, `errorResponse(e): Response`, `route(fn): (req: Request) => Promise<Response>`.
  - `requireUser(req): Promise<{uid; email; name}>`, `requireAdmin(req)`.
  - `ProfileSchema` (zod) and `type Profile = {name; rollNo; year; branch}`.
  - `repo.ts`: `FirestoreAttemptStore` (implements `AttemptStore`), `getUser(uid): Promise<(Profile & {uid; email; createdAt:number})|null>`, `saveUser(u)`, `getPosterRecord(uid)`, `setPosterRecord(uid, r)`, `listUsers()`, `listAttemptSummaries()`, `listPosterRecords()`.
  - `errorResponse` will also map `PosterError` (added in Task 7); keep the mapping extensible.

- [ ] **Step 1: Write failing tests**

`src/lib/profile.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { ProfileSchema } from "@/lib/profile";

const ok = { name: "Asha Patil", rollNo: "21CE1045", year: "TE", branch: "COMP" };

describe("ProfileSchema", () => {
  it("accepts a valid profile and trims", () => {
    expect(ProfileSchema.parse({ ...ok, name: "  Asha Patil  " }).name).toBe("Asha Patil");
  });
  it("accepts every branch and year", () => {
    for (const branch of ["COMP", "IT", "ENTC", "MECH", "ARE"]) expect(ProfileSchema.safeParse({ ...ok, branch }).success).toBe(true);
    for (const year of ["FE", "SE", "TE", "BE"]) expect(ProfileSchema.safeParse({ ...ok, year }).success).toBe(true);
  });
  it("rejects unknown year/branch, short name, spaces or symbols in roll number", () => {
    expect(ProfileSchema.safeParse({ ...ok, year: "ME" }).success).toBe(false);
    expect(ProfileSchema.safeParse({ ...ok, branch: "CIVIL" }).success).toBe(false);
    expect(ProfileSchema.safeParse({ ...ok, name: "A" }).success).toBe(false);
    expect(ProfileSchema.safeParse({ ...ok, rollNo: "21 CE" }).success).toBe(false);
    expect(ProfileSchema.safeParse({ ...ok, rollNo: "<script>" }).success).toBe(false);
  });
});
```
`src/lib/server/http.test.ts`:
```ts
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { HttpError, errorResponse, route } from "@/lib/server/http";
import { QuizError } from "@/lib/quiz/service";

describe("errorResponse", () => {
  it("maps HttpError", async () => {
    const r = errorResponse(new HttpError(403, "Admins only"));
    expect(r.status).toBe(403);
    expect(await r.json()).toEqual({ error: "Admins only" });
  });
  it("maps QuizError codes", () => {
    expect(errorResponse(new QuizError("WINDOW_CLOSED")).status).toBe(403);
    expect(errorResponse(new QuizError("NO_ATTEMPT")).status).toBe(404);
    expect(errorResponse(new QuizError("NOT_IN_PROGRESS")).status).toBe(409);
    expect(errorResponse(new QuizError("BAD_INPUT")).status).toBe(400);
  });
  it("maps zod errors to 400", () => {
    const err = z.object({ a: z.string() }).safeParse({}).error!;
    expect(errorResponse(err).status).toBe(400);
  });
  it("hides unknown errors behind a 500", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const r = errorResponse(new Error("secret db password"));
    expect(r.status).toBe(500);
    expect(JSON.stringify(await r.json())).not.toContain("secret");
  });
});

describe("route", () => {
  it("wraps plain return values as JSON and thrown errors as responses", async () => {
    const ok = await route(async () => ({ hi: 1 }))(new Request("http://x"));
    expect(await ok.json()).toEqual({ hi: 1 });
    const bad = await route(async () => {
      throw new HttpError(401, "Sign in required");
    })(new Request("http://x"));
    expect(bad.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/profile.test.ts src/lib/server`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement profile and HTTP helpers**

`src/lib/profile.ts`:
```ts
import { z } from "zod";
import { BRANCHES, YEARS } from "@/lib/config";

export const ProfileSchema = z.object({
  name: z.string().trim().min(2).max(80),
  rollNo: z.string().trim().min(1).max(20).regex(/^[A-Za-z0-9\-_/]+$/, "Roll number may only contain letters, digits, - _ /"),
  year: z.enum(YEARS),
  branch: z.enum(BRANCHES),
});
export type Profile = z.infer<typeof ProfileSchema>;
```
`src/lib/server/http.ts`:
```ts
import { ZodError } from "zod";
import { QuizError } from "@/lib/quiz/service";

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const QUIZ_STATUS: Record<QuizError["code"], number> = {
  WINDOW_NOT_OPEN: 403,
  WINDOW_CLOSED: 403,
  NO_ATTEMPT: 404,
  NOT_IN_PROGRESS: 409,
  BAD_INPUT: 400,
};

export function errorResponse(e: unknown): Response {
  if (e instanceof HttpError) return Response.json({ error: e.message }, { status: e.status });
  if (e instanceof QuizError) return Response.json({ error: e.message, code: e.code }, { status: QUIZ_STATUS[e.code] });
  if (e instanceof ZodError) {
    return Response.json({ error: "Invalid input", issues: e.issues.map((i) => i.message) }, { status: 400 });
  }
  console.error(e);
  return Response.json({ error: "Something went wrong" }, { status: 500 });
}

export function route(fn: (req: Request) => Promise<unknown>) {
  return async (req: Request): Promise<Response> => {
    try {
      const out = await fn(req);
      return out instanceof Response ? out : Response.json(out);
    } catch (e) {
      return errorResponse(e);
    }
  };
}
```

- [ ] **Step 4: Implement Firebase wiring and repo (thin adapters, no unit tests)**

`src/lib/firebase/admin.ts`:
```ts
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

function app() {
  const existing = getApps()[0];
  if (existing) return existing;
  return initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  });
}

export const adminAuth = () => getAuth(app());
export const adminDb = () => getFirestore(app());
export const adminBucket = () => getStorage(app()).bucket();
```
`src/lib/firebase/client.ts`:
```ts
import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getStorage } from "firebase/storage";

const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const app = () => (getApps().length ? getApp() : initializeApp(config));
export const auth = () => getAuth(app());
export const storage = () => getStorage(app());
```
`src/lib/server/auth.ts`:
```ts
import { adminAuth } from "@/lib/firebase/admin";
import { isAdminEmail } from "@/lib/config";
import { HttpError } from "./http";

export interface SessionUser {
  uid: string;
  email: string;
  name: string;
}

export async function requireUser(req: Request): Promise<SessionUser> {
  const header = req.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) throw new HttpError(401, "Sign in required");
  let token;
  try {
    token = await adminAuth().verifyIdToken(header.slice(7));
  } catch {
    throw new HttpError(401, "Your session is invalid. Please sign in again.");
  }
  if (!token.email || !token.email_verified) throw new HttpError(401, "A verified Google email is required");
  return { uid: token.uid, email: token.email.toLowerCase(), name: (token.name as string | undefined) ?? "" };
}

export async function requireAdmin(req: Request): Promise<SessionUser> {
  const user = await requireUser(req);
  if (!isAdminEmail(user.email)) throw new HttpError(403, "Admins only");
  return user;
}
```
`src/lib/server/repo.ts`:
```ts
import { adminDb } from "@/lib/firebase/admin";
import { AlreadyExistsError, type AttemptRecord, type AttemptStore } from "@/lib/quiz/service";
import type { Profile } from "@/lib/profile";

export interface UserDoc extends Profile {
  uid: string;
  email: string;
  createdAt: number;
}
export interface PosterDoc {
  path: string;
  fileType: string;
  size: number;
  uploadedAt: number;
}

const col = (name: string) => adminDb().collection(name);

export class FirestoreAttemptStore implements AttemptStore {
  async get(uid: string) {
    const s = await col("attempts").doc(uid).get();
    return s.exists ? (s.data() as AttemptRecord) : null;
  }
  async create(uid: string, a: AttemptRecord) {
    try {
      await col("attempts").doc(uid).create(a);
    } catch (e) {
      const err = e as { code?: number | string; message?: string };
      if (err.code === 6 || err.code === "already-exists" || /ALREADY_EXISTS/.test(err.message ?? "")) {
        throw new AlreadyExistsError();
      }
      throw e;
    }
  }
  async update(uid: string, patch: Partial<AttemptRecord>) {
    await col("attempts").doc(uid).update(patch);
  }
  async setAnswer(uid: string, index: number, choice: number) {
    await col("attempts").doc(uid).update({ [`answers.${index}`]: choice });
  }
}

export async function getUser(uid: string): Promise<UserDoc | null> {
  const s = await col("users").doc(uid).get();
  return s.exists ? (s.data() as UserDoc) : null;
}

export async function saveUser(u: Omit<UserDoc, "createdAt">): Promise<void> {
  const ref = col("users").doc(u.uid);
  const existing = await ref.get();
  await ref.set({ ...u, createdAt: existing.exists ? (existing.data() as UserDoc).createdAt : Date.now() });
}

export async function getPosterRecord(uid: string): Promise<PosterDoc | null> {
  const s = await col("posters").doc(uid).get();
  return s.exists ? (s.data() as PosterDoc) : null;
}

export async function setPosterRecord(uid: string, r: PosterDoc): Promise<void> {
  await col("posters").doc(uid).set(r);
}

export async function listUsers(): Promise<UserDoc[]> {
  return (await col("users").get()).docs.map((d) => d.data() as UserDoc);
}

export async function listAttemptSummaries(): Promise<Map<string, { status: string; score: number | null }>> {
  const snap = await col("attempts").select("status", "score").get();
  return new Map(snap.docs.map((d) => [d.id, d.data() as { status: string; score: number | null }]));
}

export async function listPosterRecords(): Promise<Map<string, PosterDoc>> {
  const snap = await col("posters").get();
  return new Map(snap.docs.map((d) => [d.id, d.data() as PosterDoc]));
}
```

- [ ] **Step 5: Run to verify pass**

Run: `npx vitest run && npm run typecheck`
Expected: PASS, typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: firebase wiring, auth guard, profile schema, http helpers"
```

---

### Task 7: Poster confirmation service, security rules, rules tests

**Files:**
- Create: `src/lib/poster/service.ts`, `firestore.rules`, `storage.rules`, `firebase.json`, `vitest.rules.config.ts`, `rules/rules.test.ts`
- Modify: `src/lib/server/http.ts` (map `PosterError`)
- Test: `src/lib/poster/service.test.ts`, `rules/rules.test.ts`

**Interfaces:**
- Consumes: `POSTER`, `windowState`.
- Produces:
```ts
interface PosterRecord { path: string; fileType: string; size: number; uploadedAt: number }
interface PosterStore { head(path): Promise<{contentType:string; size:number}|null>; remove(path): Promise<void>; get(uid): Promise<PosterRecord|null>; set(uid, r: PosterRecord): Promise<void> }
class PosterError extends Error { code: "WINDOW_NOT_OPEN"|"WINDOW_CLOSED"|"BAD_PATH"|"NOT_FOUND"|"BAD_TYPE"|"TOO_LARGE" }
interface PosterDeps { store: PosterStore; now: () => number; window: {openAt:number; closeAt:number} }
confirmPoster(uid, path, deps): Promise<PosterRecord>
```

- [ ] **Step 1: Write failing tests**

`src/lib/poster/service.test.ts`:
```ts
import { beforeEach, describe, expect, it } from "vitest";
import { confirmPoster, PosterError, type PosterDeps, type PosterRecord } from "@/lib/poster/service";

const OPEN = Date.parse("2026-10-07T18:30:00Z");
const CLOSE = Date.parse("2026-10-09T18:30:00Z");

let files: Map<string, { contentType: string; size: number }>;
let records: Map<string, PosterRecord>;
let removed: string[];
let clock: number;
let deps: PosterDeps;

beforeEach(() => {
  files = new Map();
  records = new Map();
  removed = [];
  clock = OPEN + 5000;
  deps = {
    now: () => clock,
    window: { openAt: OPEN, closeAt: CLOSE },
    store: {
      head: async (p) => files.get(p) ?? null,
      remove: async (p) => {
        removed.push(p);
        files.delete(p);
      },
      get: async (uid) => records.get(uid) ?? null,
      set: async (uid, r) => void records.set(uid, r),
    },
  };
});

const code = (p: Promise<unknown>) => p.then(() => null, (e: PosterError) => e.code);
const put = (path: string, contentType = "image/png", size = 1000) => files.set(path, { contentType, size });

describe("confirmPoster", () => {
  it("records a valid upload", async () => {
    put("posters/u1/1-a.png");
    const r = await confirmPoster("u1", "posters/u1/1-a.png", deps);
    expect(r).toMatchObject({ path: "posters/u1/1-a.png", fileType: "image/png", size: 1000, uploadedAt: clock });
    expect(records.get("u1")).toEqual(r);
  });
  it("replacing deletes the previous file", async () => {
    put("posters/u1/1-a.png");
    put("posters/u1/2-b.pdf", "application/pdf");
    await confirmPoster("u1", "posters/u1/1-a.png", deps);
    await confirmPoster("u1", "posters/u1/2-b.pdf", deps);
    expect(removed).toEqual(["posters/u1/1-a.png"]);
    expect(records.get("u1")?.path).toBe("posters/u1/2-b.pdf");
  });
  it("rejects another student's path without touching storage", async () => {
    put("posters/u2/1-a.png");
    expect(await code(confirmPoster("u1", "posters/u2/1-a.png", deps))).toBe("BAD_PATH");
    expect(removed).toEqual([]);
  });
  it("rejects traversal and nested paths", async () => {
    expect(await code(confirmPoster("u1", "posters/u1/../u2/x.png", deps))).toBe("BAD_PATH");
    expect(await code(confirmPoster("u1", "posters/u1/a/b.png", deps))).toBe("BAD_PATH");
    expect(await code(confirmPoster("u1", "posters/u1/..", deps))).toBe("BAD_PATH");
  });
  it("rejects a file that was never uploaded", async () => {
    expect(await code(confirmPoster("u1", "posters/u1/ghost.png", deps))).toBe("NOT_FOUND");
  });
  it("rejects and deletes a wrong content type", async () => {
    put("posters/u1/x.png", "text/plain");
    expect(await code(confirmPoster("u1", "posters/u1/x.png", deps))).toBe("BAD_TYPE");
    expect(removed).toEqual(["posters/u1/x.png"]);
    expect(records.has("u1")).toBe(false);
  });
  it("rejects and deletes an oversize file", async () => {
    put("posters/u1/x.pdf", "application/pdf", 10 * 1024 * 1024 + 1);
    expect(await code(confirmPoster("u1", "posters/u1/x.pdf", deps))).toBe("TOO_LARGE");
    expect(removed).toEqual(["posters/u1/x.pdf"]);
  });
  it("accepts exactly 10 MB", async () => {
    put("posters/u1/x.pdf", "application/pdf", 10 * 1024 * 1024);
    await expect(confirmPoster("u1", "posters/u1/x.pdf", deps)).resolves.toBeTruthy();
  });
  it("rejects before the window opens and deletes the file", async () => {
    clock = OPEN - 1;
    put("posters/u1/x.png");
    expect(await code(confirmPoster("u1", "posters/u1/x.png", deps))).toBe("WINDOW_NOT_OPEN");
    expect(removed).toEqual(["posters/u1/x.png"]);
  });
  it("rejects after the window closes, keeping the earlier poster", async () => {
    put("posters/u1/1-a.png");
    await confirmPoster("u1", "posters/u1/1-a.png", deps);
    clock = CLOSE;
    put("posters/u1/2-b.png");
    expect(await code(confirmPoster("u1", "posters/u1/2-b.png", deps))).toBe("WINDOW_CLOSED");
    expect(records.get("u1")?.path).toBe("posters/u1/1-a.png");
    expect(removed).toEqual(["posters/u1/2-b.png"]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/poster`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement the service**

`src/lib/poster/service.ts`:
```ts
import { POSTER } from "@/lib/config";
import { windowState } from "@/lib/window";

export interface PosterRecord {
  path: string;
  fileType: string;
  size: number;
  uploadedAt: number;
}

export interface PosterStore {
  head(path: string): Promise<{ contentType: string; size: number } | null>;
  remove(path: string): Promise<void>;
  get(uid: string): Promise<PosterRecord | null>;
  set(uid: string, r: PosterRecord): Promise<void>;
}

type PosterCode = "WINDOW_NOT_OPEN" | "WINDOW_CLOSED" | "BAD_PATH" | "NOT_FOUND" | "BAD_TYPE" | "TOO_LARGE";

const MESSAGES: Record<PosterCode, string> = {
  WINDOW_NOT_OPEN: "Poster submissions have not opened yet.",
  WINDOW_CLOSED: "Poster submissions have closed.",
  BAD_PATH: "Invalid upload path.",
  NOT_FOUND: "The uploaded file was not found. Please try again.",
  BAD_TYPE: "Only PDF, JPG or PNG files are allowed.",
  TOO_LARGE: "The file is larger than 10 MB.",
};

export class PosterError extends Error {
  constructor(public code: PosterCode) {
    super(MESSAGES[code]);
  }
}

export interface PosterDeps {
  store: PosterStore;
  now: () => number;
  window: { openAt: number; closeAt: number };
}

function ownPath(uid: string, path: string): boolean {
  const prefix = `posters/${uid}/`;
  if (!path.startsWith(prefix)) return false;
  const name = path.slice(prefix.length);
  return /^[A-Za-z0-9._-]+$/.test(name) && !name.includes("..");
}

export async function confirmPoster(uid: string, path: string, deps: PosterDeps): Promise<PosterRecord> {
  if (!ownPath(uid, path)) throw new PosterError("BAD_PATH");

  const state = windowState(deps.now(), deps.window);
  if (state !== "open") {
    await deps.store.remove(path);
    throw new PosterError(state === "before" ? "WINDOW_NOT_OPEN" : "WINDOW_CLOSED");
  }

  const meta = await deps.store.head(path);
  if (!meta) throw new PosterError("NOT_FOUND");
  if (!(POSTER.allowedTypes as readonly string[]).includes(meta.contentType)) {
    await deps.store.remove(path);
    throw new PosterError("BAD_TYPE");
  }
  if (meta.size > POSTER.maxBytes) {
    await deps.store.remove(path);
    throw new PosterError("TOO_LARGE");
  }

  const previous = await deps.store.get(uid);
  const record: PosterRecord = { path, fileType: meta.contentType, size: meta.size, uploadedAt: deps.now() };
  await deps.store.set(uid, record);
  if (previous && previous.path !== path) await deps.store.remove(previous.path);
  return record;
}
```

- [ ] **Step 4: Map `PosterError` in `src/lib/server/http.ts`**

Add import and mapping:
```ts
import { PosterError } from "@/lib/poster/service";

const POSTER_STATUS: Record<PosterError["code"], number> = {
  WINDOW_NOT_OPEN: 403,
  WINDOW_CLOSED: 403,
  BAD_PATH: 400,
  NOT_FOUND: 404,
  BAD_TYPE: 415,
  TOO_LARGE: 413,
};
```
and inside `errorResponse`, before the `ZodError` branch:
```ts
  if (e instanceof PosterError) return Response.json({ error: e.message, code: e.code }, { status: POSTER_STATUS[e.code] });
```

- [ ] **Step 5: Add Storage adapter to `src/lib/server/repo.ts`**

Append:
```ts
import { adminBucket } from "@/lib/firebase/admin";
import type { PosterStore } from "@/lib/poster/service";

export class FirebasePosterStore implements PosterStore {
  async head(path: string) {
    try {
      const [meta] = await adminBucket().file(path).getMetadata();
      return { contentType: String(meta.contentType ?? ""), size: Number(meta.size ?? 0) };
    } catch (e) {
      if ((e as { code?: number }).code === 404) return null;
      throw e;
    }
  }
  async remove(path: string) {
    await adminBucket().file(path).delete({ ignoreNotFound: true });
  }
  get = getPosterRecord;
  set = setPosterRecord;
}

export async function signedReadUrl(path: string, ttlMs = 60 * 60 * 1000): Promise<string> {
  const [url] = await adminBucket().file(path).getSignedUrl({ action: "read", expires: Date.now() + ttlMs });
  return url;
}
```

- [ ] **Step 6: Write security rules and config**

`firestore.rules`:
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // All reads/writes go through server routes using the Admin SDK.
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```
`storage.rules`:
```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    // Students may create (never overwrite, read or delete) files under their own folder.
    // The event window is enforced server-side when the upload is confirmed.
    match /posters/{uid}/{file} {
      allow create: if request.auth != null
        && request.auth.uid == uid
        && request.resource.size <= 10 * 1024 * 1024
        && request.resource.contentType in ['application/pdf', 'image/jpeg', 'image/png'];
      allow read, update, delete: if false;
    }
    match /{allPaths=**} {
      allow read, write: if false;
    }
  }
}
```
`firebase.json`:
```json
{
  "firestore": { "rules": "firestore.rules" },
  "storage": { "rules": "storage.rules" },
  "emulators": {
    "firestore": { "port": 8080 },
    "storage": { "port": 9199 },
    "ui": { "enabled": false }
  }
}
```
`vitest.rules.config.ts`:
```ts
import { defineConfig } from "vitest/config";

export default defineConfig({ test: { environment: "node", include: ["rules/**/*.test.ts"], testTimeout: 30000 } });
```
`rules/rules.test.ts`:
```ts
import { afterAll, beforeAll, describe, it } from "vitest";
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { getBytes, ref, uploadBytes } from "firebase/storage";
import { readFileSync } from "node:fs";

let env: RulesTestEnvironment;
const bytes = (n: number) => new Uint8Array(n);

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-udaan",
    firestore: { rules: readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8080 },
    storage: { rules: readFileSync("storage.rules", "utf8"), host: "127.0.0.1", port: 9199 },
  });
});
afterAll(() => env.cleanup());

describe("storage rules", () => {
  it("owner can create an allowed file", async () => {
    const s = env.authenticatedContext("alice").storage();
    await assertSucceeds(uploadBytes(ref(s, "posters/alice/1-a.png"), bytes(100), { contentType: "image/png" }));
    await assertSucceeds(uploadBytes(ref(s, "posters/alice/1-b.pdf"), bytes(100), { contentType: "application/pdf" }));
  });
  it("owner cannot overwrite an existing file", async () => {
    const s = env.authenticatedContext("alice").storage();
    await uploadBytes(ref(s, "posters/alice/once.png"), bytes(10), { contentType: "image/png" });
    await assertFails(uploadBytes(ref(s, "posters/alice/once.png"), bytes(10), { contentType: "image/png" }));
  });
  it("another user cannot write into alice's folder", async () => {
    const s = env.authenticatedContext("bob").storage();
    await assertFails(uploadBytes(ref(s, "posters/alice/2-a.png"), bytes(10), { contentType: "image/png" }));
  });
  it("anonymous users cannot upload", async () => {
    const s = env.unauthenticatedContext().storage();
    await assertFails(uploadBytes(ref(s, "posters/alice/3-a.png"), bytes(10), { contentType: "image/png" }));
  });
  it("rejects non-poster content types", async () => {
    const s = env.authenticatedContext("alice").storage();
    await assertFails(uploadBytes(ref(s, "posters/alice/4-a.txt"), bytes(10), { contentType: "text/plain" }));
    await assertFails(uploadBytes(ref(s, "posters/alice/4-b.exe"), bytes(10), { contentType: "application/octet-stream" }));
  });
  it("rejects files over 10 MB", async () => {
    const s = env.authenticatedContext("alice").storage();
    await assertFails(uploadBytes(ref(s, "posters/alice/5-a.png"), bytes(10 * 1024 * 1024 + 1), { contentType: "image/png" }));
  });
  it("nobody can read posters from the client", async () => {
    const s = env.authenticatedContext("alice").storage();
    await assertFails(getBytes(ref(s, "posters/alice/1-a.png")));
  });
  it("paths outside posters/ are closed", async () => {
    const s = env.authenticatedContext("alice").storage();
    await assertFails(uploadBytes(ref(s, "other/alice.png"), bytes(10), { contentType: "image/png" }));
  });
});

describe("firestore rules", () => {
  it("clients can neither read nor write", async () => {
    const db = env.authenticatedContext("alice").firestore();
    await assertFails(getDoc(doc(db, "users/alice")));
    await assertFails(setDoc(doc(db, "users/alice"), { name: "x" }));
    await assertFails(getDoc(doc(db, "attempts/alice")));
  });
});
```

- [ ] **Step 7: Run to verify pass**

Run: `npx vitest run && npm run typecheck`
Expected: unit tests PASS.

Run (needs Java 11+ for the emulators): `npm run test:rules`
Expected: all rules tests PASS. If Java is unavailable, note it and run this step on a machine that has it before deploying.

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "feat: poster confirmation service and security rules"
```

---

### Task 8: API routes

**Files:**
- Create: `src/lib/server/deps.ts`, `src/app/api/me/route.ts`, `src/app/api/profile/route.ts`, `src/app/api/quiz/start/route.ts`, `src/app/api/quiz/attempt/route.ts`, `src/app/api/quiz/answer/route.ts`, `src/app/api/quiz/submit/route.ts`, `src/app/api/poster/route.ts`, `src/app/api/poster/confirm/route.ts`

**Interfaces:**
- Consumes: everything from Tasks 2-7.
- Produces (JSON over HTTP, `Authorization: Bearer <Firebase ID token>`):
  - `GET /api/me` → `Me`: `{ email, name, isAdmin, profile: Profile|null, window: {state, openAt, closeAt}, serverNow, attempt: {status, score}|null, poster: {uploadedAt, fileType}|null }`
  - `POST /api/profile` body `Profile` → `{ok:true}` (409 once an attempt exists)
  - `POST /api/quiz/start` → `AttemptView`; `GET /api/quiz/attempt` → `AttemptView` (404 if none); `POST /api/quiz/answer` body `{index, choice}` → `{ok:true}`; `POST /api/quiz/submit` → `AttemptView`
  - `GET /api/poster` → `{ poster: {uploadedAt, fileType, url}|null }`; `POST /api/poster/confirm` body `{path}` → `{ok:true, uploadedAt, fileType}`

- [ ] **Step 1: Server dependency builders**

`src/lib/server/deps.ts`:
```ts
import { getWindow } from "@/lib/config";
import { FALLBACK_BANK } from "@/lib/quiz/fallback-bank";
import { geminiCallModel } from "@/lib/quiz/gemini";
import { generateQuestions } from "@/lib/quiz/generate";
import type { QuizDeps } from "@/lib/quiz/service";
import type { PosterDeps } from "@/lib/poster/service";
import { FirebasePosterStore, FirestoreAttemptStore } from "./repo";

export function quizDeps(): QuizDeps {
  const callModel = geminiCallModel(process.env.GEMINI_API_KEY ?? "", process.env.GEMINI_MODEL ?? "gemini-2.5-flash");
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
```

- [ ] **Step 2: Routes**

`src/app/api/me/route.ts`:
```ts
import { getWindow, isAdminEmail } from "@/lib/config";
import { windowState } from "@/lib/window";
import { route } from "@/lib/server/http";
import { requireUser } from "@/lib/server/auth";
import { FirestoreAttemptStore, getPosterRecord, getUser } from "@/lib/server/repo";

export const dynamic = "force-dynamic";

export const GET = route(async (req) => {
  const u = await requireUser(req);
  const [profile, attempt, poster] = await Promise.all([
    getUser(u.uid),
    new FirestoreAttemptStore().get(u.uid),
    getPosterRecord(u.uid),
  ]);
  const w = getWindow();
  const now = Date.now();
  return {
    email: u.email,
    name: u.name,
    isAdmin: isAdminEmail(u.email),
    profile: profile ? { name: profile.name, rollNo: profile.rollNo, year: profile.year, branch: profile.branch } : null,
    window: { state: windowState(now, w), ...w },
    serverNow: now,
    attempt: attempt ? { status: attempt.status, score: attempt.status === "submitted" ? attempt.score : null } : null,
    poster: poster ? { uploadedAt: poster.uploadedAt, fileType: poster.fileType } : null,
  };
});
```
`src/app/api/profile/route.ts`:
```ts
import { ProfileSchema } from "@/lib/profile";
import { HttpError, route } from "@/lib/server/http";
import { requireUser } from "@/lib/server/auth";
import { FirestoreAttemptStore, saveUser } from "@/lib/server/repo";

export const POST = route(async (req) => {
  const u = await requireUser(req);
  const input = ProfileSchema.parse(await req.json());
  if (await new FirestoreAttemptStore().get(u.uid)) {
    throw new HttpError(409, "Your profile is locked once the quiz has started.");
  }
  await saveUser({ uid: u.uid, email: u.email, ...input });
  return { ok: true };
});
```
`src/app/api/quiz/start/route.ts`:
```ts
import { HttpError, route } from "@/lib/server/http";
import { requireUser } from "@/lib/server/auth";
import { getUser } from "@/lib/server/repo";
import { quizDeps } from "@/lib/server/deps";
import { startAttempt } from "@/lib/quiz/service";

export const maxDuration = 60;

export const POST = route(async (req) => {
  const u = await requireUser(req);
  if (!(await getUser(u.uid))) throw new HttpError(403, "Complete your profile first.");
  return startAttempt(u.uid, quizDeps());
});
```
`src/app/api/quiz/attempt/route.ts`:
```ts
import { HttpError, route } from "@/lib/server/http";
import { requireUser } from "@/lib/server/auth";
import { quizDeps } from "@/lib/server/deps";
import { getAttemptView } from "@/lib/quiz/service";

export const dynamic = "force-dynamic";

export const GET = route(async (req) => {
  const u = await requireUser(req);
  const view = await getAttemptView(u.uid, quizDeps());
  if (!view) throw new HttpError(404, "You have not started the quiz.");
  return view;
});
```
`src/app/api/quiz/answer/route.ts`:
```ts
import { z } from "zod";
import { route } from "@/lib/server/http";
import { requireUser } from "@/lib/server/auth";
import { quizDeps } from "@/lib/server/deps";
import { saveAnswer } from "@/lib/quiz/service";

const Body = z.object({ index: z.number(), choice: z.number() });

export const POST = route(async (req) => {
  const u = await requireUser(req);
  const { index, choice } = Body.parse(await req.json());
  await saveAnswer(u.uid, index, choice, quizDeps());
  return { ok: true };
});
```
`src/app/api/quiz/submit/route.ts`:
```ts
import { route } from "@/lib/server/http";
import { requireUser } from "@/lib/server/auth";
import { quizDeps } from "@/lib/server/deps";
import { submitAttempt } from "@/lib/quiz/service";

export const POST = route(async (req) => submitAttempt((await requireUser(req)).uid, quizDeps()));
```
`src/app/api/poster/route.ts`:
```ts
import { route } from "@/lib/server/http";
import { requireUser } from "@/lib/server/auth";
import { getPosterRecord, signedReadUrl } from "@/lib/server/repo";

export const dynamic = "force-dynamic";

export const GET = route(async (req) => {
  const u = await requireUser(req);
  const p = await getPosterRecord(u.uid);
  if (!p) return { poster: null };
  return { poster: { uploadedAt: p.uploadedAt, fileType: p.fileType, url: await signedReadUrl(p.path, 15 * 60 * 1000) } };
});
```
`src/app/api/poster/confirm/route.ts`:
```ts
import { z } from "zod";
import { HttpError, route } from "@/lib/server/http";
import { requireUser } from "@/lib/server/auth";
import { getUser } from "@/lib/server/repo";
import { posterDeps } from "@/lib/server/deps";
import { confirmPoster } from "@/lib/poster/service";

const Body = z.object({ path: z.string().min(1).max(300) });

export const POST = route(async (req) => {
  const u = await requireUser(req);
  if (!(await getUser(u.uid))) throw new HttpError(403, "Complete your profile first.");
  const { path } = Body.parse(await req.json());
  const r = await confirmPoster(u.uid, path, posterDeps());
  return { ok: true, uploadedAt: r.uploadedAt, fileType: r.fileType };
});
```

- [ ] **Step 3: Verify**

Run: `npm run typecheck && npm test && npm run build`
Expected: all green. (Routes need Firebase env only at request time, so `build` does not require secrets.)

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: API routes for profile, quiz and poster"
```

---

### Task 9: Poster-style design system, auth provider, landing page

Visual reference: `poster.jpeg` in the project root (NSS event poster). Recreate its look in CSS/SVG; do not embed the image.

**Files:**
- Modify: `src/app/globals.css`, `src/app/layout.tsx`, `src/app/page.tsx`
- Create: `src/components/ui.tsx`, `src/components/art.tsx`, `src/components/logo.tsx`, `src/components/site-header.tsx`, `src/components/site-footer.tsx`, `src/components/auth-provider.tsx`, `src/lib/client/api.ts`, `src/lib/client/use-me.ts`

**Interfaces:**
- Produces:
  - `ui.tsx`: `Card({children, className, tone, tilt})`, `Stage({children, className})` (blue grid panel), `Label`, `Tag({tone, tilt, className, children})`, `Button({variant: "primary"|"ghost"|"danger", ...buttonProps})`, `Field({label, hint, children})`, `inputClass`, `type Tone = "paper"|"white"|"sun"|"pink"|"green"|"blue"|"red"`.
  - `art.tsx`: `Sparkle`, `Cloud({className, fill})`, `Jet({className})`, `Badge({className})` (tricolour badge), `Starburst({children, className, fill})`, `Contrail({className, stroke})`. All take `className` for sizing and are decorative (`aria-hidden`).
  - `logo.tsx`: `NssLogo({className})` (placeholder until the real logo file is supplied).
  - `auth-provider.tsx`: `AuthProvider`, `useAuth(): {user: User|null; loading: boolean; signIn(): Promise<void>; signOut(): Promise<void>; getToken(): Promise<string>}`.
  - `api.ts`: `api<T>(path, {method?, body?, token}): Promise<T>`; `class ApiError extends Error {status:number; code?:string}`.
  - `use-me.ts`: `type Me`, `useRequireMe(needProfile: boolean): {me: Me|null; call: <T>(path:string, opts?:{method?:string; body?:unknown}) => Promise<T>; refresh(): Promise<void>; user: User|null}`; redirects to `/` if signed out and to `/register` if `needProfile` and no profile.

- [ ] **Step 1: Theme tokens, paper texture and sticker utilities**

`src/app/globals.css`:
```css
@import "tailwindcss";

@theme {
  --color-paper: #efece4;
  --color-paper-deep: #e2ddd0;
  --color-ink: #1b1b1f;
  --color-blue: #2f5fd0;
  --color-blue-deep: #2349a6;
  --color-sun: #f4b81c;
  --color-signal: #c8141e;
  --color-bubble: #f27fb5;
  --color-leaf: #3f8f2f;
  --color-saffron: #ff9933;
  --color-flag-green: #138808;
  --font-display: var(--font-chango), "Arial Black", sans-serif;
  --font-sans: var(--font-fredoka), system-ui, sans-serif;
}

html { background: var(--color-paper); }
body {
  min-height: 100dvh;
  background: var(--color-paper);
  color: var(--color-ink);
  font-family: var(--font-sans);
  -webkit-font-smoothing: antialiased;
}

/* Paper grain, like the printed poster. */
body::before {
  content: "";
  position: fixed;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  opacity: 0.55;
  mix-blend-mode: multiply;
  background-image: url("data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 .45 0 0 0 0 .42 0 0 0 0 .36 0 0 0 .35 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
}

/* The blue gridded panel from the poster. */
.grid-panel {
  background-color: var(--color-blue);
  background-image:
    linear-gradient(rgba(255, 255, 255, 0.16) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.16) 1px, transparent 1px);
  background-size: 44px 44px;
  border: 3px solid var(--color-ink);
  box-shadow: 6px 6px 0 var(--color-ink);
}

/* Sticker card: dark outline, hard offset shadow. */
.sticker {
  border: 3px solid var(--color-ink);
  border-radius: 18px;
  box-shadow: 5px 5px 0 var(--color-ink);
}

/* Chunky outlined bubble lettering. Set the fill with a text-* colour class. */
.bubble {
  font-family: var(--font-display);
  line-height: 0.95;
  letter-spacing: 0.02em;
  paint-order: stroke fill;
  -webkit-text-stroke: 0.16em var(--color-ink);
  text-shadow: 0.05em 0.07em 0 var(--color-ink);
}

@keyframes fade-up {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: none; }
}
.fade-up { animation: fade-up 0.5s ease-out both; }

@keyframes tick-pulse {
  50% { transform: scale(1.06); }
}
.pulse { animation: tick-pulse 1s ease-in-out infinite; }

@media (prefers-reduced-motion: reduce) {
  .fade-up, .pulse { animation: none; }
}
```
`src/app/layout.tsx`:
```tsx
import type { Metadata, Viewport } from "next";
import { Chango, Fredoka } from "next/font/google";
import { AuthProvider } from "@/components/auth-provider";
import { SiteFooter } from "@/components/site-footer";
import "./globals.css";

const display = Chango({ subsets: ["latin"], weight: "400", variable: "--font-chango" });
const sans = Fredoka({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-fredoka" });

export const metadata: Metadata = {
  title: "Udaan | Air Force Day by NSS",
  description: "Quiz and poster competitions for Air Force Day, 8-9 October.",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#efece4" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable}`}>
      <body>
        <AuthProvider>{children}</AuthProvider>
        <SiteFooter />
      </body>
    </html>
  );
}
```

- [ ] **Step 2: UI primitives**

`src/components/ui.tsx`:
```tsx
import type { ButtonHTMLAttributes, ReactNode } from "react";

const TONES = {
  paper: "bg-paper",
  white: "bg-white",
  sun: "bg-sun",
  pink: "bg-bubble",
  green: "bg-leaf text-white",
  blue: "bg-blue text-white",
  red: "bg-signal text-white",
};
export type Tone = keyof typeof TONES;

export function Card({ children, className = "", tone = "white", tilt = 0 }: { children: ReactNode; className?: string; tone?: Tone; tilt?: number }) {
  return (
    <div style={tilt ? { transform: `rotate(${tilt}deg)` } : undefined} className={`sticker ${TONES[tone]} ${className}`}>
      {children}
    </div>
  );
}

export function Stage({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`grid-panel ${className}`}>{children}</div>;
}

export function Label({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <p className={`text-xs font-semibold uppercase tracking-[0.18em] opacity-75 ${className}`}>{children}</p>;
}

export function Tag({ children, tone = "sun", tilt = 0, className = "" }: { children: ReactNode; tone?: Tone; tilt?: number; className?: string }) {
  return (
    <span
      style={tilt ? { transform: `rotate(${tilt}deg)` } : undefined}
      className={`inline-block rounded-full border-[3px] border-ink px-3 py-1 text-sm font-semibold shadow-[3px_3px_0_var(--color-ink)] ${TONES[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

const variants = {
  primary: "bg-sun text-ink",
  ghost: "bg-white text-ink",
  danger: "bg-signal text-white",
};

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof variants }) {
  return (
    <button
      {...props}
      className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border-[3px] border-ink px-6 text-lg font-semibold shadow-[4px_4px_0_var(--color-ink)] transition-transform hover:-translate-y-0.5 active:translate-x-[3px] active:translate-y-[3px] active:shadow-none disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 ${variants[variant]} ${className}`}
    />
  );
}

export const inputClass =
  "min-h-12 w-full rounded-xl border-[3px] border-ink bg-white px-4 text-base text-ink outline-none placeholder:text-ink/40 focus:bg-sun/20 focus:shadow-[4px_4px_0_var(--color-ink)]";

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block space-y-2">
      <Label>{label}</Label>
      {children}
      {hint && <span className="block text-sm opacity-75">{hint}</span>}
    </label>
  );
}
```
`src/components/art.tsx`:
```tsx
const INK = "#1b1b1f";

export function Sparkle({ className = "", fill = "#f4b81c" }: { className?: string; fill?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path d="M12 1 C13 8 16 11 23 12 C16 13 13 16 12 23 C11 16 8 13 1 12 C8 11 11 8 12 1Z" fill={fill} stroke={INK} strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

export function Cloud({ className = "", fill = "#fff" }: { className?: string; fill?: string }) {
  return (
    <svg viewBox="0 0 120 70" className={className} aria-hidden>
      <path
        d="M24 62 C8 62 4 40 22 36 C20 18 44 10 54 24 C62 8 90 12 90 32 C112 30 118 62 96 62 Z"
        fill={fill}
        stroke={INK}
        strokeWidth="4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Cartoon top-view fighter, yellow with a dark outline like the poster's hand. Points up. */
export function Jet({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 140" className={className} aria-hidden>
      <g fill="#f4b81c" stroke={INK} strokeWidth="5" strokeLinejoin="round">
        <path d="M52 58 L6 104 L6 114 L52 100Z" />
        <path d="M68 58 L114 104 L114 114 L68 100Z" />
        <path d="M54 104 L30 128 L30 134 L56 122Z" />
        <path d="M66 104 L90 128 L90 134 L64 122Z" />
        <path d="M60 4 C66 20 68 40 68 62 L68 108 L60 128 L52 108 L52 62 C52 40 54 20 60 4Z" />
      </g>
      <ellipse cx="60" cy="36" rx="5.5" ry="11" fill="#2f5fd0" stroke={INK} strokeWidth="3" />
    </svg>
  );
}

/** Tricolour badge (saffron, white, green) with a simple wheel ring. */
export function Badge({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <defs>
        <clipPath id="badge-clip">
          <circle cx="32" cy="32" r="28" />
        </clipPath>
      </defs>
      <g clipPath="url(#badge-clip)">
        <rect y="0" width="64" height="22" fill="#ff9933" />
        <rect y="22" width="64" height="20" fill="#fff" />
        <rect y="42" width="64" height="22" fill="#138808" />
      </g>
      <circle cx="32" cy="32" r="28" fill="none" stroke={INK} strokeWidth="4" />
      <circle cx="32" cy="32" r="7" fill="none" stroke="#2349a6" strokeWidth="2.5" />
    </svg>
  );
}

function burst(n: number, outer: number, inner: number): string {
  return Array.from({ length: n * 2 }, (_, i) => {
    const r = i % 2 ? inner : outer;
    const a = (Math.PI * i) / n - Math.PI / 2;
    return `${(50 + r * Math.cos(a)).toFixed(1)},${(50 + r * Math.sin(a)).toFixed(1)}`;
  }).join(" ");
}

export function Starburst({ children, className = "", fill = "#f4b81c" }: { children?: React.ReactNode; className?: string; fill?: string }) {
  return (
    <div className={`relative grid place-items-center ${className}`}>
      <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden>
        <polygon points={burst(14, 48, 36)} fill={fill} stroke={INK} strokeWidth="3" strokeLinejoin="round" />
      </svg>
      <span className="relative text-center">{children}</span>
    </div>
  );
}

/** Dotted flight path. */
export function Contrail({ className = "", stroke = "#ffffff" }: { className?: string; stroke?: string }) {
  return (
    <svg viewBox="0 0 320 120" className={className} aria-hidden fill="none" stroke={stroke} strokeWidth="5" strokeLinecap="round" strokeDasharray="1 14">
      <path d="M4 110 C80 110 90 20 170 40 S260 100 316 14" />
    </svg>
  );
}
```
`src/components/logo.tsx`:
```tsx
// Placeholder until the NSS logo file is supplied. To swap in the real logo, put it in
// `public/nss-logo.png` and replace the span below with
// <Image src="/nss-logo.png" alt="NSS" width={48} height={48} className={className} />.
export function NssLogo({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-grid place-items-center rounded-lg border-[3px] border-ink bg-bubble px-3 py-1 font-display text-lg text-signal shadow-[3px_3px_0_var(--color-ink)] ${className}`}
    >
      NSS
    </span>
  );
}
```
`src/components/site-footer.tsx`:
```tsx
import { Sparkle } from "./art";

export function SiteFooter() {
  return (
    <footer className="mx-auto flex max-w-5xl items-center justify-center gap-2 px-4 pb-10 pt-4 text-center text-sm font-semibold">
      <Sparkle className="h-4 w-4" />
      <span>NSS · 2026 · On the occasion of Air Force Day</span>
      <Sparkle className="h-4 w-4" />
    </footer>
  );
}
```

- [ ] **Step 3: Auth provider, API client, `useRequireMe`**

`src/components/auth-provider.tsx`:
```tsx
"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signInWithRedirect, signOut as fbSignOut, type User } from "firebase/auth";
import { auth } from "@/lib/firebase/client";

interface AuthCtx {
  user: User | null;
  loading: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  getToken: () => Promise<string>;
}
const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(
    () =>
      onAuthStateChanged(auth(), (u) => {
        setUser(u);
        setLoading(false);
      }),
    [],
  );

  const signIn = useCallback(async () => {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    try {
      await signInWithPopup(auth(), provider);
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code === "auth/popup-blocked" || code === "auth/operation-not-supported-in-this-environment") {
        await signInWithRedirect(auth(), provider);
      } else if (code !== "auth/popup-closed-by-user" && code !== "auth/cancelled-popup-request") {
        throw e;
      }
    }
  }, []);

  const signOut = useCallback(() => fbSignOut(auth()), []);
  const getToken = useCallback(async () => {
    if (!user) throw new Error("Not signed in");
    return user.getIdToken();
  }, [user]);

  const value = useMemo(() => ({ user, loading, signIn, signOut, getToken }), [user, loading, signIn, signOut, getToken]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth outside AuthProvider");
  return v;
}
```
`src/lib/client/api.ts`:
```ts
export class ApiError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
  }
}

export async function api<T>(
  path: string,
  { method = "GET", body, token }: { method?: string; body?: unknown; token: string },
): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error ?? "Request failed", data.code);
  return data as T;
}
```
`src/lib/client/use-me.ts`:
```ts
"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import type { Profile } from "@/lib/profile";
import type { WindowState } from "@/lib/window";
import { api } from "./api";

export interface Me {
  email: string;
  name: string;
  isAdmin: boolean;
  profile: Profile | null;
  window: { state: WindowState; openAt: number; closeAt: number };
  serverNow: number;
  attempt: { status: "in_progress" | "submitted"; score: number | null } | null;
  poster: { uploadedAt: number; fileType: string } | null;
}

export function useRequireMe(needProfile: boolean) {
  const { user, loading, getToken } = useAuth();
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);

  const call = useCallback(
    async <T,>(path: string, opts: { method?: string; body?: unknown } = {}) =>
      api<T>(path, { ...opts, token: await getToken() }),
    [getToken],
  );
  const refresh = useCallback(async () => setMe(await call<Me>("/api/me")), [call]);

  useEffect(() => {
    if (loading) return;
    if (!user) return void router.replace("/");
    refresh().catch(() => {});
  }, [loading, user, refresh, router]);

  useEffect(() => {
    if (me && needProfile && !me.profile) router.replace("/register");
  }, [me, needProfile, router]);

  return { me: needProfile && me && !me.profile ? null : me, call, refresh, user };
}
```

- [ ] **Step 4: Header and landing page**

`src/components/site-header.tsx`:
```tsx
"use client";
import Link from "next/link";
import { useAuth } from "./auth-provider";
import { NssLogo } from "./logo";
import { Tag } from "./ui";

export function SiteHeader({ isAdmin = false }: { isAdmin?: boolean }) {
  const { user, signOut } = useAuth();
  return (
    <header className="border-b-[3px] border-ink bg-paper/90 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-2 sm:px-6">
        <Link href={user ? "/dashboard" : "/"} className="bubble text-3xl text-sun" aria-label="Udaan home">
          UDAAN
        </Link>
        <div className="flex items-center gap-3">
          {isAdmin && (
            <Link href="/admin" className="min-h-12 content-center">
              <Tag tone="blue">Admin</Tag>
            </Link>
          )}
          {user && (
            <button onClick={() => signOut()} className="min-h-12 px-1 text-sm font-semibold underline underline-offset-4">
              Sign out
            </button>
          )}
          <NssLogo />
        </div>
      </div>
    </header>
  );
}
```
`src/app/page.tsx`:
```tsx
"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { Badge, Cloud, Contrail, Jet, Sparkle, Starburst } from "@/components/art";
import { SiteHeader } from "@/components/site-header";
import { Button, Card, Label, Tag } from "@/components/ui";

const CARDS = [
  { no: "01", title: "Air Force Quiz", tone: "white" as const, tilt: -1, lines: ["20 questions", "15 minutes", "One attempt only"] },
  { no: "02", title: "Poster Making", tone: "white" as const, tilt: 1, lines: ["PDF, JPG or PNG", "Up to 10 MB", "Replace until 9 Oct"] },
];

export default function Landing() {
  const { user, loading, signIn } = useAuth();
  const router = useRouter();
  const [error, setError] = useState("");

  useEffect(() => {
    if (!loading && user) router.replace("/dashboard");
  }, [loading, user, router]);

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-4 pb-6 pt-6 sm:px-6 sm:pt-10">
        <section className="grid-panel fade-up relative overflow-hidden px-5 pb-10 pt-8 sm:px-10 sm:pb-14 sm:pt-12">
          <Cloud className="absolute -left-4 top-44 w-20 sm:top-52 sm:w-32" />
          <Cloud className="absolute -right-6 bottom-32 w-24 sm:w-36" fill="#f27fb5" />
          <Contrail className="absolute bottom-4 left-0 hidden w-80 sm:block" />
          <Sparkle className="absolute left-[46%] top-6 h-8 w-8 sm:h-10 sm:w-10" />

          <div className="relative">
            <div className="flex items-start justify-between gap-3">
              <h1 className="bubble text-[19vw] text-sun sm:text-8xl">UDAAN</h1>
              <Jet className="mt-1 w-14 shrink-0 rotate-[18deg] sm:w-24" />
            </div>

            <div className="mt-3 flex items-end gap-3">
              <p className="bubble text-[27vw] text-signal sm:text-[9rem]">8-9</p>
              <p className="bubble mb-2 text-4xl text-signal sm:text-6xl">Oct</p>
            </div>

            <div className="relative mt-2 flex flex-wrap items-center gap-4">
              <Starburst className="-ml-1 h-28 w-28 -rotate-6 sm:h-36 sm:w-36" fill="#f4b81c">
                <span className="bubble text-2xl text-white sm:text-3xl">QUIZ!</span>
              </Starburst>
              <p className="sticker bg-paper px-4 py-2 text-base font-semibold sm:text-lg">Join the fun, don&apos;t miss it.</p>
            </div>

            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Button disabled={loading} onClick={() => signIn().catch(() => setError("Sign-in failed. Please try again."))}>
                Sign in with Google
              </Button>
              <Tag tone="white">All years · All branches</Tag>
            </div>
            {error && <p role="alert" className="mt-3 rounded-lg bg-white px-3 py-2 font-semibold text-signal">{error}</p>}

            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Tag tone="pink" tilt={-4} className="bubble !border-0 !shadow-none px-0 text-3xl text-signal">NSS</Tag>
              <Card tone="green" tilt={3} className="px-4 py-2">
                <span className="bubble text-3xl text-bubble">2026</span>
              </Card>
              <div className="flex items-center gap-2">
                <Badge className="h-10 w-10" />
                <p className="max-w-[10rem] text-sm font-bold uppercase leading-tight text-white">On the occasion of Air Force Day</p>
              </div>
            </div>
          </div>
        </section>

        <section className="fade-up mt-10 grid gap-5 sm:grid-cols-2" style={{ animationDelay: "0.15s" }}>
          {CARDS.map((c) => (
            <Card key={c.no} tone={c.tone} tilt={c.tilt} className="p-6">
              <Label>Competition {c.no}</Label>
              <h2 className="mt-2 text-3xl font-bold">{c.title}</h2>
              <ul className="mt-4 space-y-1 text-lg font-medium">
                {c.lines.map((l) => (
                  <li key={l} className="flex items-center gap-2">
                    <Sparkle className="h-4 w-4 shrink-0" />
                    {l}
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </section>
      </main>
    </>
  );
}
```
Note: the "NSS" pink tile in the hero reuses `Tag`; if it looks wrong when you view it, simplify it to `<NssLogo className="text-3xl" />` from `@/components/logo` (that same component will later hold the real logo).

- [ ] **Step 5: Verify**

Run: `npm run typecheck && npm run build`
Expected: passes. Then `npm run dev` and open `http://localhost:3000` at 390px and 1280px wide and compare with `poster.jpeg`: cream paper with grain, blue gridded hero panel, yellow outlined UDAAN, red 8-9 Oct, QUIZ! starburst, NSS/2026 stickers, jet in the corner, two tilted competition cards; no horizontal scroll on phone. Fix proportions here if text overflows (adjust the `vw` sizes). Sign-in needs Firebase env (Task 13), but the layout can be checked now.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: poster-style design system, auth provider, landing page"
```

---

### Task 10: Register and dashboard pages

**Files:**
- Create: `src/app/register/page.tsx`, `src/app/dashboard/page.tsx`, `src/lib/client/format.ts`

**Interfaces:**
- Consumes: `useRequireMe`, `Card/Stage/Label/Tag/Button/Field/inputClass`, `YEARS`, `BRANCHES`, `BRANCH_LABELS`.
- Produces: `formatIst(ms:number): string` (e.g. `8 Oct, 12:30 am IST`), `windowMessage(w:{state,openAt,closeAt}): string`.

- [ ] **Step 1: Formatting helpers**

`src/lib/client/format.ts`:
```ts
const fmt = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

export const formatIst = (ms: number) => `${fmt.format(new Date(ms))} IST`;

export function windowMessage(w: { state: "before" | "open" | "closed"; openAt: number; closeAt: number }): string {
  if (w.state === "before") return `Opens ${formatIst(w.openAt)}`;
  if (w.state === "open") return `Closes ${formatIst(w.closeAt)}`;
  return "Submissions are closed";
}
```

- [ ] **Step 2: Register page**

`src/app/register/page.tsx`:
```tsx
"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Field, Label, Stage, inputClass } from "@/components/ui";
import { SiteHeader } from "@/components/site-header";
import { BRANCH_LABELS, BRANCHES, YEARS } from "@/lib/config";
import { useRequireMe } from "@/lib/client/use-me";

export default function Register() {
  const { me, call, refresh } = useRequireMe(false);
  const router = useRouter();
  const [form, setForm] = useState({ name: "", rollNo: "", year: "", branch: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!me) return;
    setForm((f) => ({
      name: me.profile?.name ?? (f.name || me.name),
      rollNo: me.profile?.rollNo ?? f.rollNo,
      year: me.profile?.year ?? f.year,
      branch: me.profile?.branch ?? f.branch,
    }));
  }, [me]);

  const locked = me?.attempt != null;
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm({ ...form, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await call("/api/profile", { method: "POST", body: form });
      await refresh();
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save your details.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <SiteHeader isAdmin={me?.isAdmin} />
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <Stage className="fade-up p-4 sm:p-10">
          <h1 className="bubble text-5xl text-sun sm:text-6xl">Who are you?</h1>
          <p className="mt-3 inline-block rounded-lg bg-paper px-3 py-1 font-semibold">Signed in as {me?.email ?? "…"}</p>

          <Card className="mt-6 max-w-xl p-5 sm:p-8">
            <form onSubmit={submit} className="space-y-6">
              <Field label="Full name">
                <input className={inputClass} value={form.name} onChange={set("name")} required minLength={2} maxLength={80} disabled={locked} autoComplete="name" />
              </Field>
              <Field label="Roll number">
                <input className={inputClass} value={form.rollNo} onChange={set("rollNo")} required maxLength={20} disabled={locked} autoCapitalize="characters" />
              </Field>
              <div className="grid gap-6 sm:grid-cols-2">
                <Field label="Year">
                  <select className={inputClass} value={form.year} onChange={set("year")} required disabled={locked}>
                    <option value="" disabled>Select</option>
                    {YEARS.map((y) => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Branch">
                  <select className={inputClass} value={form.branch} onChange={set("branch")} required disabled={locked}>
                    <option value="" disabled>Select</option>
                    {BRANCHES.map((b) => (
                      <option key={b} value={b}>{b} · {BRANCH_LABELS[b]}</option>
                    ))}
                  </select>
                </Field>
              </div>
              {locked && <Label className="!opacity-100 text-signal">Your details are locked because you have started the quiz.</Label>}
              {error && <p role="alert" className="font-semibold text-signal">{error}</p>}
              <Button type="submit" disabled={busy || locked} className="w-full sm:w-auto">
                {busy ? "Saving…" : "Save and continue"}
              </Button>
            </form>
          </Card>
        </Stage>
      </main>
    </>
  );
}
```

- [ ] **Step 3: Dashboard page**

`src/app/dashboard/page.tsx`:
```tsx
"use client";
import Link from "next/link";
import { Card, Label, Stage, Tag, type Tone } from "@/components/ui";
import { Jet, Sparkle } from "@/components/art";
import { SiteHeader } from "@/components/site-header";
import { formatIst, windowMessage } from "@/lib/client/format";
import { useRequireMe } from "@/lib/client/use-me";

export default function Dashboard() {
  const { me } = useRequireMe(true);
  if (!me) return <><SiteHeader /><main className="p-8"><Label>Loading…</Label></main></>;

  const open = me.window.state === "open";
  const quiz: { tone: Tone; text: string } = me.attempt
    ? me.attempt.status === "submitted"
      ? { tone: "green", text: `Done · ${me.attempt.score}/20` }
      : { tone: "sun", text: "In progress · tap to resume" }
    : open
      ? { tone: "sun", text: "Ready to start" }
      : { tone: "paper", text: windowMessage(me.window) };
  const poster: { tone: Tone; text: string } = me.poster
    ? { tone: "green", text: `Submitted · ${formatIst(me.poster.uploadedAt)}` }
    : open
      ? { tone: "sun", text: "Waiting for your poster" }
      : { tone: "paper", text: windowMessage(me.window) };

  return (
    <>
      <SiteHeader isAdmin={me.isAdmin} />
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <Stage className="fade-up relative overflow-hidden p-4 sm:p-10">
          <Jet className="absolute right-4 top-4 w-12 rotate-[18deg] sm:w-20" />
          <h1 className="bubble pr-16 text-4xl text-sun sm:text-6xl">Hi {me.profile?.name.split(" ")[0]}!</h1>
          <p className="mt-3 inline-block rounded-lg bg-paper px-3 py-1 text-sm font-semibold sm:text-base">
            {me.profile?.year} · {me.profile?.branch} · {me.profile?.rollNo} · {windowMessage(me.window)}
          </p>

          <div className="mt-8 grid gap-6 md:grid-cols-2">
            <Link href="/quiz" className="block rounded-[18px] focus:outline-none focus-visible:ring-4 focus-visible:ring-sun">
              <Card tilt={-1} className="h-full p-6 transition-transform hover:-translate-y-1">
                <div className="flex items-center justify-between">
                  <Label>Competition 01</Label>
                  <Sparkle className="h-6 w-6" />
                </div>
                <h2 className="mt-2 text-3xl font-bold">Air Force Quiz</h2>
                <p className="mt-2 font-medium">20 questions · 15 minutes · one attempt</p>
                <Tag tone={quiz.tone} className="mt-5">{quiz.text}</Tag>
              </Card>
            </Link>
            <Link href="/poster" className="block rounded-[18px] focus:outline-none focus-visible:ring-4 focus-visible:ring-sun">
              <Card tilt={1} className="h-full p-6 transition-transform hover:-translate-y-1">
                <div className="flex items-center justify-between">
                  <Label>Competition 02</Label>
                  <Sparkle className="h-6 w-6" />
                </div>
                <h2 className="mt-2 text-3xl font-bold">Poster Making</h2>
                <p className="mt-2 font-medium">PDF, JPG or PNG · replace any time until the window closes</p>
                <Tag tone={poster.tone} className="mt-5">{poster.text}</Tag>
              </Card>
            </Link>
          </div>
        </Stage>
        {!me.attempt && (
          <p className="mt-6 text-sm font-medium">
            Need to fix your details? <Link href="/register" className="font-bold underline">Edit profile</Link> (locked once you start the quiz).
          </p>
        )}
      </main>
    </>
  );
}
```

- [ ] **Step 4: Verify**

Run: `npm run typecheck && npm run build`
Expected: passes. Manual check after Task 13 env setup: first login lands on `/register`; saving goes to `/dashboard`; reloading `/register` after a quiz start shows disabled fields. Both pages look right at 390px and 1280px.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: register and dashboard pages"
```

---

### Task 11: Quiz UI

**Files:**
- Create: `src/app/quiz/page.tsx`, `src/components/quiz/runner.tsx`, `src/components/quiz/format-time.ts`
- Test: `src/components/quiz/format-time.test.ts`

**Interfaces:**
- Consumes: `AttemptView` type (import type from `@/lib/quiz/service`), `useRequireMe`, UI components.
- Produces: `formatClock(ms:number): string` → `"MM:SS"` (ceil to whole seconds); `timerTone(ms:number): "ok"|"warn"|"critical"` (`warn` ≤ 180000, `critical` ≤ 60000); `Runner({initial, call, onDone})`.

- [ ] **Step 1: Write failing test for time helpers**

Create `src/components/quiz/format-time.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { formatClock, timerTone } from "@/components/quiz/format-time";

describe("formatClock", () => {
  it("formats minutes and seconds", () => {
    expect(formatClock(15 * 60 * 1000)).toBe("15:00");
    expect(formatClock(65_000)).toBe("01:05");
  });
  it("rounds partial seconds up so 0:00 only shows at true zero", () => {
    expect(formatClock(1)).toBe("00:01");
    expect(formatClock(0)).toBe("00:00");
    expect(formatClock(-500)).toBe("00:00");
  });
});

describe("timerTone", () => {
  it("is ok above 3 minutes, warn at or below 3, critical at or below 1", () => {
    expect(timerTone(181_000)).toBe("ok");
    expect(timerTone(180_000)).toBe("warn");
    expect(timerTone(61_000)).toBe("warn");
    expect(timerTone(60_000)).toBe("critical");
    expect(timerTone(0)).toBe("critical");
  });
});
```
Run: `npx vitest run src/components` → FAIL (module missing).

- [ ] **Step 2: Implement helpers**

`src/components/quiz/format-time.ts`:
```ts
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function timerTone(ms: number): "ok" | "warn" | "critical" {
  if (ms <= 60_000) return "critical";
  if (ms <= 180_000) return "warn";
  return "ok";
}
```
Run: `npx vitest run src/components` → PASS.

- [ ] **Step 3: Runner component**

`src/components/quiz/runner.tsx`:
```tsx
"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Card, Label, Tag } from "@/components/ui";
import type { AttemptView } from "@/lib/quiz/service";
import { formatClock, timerTone } from "./format-time";

type Call = <T>(path: string, opts?: { method?: string; body?: unknown }) => Promise<T>;
const LETTERS = ["A", "B", "C", "D"];
const TIMER = { ok: "bg-leaf text-white", warn: "bg-sun text-ink", critical: "bg-signal text-white pulse" };

export function Runner({ initial, call, onDone }: { initial: AttemptView; call: Call; onDone: (v: AttemptView) => void }) {
  const offset = useRef(initial.serverNow - Date.now());
  const [now, setNow] = useState(() => Date.now() + offset.current);
  const [answers, setAnswers] = useState<Record<string, number>>(initial.answers);
  const [i, setI] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [sync, setSync] = useState<"synced" | "saving" | "offline">("synced");
  const pending = useRef<Record<string, number>>({});
  const flushing = useRef(false);
  const finished = useRef(false);

  const total = initial.questions.length;
  const remaining = Math.max(0, initial.deadlineAt - now);
  const answered = Object.keys(answers).length;

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now() + offset.current), 250);
    return () => clearInterval(t);
  }, []);

  const flush = useCallback(async () => {
    if (flushing.current) return;
    flushing.current = true;
    try {
      for (const [k, v] of Object.entries(pending.current)) {
        try {
          await call("/api/quiz/answer", { method: "POST", body: { index: Number(k), choice: v } });
          if (pending.current[k] === v) delete pending.current[k];
        } catch (e) {
          if ((e as { status?: number }).status === 409) { pending.current = {}; break; }
          setSync("offline");
          return;
        }
      }
      setSync(Object.keys(pending.current).length ? "saving" : "synced");
    } finally {
      flushing.current = false;
    }
  }, [call]);

  useEffect(() => {
    const t = setInterval(() => { if (Object.keys(pending.current).length) void flush(); }, 3000);
    return () => clearInterval(t);
  }, [flush]);

  const finish = useCallback(async () => {
    if (finished.current) return;
    finished.current = true;
    setFinishing(true);
    await flush();
    try {
      onDone(await call<AttemptView>("/api/quiz/submit", { method: "POST" }));
    } catch {
      finished.current = false;
      setFinishing(false);
      setSync("offline");
    }
  }, [call, flush, onDone]);

  useEffect(() => {
    if (remaining === 0) void finish();
  }, [remaining, finish]);

  function pick(choice: number) {
    setAnswers((a) => ({ ...a, [i]: choice }));
    pending.current[String(i)] = choice;
    setSync("saving");
    void flush();
  }

  const q = initial.questions[i];
  const tone = timerTone(remaining);

  return (
    <div className="pb-28 lg:pb-10">
      <div className="sticky top-0 z-10 border-b-[3px] border-ink bg-paper">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-2 sm:px-6">
          <Tag tone="white">Question {String(i + 1).padStart(2, "0")}/{total}</Tag>
          <p
            role="timer"
            aria-label="Time remaining"
            className={`rounded-xl border-[3px] border-ink px-3 py-1 text-2xl font-bold tabular-nums shadow-[3px_3px_0_var(--color-ink)] ${TIMER[tone]}`}
          >
            {formatClock(remaining)}
          </p>
        </div>
      </div>

      <div className="mx-auto mt-4 max-w-5xl px-4 sm:px-6">
        <div className="grid-panel p-3 sm:p-6 lg:grid lg:grid-cols-[1fr_300px] lg:items-start lg:gap-6">
          <div>
            <Card className="p-5 sm:p-8">
              <Label>Question {String(i + 1).padStart(2, "0")}</Label>
              <h2 className="mt-2 text-xl font-semibold leading-snug sm:text-2xl">{q.text}</h2>
              <div className="mt-5 space-y-3">
                {q.options.map((opt, n) => {
                  const selected = answers[i] === n;
                  return (
                    <button
                      key={n}
                      onClick={() => pick(n)}
                      disabled={finishing}
                      aria-pressed={selected}
                      className={`flex min-h-14 w-full items-center gap-3 rounded-xl border-[3px] border-ink px-3 py-2 text-left shadow-[3px_3px_0_var(--color-ink)] transition-transform active:translate-x-[2px] active:translate-y-[2px] active:shadow-none ${
                        selected ? "bg-sun" : "bg-white hover:bg-paper"
                      }`}
                    >
                      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full border-[3px] border-ink text-sm font-bold ${selected ? "bg-white" : "bg-paper"}`}>
                        {LETTERS[n]}
                      </span>
                      <span className="text-base font-medium sm:text-lg">{opt}</span>
                    </button>
                  );
                })}
              </div>
            </Card>
            <div className="mt-5 hidden items-center justify-between lg:flex">
              <Button variant="ghost" disabled={i === 0} onClick={() => setI(i - 1)}>Previous</Button>
              <Button variant="ghost" disabled={i === total - 1} onClick={() => setI(i + 1)}>Next</Button>
            </div>
          </div>

          <aside className="mt-6 space-y-5 lg:sticky lg:top-24 lg:mt-0">
            <Card tone="paper" className="p-4">
              <div className="flex items-center justify-between">
                <Label>Navigator</Label>
                <span className={`text-xs font-bold uppercase ${sync === "offline" ? "text-signal" : sync === "saving" ? "text-ink/60" : "text-leaf"}`}>
                  {sync === "offline" ? "Offline · retrying" : sync === "saving" ? "Saving…" : "Saved"}
                </span>
              </div>
              <div className="mt-3 grid grid-cols-5 gap-2">
                {initial.questions.map((_, n) => (
                  <button
                    key={n}
                    onClick={() => setI(n)}
                    aria-label={`Go to question ${n + 1}`}
                    className={`min-h-12 rounded-lg border-[3px] border-ink text-sm font-bold ${
                      n === i ? "bg-blue text-white" : answers[n] !== undefined ? "bg-sun" : "bg-white"
                    }`}
                  >
                    {n + 1}
                  </button>
                ))}
              </div>
              <p className="mt-3 text-sm font-semibold">{answered}/{total} answered</p>
            </Card>

            {confirming ? (
              <Card tone="white" className="space-y-3 p-4">
                <p className="font-medium">
                  Submit now? You have answered <b>{answered}</b> of {total}. You cannot change answers after this.
                </p>
                <div className="flex gap-3">
                  <Button variant="danger" onClick={() => void finish()} disabled={finishing} className="flex-1 px-3">
                    {finishing ? "Submitting…" : "Yes, submit"}
                  </Button>
                  <Button variant="ghost" onClick={() => setConfirming(false)} disabled={finishing} className="flex-1 px-3">Back</Button>
                </div>
              </Card>
            ) : (
              <Button className="w-full" onClick={() => setConfirming(true)} disabled={finishing}>Submit quiz</Button>
            )}
          </aside>
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-10 flex gap-3 border-t-[3px] border-ink bg-paper p-3 lg:hidden">
        <Button variant="ghost" className="flex-1" disabled={i === 0} onClick={() => setI(i - 1)}>Prev</Button>
        <Button className="flex-1" disabled={i === total - 1} onClick={() => setI(i + 1)}>Next</Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Quiz page**

`src/app/quiz/page.tsx`:
```tsx
"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Sparkle, Starburst } from "@/components/art";
import { Button, Card, Label, Stage } from "@/components/ui";
import { Runner } from "@/components/quiz/runner";
import { SiteHeader } from "@/components/site-header";
import { windowMessage } from "@/lib/client/format";
import { useRequireMe } from "@/lib/client/use-me";
import type { AttemptView } from "@/lib/quiz/service";

type Phase = "loading" | "intro" | "starting" | "run" | "done";

export default function QuizPage() {
  const { me, call, refresh } = useRequireMe(true);
  const [phase, setPhase] = useState<Phase>("loading");
  const [view, setView] = useState<AttemptView | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!me || phase !== "loading") return;
    call<AttemptView>("/api/quiz/attempt")
      .then((v) => {
        setView(v);
        setPhase(v.status === "submitted" ? "done" : "run");
      })
      .catch((e: { status?: number; message?: string }) => {
        if (e.status === 404) setPhase("intro");
        else setError(e.message ?? "Could not load the quiz.");
      });
  }, [me, phase, call]);

  async function start() {
    setPhase("starting");
    setError("");
    try {
      setView(await call<AttemptView>("/api/quiz/start", { method: "POST" }));
      setPhase("run");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start the quiz.");
      setPhase("intro");
    }
  }

  if (!me) return <><SiteHeader /><main className="p-8"><Label>Loading…</Label></main></>;

  if (phase === "run" && view) {
    return (
      <>
        <SiteHeader isAdmin={me.isAdmin} />
        <Runner initial={view} call={call} onDone={(v) => { setView(v); setPhase("done"); void refresh(); }} />
      </>
    );
  }

  const open = me.window.state === "open";
  return (
    <>
      <SiteHeader isAdmin={me.isAdmin} />
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <Stage className="fade-up p-4 sm:p-10">
          <h1 className="bubble text-5xl text-sun sm:text-7xl">Quiz!</h1>

          {phase === "done" && view ? (
            <Card className="mt-6 max-w-xl p-6 text-center sm:p-8">
              <Label>Mission complete</Label>
              <Starburst className="mx-auto mt-3 h-56 w-56" fill="#f4b81c">
                <span className="bubble text-5xl text-white">{view.score}/{view.total}</span>
              </Starburst>
              <p className="mt-3 font-medium">Your attempt has been recorded. Thank you for flying with us!</p>
              <Link href="/dashboard" className="mt-5 inline-block min-h-12 py-3 font-bold underline">Back to dashboard</Link>
            </Card>
          ) : (
            <Card className="mt-6 max-w-xl p-6 sm:p-8">
              <ul className="space-y-2 text-lg font-medium">
                {[
                  "20 multiple-choice questions on the Indian Air Force",
                  "15 minutes. The clock starts when you press start",
                  "One attempt only. If you reload, you continue where you left off",
                  "The timer keeps running even if you close the page",
                ].map((t) => (
                  <li key={t} className="flex items-start gap-2">
                    <Sparkle className="mt-1 h-4 w-4 shrink-0" />
                    {t}
                  </li>
                ))}
              </ul>
              <p className="mt-5 inline-block rounded-lg bg-sun px-3 py-1 text-sm font-bold">{windowMessage(me.window)}</p>
              {error && <p role="alert" className="mt-4 font-semibold text-signal">{error}</p>}
              <div className="mt-5">
                <Button className="w-full sm:w-auto" disabled={!open || phase !== "intro"} onClick={start}>
                  {phase === "starting" ? "Preparing your questions…" : phase === "loading" ? "Loading…" : open ? "Start quiz" : "Locked"}
                </Button>
              </div>
            </Card>
          )}
        </Stage>
      </main>
    </>
  );
}
```

- [ ] **Step 5: Verify**

Run: `npm test && npm run typecheck && npm run build`
Expected: PASS. Manual (after Task 13): start quiz, select answers, reload mid-quiz → same questions, answers retained, timer continues; at 390px the bottom Prev/Next bar and the sticky timer show with no horizontal scroll; at 1280px the navigator sits in a right-hand column; timer turns yellow under 3:00 and red under 1:00.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: quiz UI with resumable timer and navigator"
```

---

### Task 12: Poster UI, admin API, CSV and admin page

**Files:**
- Create: `src/app/poster/page.tsx`, `src/lib/csv.ts`, `src/app/api/admin/overview/route.ts`, `src/app/admin/page.tsx`, `cors.json`
- Test: `src/lib/csv.test.ts`

**Interfaces:**
- Consumes: `storage()` from `@/lib/firebase/client`, `POSTER`, `useRequireMe`, repo list functions, `signedReadUrl`.
- Produces: `csvCell(v:unknown): string`, `toCsv(headers:string[], rows:unknown[][]): string`; `GET /api/admin/overview` → `{ rows: AdminRow[] }` where
```ts
interface AdminRow { uid:string; name:string; email:string; rollNo:string; year:string; branch:string; quiz:{status:string; score:number|null}|null; poster:{uploadedAt:number; fileType:string; url:string}|null }
```

- [ ] **Step 1: Write failing CSV tests**

`src/lib/csv.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { csvCell, toCsv } from "@/lib/csv";

describe("csvCell", () => {
  it("leaves plain values alone", () => {
    expect(csvCell("Asha")).toBe("Asha");
    expect(csvCell(12)).toBe("12");
  });
  it("renders null and undefined as empty", () => {
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
  });
  it("quotes commas, quotes and newlines", () => {
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell("line1\nline2")).toBe('"line1\nline2"');
  });
  it("neutralises spreadsheet formulas", () => {
    expect(csvCell("=HYPERLINK(\"http://evil\")")).toBe('"\'=HYPERLINK(""http://evil"")"');
    expect(csvCell("+1+1")).toBe("'+1+1");
    expect(csvCell("-2+3")).toBe("'-2+3");
    expect(csvCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(csvCell("\tcmd")).toBe("'\tcmd");
  });
});

describe("toCsv", () => {
  it("joins with CRLF", () => {
    expect(toCsv(["a", "b"], [["1", "x,y"]])).toBe('a,b\r\n1,"x,y"');
  });
});
```
Run: `npx vitest run src/lib/csv.test.ts` → FAIL.

- [ ] **Step 2: Implement CSV**

`src/lib/csv.ts`:
```ts
const FORMULA = /^[=+\-@\t\r]/;

export function csvCell(v: unknown): string {
  let s = v == null ? "" : String(v);
  if (FORMULA.test(s)) s = `'${s}`;
  if (/[",\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  return [headers, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n");
}
```
Run: `npx vitest run src/lib/csv.test.ts` → PASS.

- [ ] **Step 3: Admin overview route**

`src/app/api/admin/overview/route.ts`:
```ts
import { route } from "@/lib/server/http";
import { requireAdmin } from "@/lib/server/auth";
import { listAttemptSummaries, listPosterRecords, listUsers, signedReadUrl } from "@/lib/server/repo";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const GET = route(async (req) => {
  await requireAdmin(req);
  const [users, attempts, posters] = await Promise.all([listUsers(), listAttemptSummaries(), listPosterRecords()]);
  const rows = await Promise.all(
    users.map(async (u) => {
      const a = attempts.get(u.uid);
      const p = posters.get(u.uid);
      return {
        uid: u.uid,
        name: u.name,
        email: u.email,
        rollNo: u.rollNo,
        year: u.year,
        branch: u.branch,
        quiz: a ? { status: a.status, score: a.score ?? null } : null,
        poster: p ? { uploadedAt: p.uploadedAt, fileType: p.fileType, url: await signedReadUrl(p.path) } : null,
      };
    }),
  );
  rows.sort((x, y) => x.name.localeCompare(y.name));
  return { rows };
});
```

- [ ] **Step 4: Poster page**

`src/app/poster/page.tsx`:
```tsx
"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ref, uploadBytesResumable } from "firebase/storage";
import { Sparkle } from "@/components/art";
import { Button, Card, Label, Stage, Tag } from "@/components/ui";
import { SiteHeader } from "@/components/site-header";
import { formatIst, windowMessage } from "@/lib/client/format";
import { useRequireMe } from "@/lib/client/use-me";
import { POSTER } from "@/lib/config";
import { storage } from "@/lib/firebase/client";

const EXT: Record<string, string> = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png" };
interface Current { uploadedAt: number; fileType: string; url: string }

export default function PosterPage() {
  const { me, call, refresh, user } = useRequireMe(true);
  const [current, setCurrent] = useState<Current | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setCurrent((await call<{ poster: Current | null }>("/api/poster")).poster);
  }, [call]);
  useEffect(() => { if (me) void load().catch(() => {}); }, [me, load]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  function choose(f: File | undefined) {
    setError("");
    if (!f) return;
    if (!(POSTER.allowedTypes as readonly string[]).includes(f.type)) return setError("Only PDF, JPG or PNG files are allowed.");
    if (f.size > POSTER.maxBytes) return setError("That file is larger than 10 MB.");
    setFile(f);
    setPreview(f.type.startsWith("image/") ? URL.createObjectURL(f) : null);
  }

  async function upload() {
    if (!file || !user) return;
    setBusy(true);
    setError("");
    setProgress(0);
    const path = `posters/${user.uid}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${EXT[file.type]}`;
    try {
      await new Promise<void>((resolve, reject) => {
        const task = uploadBytesResumable(ref(storage(), path), file, { contentType: file.type });
        task.on("state_changed", (s) => setProgress(Math.round((s.bytesTransferred / s.totalBytes) * 100)), reject, () => resolve());
      });
      await call("/api/poster/confirm", { method: "POST", body: { path } });
      setFile(null);
      setPreview(null);
      await Promise.all([load(), refresh()]);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "Upload failed. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!me) return <><SiteHeader /><main className="p-8"><Label>Loading…</Label></main></>;
  const open = me.window.state === "open";

  return (
    <>
      <SiteHeader isAdmin={me.isAdmin} />
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <Stage className="fade-up p-4 sm:p-10">
          <h1 className="bubble text-5xl text-sun sm:text-7xl">Poster!</h1>
          <p className="mt-3 inline-block rounded-lg bg-paper px-3 py-1 text-sm font-semibold sm:text-base">{windowMessage(me.window)}</p>

          <div className="mt-6 grid max-w-2xl gap-6">
            {current && (
              <Card tilt={-0.5} className="p-5">
                <Tag tone="green">Submitted</Tag>
                <p className="mt-2 text-sm font-semibold">{formatIst(current.uploadedAt)} · {EXT[current.fileType]?.toUpperCase()}</p>
                {current.fileType.startsWith("image/") && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={current.url} alt="Your submitted poster" className="mt-4 max-h-96 w-full rounded-lg border-[3px] border-ink bg-paper object-contain" />
                )}
                <a href={current.url} target="_blank" rel="noreferrer" className="mt-3 inline-block min-h-12 py-3 font-bold underline">
                  Open submitted file
                </a>
              </Card>
            )}

            {open ? (
              <Card className="p-5 sm:p-8">
                <Label>{current ? "Replace your poster" : "Upload your poster"}</Label>
                <button
                  type="button"
                  onClick={() => input.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
                  onDragLeave={() => setDrag(false)}
                  onDrop={(e) => { e.preventDefault(); setDrag(false); choose(e.dataTransfer.files[0]); }}
                  className={`mt-4 flex min-h-44 w-full flex-col items-center justify-center gap-2 rounded-xl border-[3px] border-dashed border-ink px-4 text-center ${drag ? "bg-sun" : "bg-paper hover:bg-sun/30"}`}
                >
                  <Sparkle className="h-8 w-8" />
                  <span className="text-2xl font-bold">Tap to choose a file</span>
                  <span className="text-sm font-medium">or drag and drop here · PDF, JPG, PNG · max 10 MB</span>
                </button>
                <input ref={input} type="file" accept="application/pdf,image/jpeg,image/png" className="hidden" onChange={(e) => choose(e.target.files?.[0])} />

                {file && (
                  <div className="mt-5 space-y-3">
                    {preview && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={preview} alt="Preview" className="max-h-72 w-full rounded-lg border-[3px] border-ink bg-paper object-contain" />
                    )}
                    <p className="break-all font-semibold">{file.name} · {(file.size / 1024 / 1024).toFixed(2)} MB</p>
                    {busy && (
                      <div className="h-4 w-full overflow-hidden rounded-full border-[3px] border-ink bg-white" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
                        <div className="h-full bg-leaf transition-all" style={{ width: `${progress}%` }} />
                      </div>
                    )}
                    <Button onClick={upload} disabled={busy} className="w-full sm:w-auto">
                      {busy ? `Uploading ${progress}%` : current ? "Replace poster" : "Submit poster"}
                    </Button>
                  </div>
                )}
                {error && <p role="alert" className="mt-4 font-semibold text-signal">{error}</p>}
              </Card>
            ) : (
              <Card tone="paper" className="p-5 font-semibold">Poster submissions are not open right now.</Card>
            )}
          </div>
        </Stage>
      </main>
    </>
  );
}
```

- [ ] **Step 5: Admin page**

The admin page uses the same colours and outlines but keeps tables plain and readable.

`src/app/admin/page.tsx`:
```tsx
"use client";
import JSZip from "jszip";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Label, Stage, inputClass } from "@/components/ui";
import { SiteHeader } from "@/components/site-header";
import { formatIst } from "@/lib/client/format";
import { useRequireMe } from "@/lib/client/use-me";
import { BRANCHES, YEARS } from "@/lib/config";
import { toCsv } from "@/lib/csv";

interface Row {
  uid: string; name: string; email: string; rollNo: string; year: string; branch: string;
  quiz: { status: string; score: number | null } | null;
  poster: { uploadedAt: number; fileType: string; url: string } | null;
}
type Tab = "participants" | "quiz" | "posters";
const EXT: Record<string, string> = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png" };

function download(blob: Blob, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}
const safe = (s: string) => s.replace(/[^A-Za-z0-9._-]+/g, "_");

export default function AdminPage() {
  const { me, call } = useRequireMe(false);
  const router = useRouter();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [tab, setTab] = useState<Tab>("participants");
  const [year, setYear] = useState("");
  const [branch, setBranch] = useState("");
  const [q, setQ] = useState("");
  const [error, setError] = useState("");
  const [zipping, setZipping] = useState(false);

  useEffect(() => {
    if (!me) return;
    if (!me.isAdmin) return void router.replace("/dashboard");
    call<{ rows: Row[] }>("/api/admin/overview").then((r) => setRows(r.rows)).catch((e) => setError(e.message));
  }, [me, call, router]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (rows ?? []).filter(
      (r) =>
        (!year || r.year === year) &&
        (!branch || r.branch === branch) &&
        (!needle || `${r.name} ${r.rollNo} ${r.email}`.toLowerCase().includes(needle)),
    );
  }, [rows, year, branch, q]);

  const visible = useMemo(() => {
    if (tab === "quiz") return [...filtered].sort((a, b) => (b.quiz?.score ?? -1) - (a.quiz?.score ?? -1));
    if (tab === "posters") return filtered.filter((r) => r.poster);
    return filtered;
  }, [filtered, tab]);

  function exportCsv() {
    const csv = toCsv(
      ["Name", "Roll No", "Year", "Branch", "Email", "Quiz status", "Quiz score", "Poster submitted", "Poster time (IST)"],
      filtered.map((r) => [r.name, r.rollNo, r.year, r.branch, r.email, r.quiz?.status ?? "not started", r.quiz?.score ?? "", r.poster ? "yes" : "no", r.poster ? formatIst(r.poster.uploadedAt) : ""]),
    );
    download(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }), "udaan-participants.csv");
  }

  async function zipPosters() {
    setZipping(true);
    setError("");
    try {
      const zip = new JSZip();
      for (const r of filtered.filter((x) => x.poster)) {
        const res = await fetch(r.poster!.url);
        if (!res.ok) throw new Error(`Could not fetch the poster for ${r.name}`);
        zip.file(`${r.year}_${r.branch}_${safe(r.rollNo)}_${safe(r.name)}.${EXT[r.poster!.fileType] ?? "bin"}`, await res.blob());
      }
      download(await zip.generateAsync({ type: "blob" }), "udaan-posters.zip");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not build the zip.");
    } finally {
      setZipping(false);
    }
  }

  if (!me || !me.isAdmin) return <><SiteHeader /><main className="p-8"><Label>Checking access…</Label></main></>;

  const columns: { label: string; cell: (r: Row) => React.ReactNode }[] = [
    { label: "Name", cell: (r) => <b>{r.name}</b> },
    { label: "Roll no", cell: (r) => r.rollNo },
    { label: "Year · Branch", cell: (r) => `${r.year} · ${r.branch}` },
    ...(tab === "participants" ? [{ label: "Email", cell: (r: Row) => <span className="break-all">{r.email}</span> }] : []),
    ...(tab === "quiz" ? [{ label: "Quiz", cell: (r: Row) => <b>{r.quiz ? (r.quiz.status === "submitted" ? `${r.quiz.score}/20` : "in progress") : "—"}</b> }] : []),
    ...(tab === "posters"
      ? [
          { label: "Submitted", cell: (r: Row) => formatIst(r.poster!.uploadedAt) },
          { label: "File", cell: (r: Row) => <a className="inline-block min-h-12 py-3 font-bold underline" href={r.poster!.url} target="_blank" rel="noreferrer">Open {EXT[r.poster!.fileType]?.toUpperCase()}</a> },
        ]
      : []),
  ];
  const grid = { gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` };

  return (
    <>
      <SiteHeader isAdmin />
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <Stage className="p-4 sm:p-8">
          <h1 className="bubble text-5xl text-sun sm:text-6xl">Admin</h1>

          <div className="mt-6 grid grid-cols-3 gap-3 sm:max-w-md">
            {(["participants", "quiz", "posters"] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`min-h-12 rounded-xl border-[3px] border-ink text-sm font-bold capitalize shadow-[3px_3px_0_var(--color-ink)] ${tab === t ? "bg-sun" : "bg-white"}`}
              >
                {t}
              </button>
            ))}
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_140px_140px]">
            <input className={inputClass} placeholder="Search name, roll no or email" value={q} onChange={(e) => setQ(e.target.value)} />
            <select className={inputClass} value={year} onChange={(e) => setYear(e.target.value)} aria-label="Filter by year">
              <option value="">All years</option>
              {YEARS.map((y) => <option key={y}>{y}</option>)}
            </select>
            <select className={inputClass} value={branch} onChange={(e) => setBranch(e.target.value)} aria-label="Filter by branch">
              <option value="">All branches</option>
              {BRANCHES.map((b) => <option key={b}>{b}</option>)}
            </select>
          </div>

          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="inline-block rounded-lg bg-paper px-3 py-1 text-sm font-bold">
              {rows ? `${visible.length} shown · ${rows.length} registered` : "Loading…"}
            </p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button variant="ghost" onClick={exportCsv} disabled={!rows}>Export CSV</Button>
              <Button variant="ghost" onClick={zipPosters} disabled={!rows || zipping}>{zipping ? "Zipping…" : "Download all posters"}</Button>
            </div>
          </div>
          {error && <p role="alert" className="mt-3 rounded-lg bg-white px-3 py-2 font-semibold text-signal">{error}</p>}

          <Card className="mt-4">
            <div className="hidden gap-4 border-b-[3px] border-ink px-4 py-3 md:grid" style={grid}>
              {columns.map((c) => <Label key={c.label}>{c.label}</Label>)}
            </div>
            {visible.length === 0 && <p className="p-6 font-medium">{rows ? "Nothing to show." : ""}</p>}
            {visible.map((r) => (
              <div key={r.uid} className="border-b-2 border-ink/20 px-4 py-3 last:border-b-0">
                <div className="hidden items-center gap-4 md:grid" style={grid}>
                  {columns.map((c) => <div key={c.label}>{c.cell(r)}</div>)}
                </div>
                <dl className="space-y-1 md:hidden">
                  {columns.map((c) => (
                    <div key={c.label} className="flex justify-between gap-4">
                      <dt><Label>{c.label}</Label></dt>
                      <dd className="text-right">{c.cell(r)}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
          </Card>
        </Stage>
      </main>
    </>
  );
}
```
`cors.json` (needed so the browser can fetch signed URLs for the zip; replace the origin with the deployed domain before applying):
```json
[
  {
    "origin": ["https://YOUR-DEPLOYED-DOMAIN", "http://localhost:3000"],
    "method": ["GET"],
    "maxAgeSeconds": 3600
  }
]
```

- [ ] **Step 6: Verify**

Run: `npm test && npm run typecheck && npm run build`
Expected: PASS. Manual (after Task 13): non-admin visiting `/admin` is redirected to `/dashboard`; admin sees all three tabs; at 390px rows render as stacked cards, at 1280px as a table; the poster page shows the dashed sticker dropzone and a green progress bar while uploading.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat: poster upload, admin overview, CSV export, bulk zip"
```

---

### Task 13: Firebase project setup, environment, README

**Files:**
- Create: `README.md`, `.env.local` (not committed)

- [ ] **Step 1: Create the Firebase project (manual, in the console)**

1. Firebase console → Add project → name `udaan`.
2. Build → Authentication → Get started → enable **Google** provider; set a support email.
3. Build → Firestore Database → Create database (production mode, region `asia-south1`).
4. Build → Storage → Get started (this requires upgrading to the **Blaze** plan; set a budget alert of e.g. ₹500 to stay safe).
5. Project settings → General → Your apps → Web app → copy the config values.
6. Project settings → Service accounts → Generate new private key → copy `project_id`, `client_email`, `private_key`.
7. Authentication → Settings → Authorized domains: add the deployed domain (and keep `localhost`).
8. Get a Gemini API key from Google AI Studio.

- [ ] **Step 2: Fill `.env.local`**

Copy `.env.example` to `.env.local` and fill in every value. For local testing before 8 Oct, set:
```
WINDOW_OPEN_ISO=2026-10-01T00:00:00Z
WINDOW_CLOSE_ISO=2026-12-31T00:00:00Z
ADMIN_EMAILS=<your gmail>
```
Remove those two overrides before deploying.

- [ ] **Step 3: Deploy rules and CORS**

```bash
npx firebase-tools login
npx firebase-tools deploy --only firestore:rules,storage --project <project-id>
gcloud storage buckets update gs://<storage-bucket> --cors-file=cors.json
```
Expected: rules deployed; CORS updated (needed for the admin "Download all posters" zip).

- [ ] **Step 4: Write `README.md`**

```markdown
# Udaan

Air Force Day event site: quiz + poster competitions. Open 8-9 Oct 2026 (IST).

## Run locally
1. `npm install`
2. Copy `.env.example` to `.env.local` and fill it in (see comments there).
3. `npm run dev`

## Test
- `npm test` unit tests
- `npm run test:rules` security-rules tests (needs Java 11+ for the Firebase emulators)

## Deploy
Deploy to Vercel (set every variable from `.env.example` except the two `WINDOW_*` overrides), add the domain to Firebase Auth authorized domains, and set the origin in `cors.json` before applying it.

## Admins
Set `ADMIN_EMAILS` to a comma-separated list of Gmail addresses.
```

- [ ] **Step 5: Commit**

```bash
git add README.md && git commit -m "docs: setup and deploy instructions"
```

---

### Task 14: End-to-end verification

**Files:** none (fixes found here go into the owning task's files).

- [ ] **Step 1: Full automated check**

Run: `npm test && npm run typecheck && npm run build && npm run test:rules`
Expected: everything green.

- [ ] **Step 2: Browser walkthrough with a real account (phone 390px and laptop 1280px)**

With `npm run dev` and the local window overrides, verify each:
1. Landing renders correctly at both widths; "Sign in with Google" completes and lands on `/register`.
2. Register with each year/branch option works; roll number with a space is rejected; `/dashboard` shows both cards.
3. Quiz: Start shows 20 questions; select answers; reload mid-quiz → same questions, answers kept, timer continues (not reset); close the tab for a minute and reopen → timer reflects elapsed time.
4. Submit → score shown; opening `/quiz` again shows the result, no second attempt; `/register` fields are locked.
5. Network tab: `/api/quiz/start` and `/api/quiz/attempt` responses contain no `answer` field.
6. Poster: upload a PNG, then replace with a PDF; only the PDF remains in the admin view. A `.txt` file and an 11 MB file are rejected in the UI.
7. Admin (your allowlisted email): tabs, year/branch filters, search, CSV opens in Excel with a student named `=1+1` shown as text, poster zip downloads and contains correctly named files. A non-admin account is redirected away from `/admin` and gets 403 from `/api/admin/overview`.
8. Set `WINDOW_CLOSE_ISO` to a past time, restart: quiz Start and poster upload show the locked state and the API returns 403; an in-progress attempt can still finish.
9. Force Gemini failure (invalid `GEMINI_API_KEY`): the quiz still starts using the fallback bank.

- [ ] **Step 3: Fix anything found, re-run Step 1, then commit**

```bash
git add -A && git commit -m "fix: issues found in end-to-end verification"
```

- [ ] **Step 4: Pre-launch checklist**

- Remove `WINDOW_OPEN_ISO` / `WINDOW_CLOSE_ISO` from the production environment.
- `ADMIN_EMAILS` set to the real organisers.
- Production domain in Firebase Auth authorized domains and in `cors.json`.
- Blaze budget alert configured.
- Share the link only after 8 Oct 00:00 IST or leave it shared: the quiz and poster stay locked until then.
