"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Sparkle } from "@/components/art";
import { Button, Card, Label, Tag } from "@/components/ui";
import { ApiError } from "@/lib/client/api";
import { QUIZ } from "@/lib/config";
import type { AttemptView } from "@/lib/quiz/service";
import { clockOffset, formatClock, remainingAt, spokenTime, timerTone } from "./format-time";
import { SaveQueue, type ErrorKind, type FlushResult } from "./save-queue";

type Call = <T>(path: string, opts?: { method?: string; body?: unknown }) => Promise<T>;
type Sync = "synced" | "saving" | "offline";

const LETTERS = ["A", "B", "C", "D"];
const RETRY_MS = 2000;
/** Seconds-left marks at which the time is read out to screen readers (never every second). */
const MILESTONES = [600, 300, 180, 60, 30, 10];
const TIMER = {
  ok: { box: "bg-leaf text-white", word: "Time left" },
  warn: { box: "bg-sun text-ink", word: "Under 3 min" },
  critical: { box: "bg-signal text-white pulse", word: "Last minute" },
};
/** 409: the server has closed the attempt (time ran out there). 400/404: retrying can't fix it. */
function classifySaveError(e: unknown): ErrorKind {
  if (e instanceof ApiError && e.status === 409) return "closed";
  if (e instanceof ApiError && (e.status === 400 || e.status === 404)) return "drop";
  return "retry";
}
const pad2 = (n: number) => String(n).padStart(2, "0");

export function Runner({ initial, call, onDone }: { initial: AttemptView; call: Call; onDone: (v: AttemptView) => void }) {
  // Server time minus local time, measured once from this response; the local clock alone is not trusted.
  const offset = useRef(clockOffset(initial.serverNow, Date.now()));
  const [localNow, setLocalNow] = useState(() => Date.now());
  const [answers, setAnswers] = useState<Record<string, number>>(initial.answers);
  const [i, setI] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [finishError, setFinishError] = useState("");
  const [sync, setSync] = useState<Sync>("synced");
  const [serverClosed, setServerClosed] = useState(false);
  const [spoken, setSpoken] = useState("");
  const callRef = useRef(call);
  callRef.current = call;
  const queueRef = useRef<SaveQueue | null>(null);
  const queue = useCallback(
    () =>
      (queueRef.current ??= new SaveQueue(
        (index, choice) => callRef.current<unknown>("/api/quiz/answer", { method: "POST", body: { index, choice } }).then(() => {}),
        classifySaveError,
      )),
    [],
  );
  const busyFinishing = useRef(false);
  const done = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const confirmBox = useRef<HTMLDivElement>(null);
  const firstRender = useRef(true);

  const total = initial.questions.length;
  const remaining = remainingAt(initial.deadlineAt, localNow, offset.current);
  const timeUp = remaining === 0 || serverClosed;
  const answered = Object.keys(answers).length;
  const tone = timerTone(remaining);
  const timeUpRef = useRef(timeUp);
  timeUpRef.current = timeUp;

  useEffect(() => {
    const t = setInterval(() => setLocalNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);

  /** Latest result of a flush, reflected in the save indicator (and a 409 ends the attempt). */
  const report = useCallback((r: FlushResult) => {
    if (r === "closed") setServerClosed(true);
    setSync(r === "failed" ? "offline" : queue().size ? "saving" : "synced");
    return r;
  }, [queue]);

  const flush = useCallback(() => queue().flush().then(report), [queue, report]);

  const finish = useCallback(async () => {
    if (busyFinishing.current || done.current) return;
    busyFinishing.current = true;
    setFinishing(true);
    setFinishError("");
    try {
      // Wait for any save already on the wire, then keep flushing until the queue is empty.
      const saved = report(await queue().drain());
      // Never hand in while a pick is unsaved, unless the server's deadline (plus grace) has passed.
      const graceLeft = initial.deadlineAt + QUIZ.graceMs - (Date.now() + offset.current);
      if (saved === "failed" && graceLeft > 0) throw new Error("Some answers are not saved yet.");
      const v = await call<AttemptView>("/api/quiz/submit", { method: "POST" });
      done.current = true;
      onDone(v);
    } catch {
      setFinishError(
        timeUpRef.current
          ? "Time's up, but we can't reach the server. Your answers are kept on this device; retrying…"
          : "Some answers aren't saved yet. Check your connection, then tap “Yes, submit” again.",
      );
      setFinishing(false);
    } finally {
      busyFinishing.current = false;
    }
  }, [call, queue, report, onDone, initial.deadlineAt]);

  // Time up (here or on the server): hand in. If that fails, the retry loop below tries again.
  useEffect(() => {
    if (timeUp) void finish();
  }, [timeUp, finish]);

  useEffect(() => {
    const t = setInterval(() => {
      if (done.current) return;
      if (queue().size) void flush();
      if (timeUp && !busyFinishing.current) void finish();
    }, RETRY_MS);
    const online = () => void flush();
    window.addEventListener("online", online);
    return () => {
      clearInterval(t);
      window.removeEventListener("online", online);
    };
  }, [flush, finish, timeUp, queue]);

  // Warn before closing the tab with an unsaved pick (the timer keeps running regardless).
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (queue().size) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [queue]);

  // Read the time out at a few milestones only.
  const milestone = MILESTONES.filter((m) => remaining <= m * 1000).pop() ?? null;
  useEffect(() => {
    if (milestone !== null) setSpoken(spokenTime(remainingAt(initial.deadlineAt, Date.now(), offset.current)));
  }, [milestone, initial.deadlineAt]);

  // Moving to another question: put focus on it so screen readers read the new question.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    heading.current?.focus();
  }, [i]);

  function pick(choice: number) {
    if (timeUp) return;
    setAnswers((a) => ({ ...a, [i]: choice }));
    queue().set(i, choice);
    setSync("saving");
    void flush();
  }

  function openConfirm() {
    setConfirming(true);
    requestAnimationFrame(() => confirmBox.current?.scrollIntoView({ block: "center" }));
  }

  const q = initial.questions[i];
  const last = i === total - 1;
  const locked = timeUp || finishing;

  return (
    <div className="pb-28 lg:pb-10">
      <div className="sticky top-0 z-20 border-b-[3px] border-ink bg-paper">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-2 sm:px-6">
          <Tag tone="white" className="tabular-nums">
            <span className="sr-only">Question </span>
            {pad2(i + 1)}
            <span className="opacity-60">/{total}</span>
          </Tag>
          <div className="flex items-center gap-2.5">
            <span className="text-right text-xs font-bold uppercase leading-tight tracking-wide sm:text-sm">{TIMER[tone].word}</span>
            <p
              role="timer"
              aria-live="off"
              className={`min-w-[5.5rem] rounded-xl border-[3px] border-ink px-3 py-1 text-center text-2xl font-bold tabular-nums shadow-[3px_3px_0_var(--color-ink)] ${TIMER[tone].box}`}
            >
              {formatClock(remaining)}
            </p>
          </div>
        </div>
      </div>
      <p className="sr-only" aria-live="polite">
        {spoken}
      </p>

      <div className="mx-auto mt-6 max-w-5xl px-4 sm:px-6">
        {(timeUp || finishing || finishError) && (
          <Card tone={finishError ? "white" : "sun"} className="fade-up mb-5 flex items-center gap-3 p-4">
            <Sparkle className="h-6 w-6 shrink-0" />
            <p role="status" className="font-semibold">
              {finishError || (timeUp ? "Time's up! Handing in your answers…" : "Handing in your answers…")}
            </p>
          </Card>
        )}

        <div className="grid-panel p-3 pt-8 sm:p-6 sm:pt-10 lg:grid lg:grid-cols-[1fr_300px] lg:items-start lg:gap-6">
          <div>
            <Card className="relative p-5 sm:p-8">
              <span className="bubble absolute -top-7 right-4 text-5xl text-bubble sm:text-6xl" aria-hidden>
                {pad2(i + 1)}
              </span>
              <div key={i}>
                <Label>
                  Question {i + 1} of {total}
                </Label>
                <h2 id={`q${i}-text`} ref={heading} tabIndex={-1} className="mt-2 pr-14 text-xl font-semibold leading-snug outline-none sm:text-2xl">
                  {q.text}
                </h2>
                <div role="radiogroup" aria-labelledby={`q${i}-text`} className="mt-5 space-y-3">
                  {q.options.map((opt, n) => {
                    const selected = answers[i] === n;
                    return (
                      <label
                        key={n}
                        className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border-[3px] border-ink px-3 py-2 shadow-[3px_3px_0_var(--color-ink)] transition-transform active:translate-x-[2px] active:translate-y-[2px] active:shadow-none has-[:disabled]:cursor-not-allowed has-[:focus-visible]:[outline-offset:3px] has-[:focus-visible]:[outline:3px_solid_var(--color-ink)] ${
                          selected ? "bg-sun" : "bg-white hover:bg-paper"
                        }`}
                      >
                        <input
                          type="radio"
                          name={`q${i}`}
                          value={n}
                          checked={selected}
                          disabled={locked}
                          onChange={() => pick(n)}
                          className="sr-only"
                        />
                        <span
                          aria-hidden
                          className={`grid h-9 w-9 shrink-0 place-items-center rounded-full border-[3px] border-ink text-sm font-bold ${
                            selected ? "bg-ink text-sun" : "bg-paper"
                          }`}
                        >
                          {LETTERS[n]}
                        </span>
                        <span className="flex-1 text-base font-medium sm:text-lg">{opt}</span>
                        {selected && (
                          <svg viewBox="0 0 20 20" className="h-6 w-6 shrink-0" aria-hidden>
                            <path d="M4 10.5 8.5 15 16 5.5" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </label>
                    );
                  })}
                </div>
              </div>
            </Card>
            <div className="mt-5 hidden items-center justify-between lg:flex">
              <Button variant="ghost" disabled={i === 0} onClick={() => setI(i - 1)}>
                ← Previous
              </Button>
              <Button variant="ghost" disabled={last} onClick={() => setI(i + 1)}>
                Next →
              </Button>
            </div>
          </div>

          <aside className="mt-6 space-y-5 lg:sticky lg:top-24 lg:mt-0" aria-label="Quiz progress">
            <Card tone="paper" className="p-4">
              <div className="flex items-center justify-between gap-2">
                <Label>All questions</Label>
                <span
                  className={`text-xs font-bold uppercase ${sync === "offline" ? "text-signal" : sync === "saving" ? "text-ink/70" : "text-leaf"}`}
                >
                  {sync === "offline" ? "Offline · retrying" : sync === "saving" ? "Saving…" : "Saved"}
                </span>
              </div>
              <p className="sr-only" aria-live="polite">
                {sync === "offline" ? "Connection lost. Your answers are kept and will be saved when you are back online." : ""}
              </p>
              <ul className="mt-3 grid grid-cols-5 gap-2">
                {initial.questions.map((_, n) => {
                  const has = answers[n] !== undefined;
                  return (
                    <li key={n}>
                      <button
                        onClick={() => setI(n)}
                        aria-label={`Question ${n + 1}, ${has ? "answered" : "not answered"}`}
                        aria-current={n === i ? "step" : undefined}
                        className={`relative min-h-12 w-full rounded-lg border-[3px] border-ink text-sm font-bold tabular-nums ${
                          n === i ? "bg-blue text-white shadow-[2px_2px_0_var(--color-ink)]" : has ? "bg-sun" : "bg-white"
                        }`}
                      >
                        {n + 1}
                        {has && <span className="absolute right-1 top-1 h-2 w-2 rounded-full border-2 border-ink bg-ink" aria-hidden />}
                      </button>
                    </li>
                  );
                })}
              </ul>
              <p className="mt-3 text-sm font-semibold">
                {answered}/{total} answered
              </p>
            </Card>

            <div ref={confirmBox}>
              {confirming ? (
                <Card tone="white" className="space-y-3 p-4">
                  <p className="font-medium">
                    Hand in now? You have answered <b>{answered}</b> of {total}. You can&apos;t change answers after this.
                  </p>
                  <div className="flex gap-3">
                    <Button variant="danger" onClick={() => void finish()} disabled={locked} className="flex-1 px-3">
                      {finishing ? "Submitting…" : "Yes, submit"}
                    </Button>
                    <Button variant="ghost" onClick={() => setConfirming(false)} disabled={locked} className="flex-1 px-3">
                      Back
                    </Button>
                  </div>
                </Card>
              ) : (
                <Button className="w-full" onClick={openConfirm} disabled={locked}>
                  Submit quiz
                </Button>
              )}
            </div>
          </aside>
        </div>
      </div>

      <nav
        aria-label="Question navigation"
        className="fixed inset-x-0 bottom-0 z-20 flex gap-3 border-t-[3px] border-ink bg-paper px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:hidden"
      >
        <Button variant="ghost" className="flex-1 px-3" disabled={i === 0} onClick={() => setI(i - 1)}>
          ← Prev
        </Button>
        {last ? (
          <Button className="flex-1 px-3" disabled={locked} onClick={openConfirm}>
            Review &amp; submit
          </Button>
        ) : (
          <Button className="flex-1 px-3" onClick={() => setI(i + 1)}>
            Next →
          </Button>
        )}
      </nav>
    </div>
  );
}
