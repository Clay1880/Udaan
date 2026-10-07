"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Cloud, Jet, Sparkle } from "@/components/art";
import { Button, Card, Label, Stage, Tag } from "@/components/ui";
import { LoadErrorPanel, LoadingPanel } from "@/components/page-state";
import { Runner } from "@/components/quiz/runner";
import { SiteHeader } from "@/components/site-header";
import { QUIZ } from "@/lib/config";
import { ApiError, QUIZ_START_TIMEOUT_MS } from "@/lib/client/api";
import { windowMessage } from "@/lib/client/format";
import { useWindowBoundary } from "@/lib/client/use-window-boundary";
import { useRequireMe } from "@/lib/client/use-me";
import type { AttemptView } from "@/lib/quiz/service";

type Phase = "loading" | "load-error" | "intro" | "starting" | "run" | "done";

const ghostLink =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border-[3px] border-ink bg-white px-6 text-lg font-semibold shadow-[4px_4px_0_var(--color-ink)]";

const RULES = [
  `${QUIZ.questionCount} multiple-choice questions on the Indian Air Force`,
  `${QUIZ.durationMs / 60000} minutes. The clock starts when you press start`,
  "One attempt only. If you reload, you continue where you left off",
  "The timer keeps running even if you close the page",
];

export default function QuizPage() {
  const { me, error: meError, call, refresh } = useRequireMe(true);
  const [phase, setPhase] = useState<Phase>("loading");
  const [view, setView] = useState<AttemptView | null>(null);
  const [error, setError] = useState("");
  const starting = useRef(false);
  // Unlock (or lock) at the window boundary without a reload.
  useWindowBoundary(me, refresh);

  const load = useCallback(async () => {
    setPhase("loading");
    setError("");
    try {
      const v = await call<AttemptView>("/api/quiz/attempt");
      setView(v);
      setPhase(v.status === "submitted" ? "done" : "run");
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) return setPhase("intro");
      setError(e instanceof Error ? e.message : "Could not load the quiz.");
      setPhase("load-error");
    }
  }, [call]);

  // Stable, so the runner's finish/retry timers aren't rebuilt on every render.
  const onDone = useCallback(
    (v: AttemptView) => {
      setView(v);
      setPhase("done");
      window.scrollTo({ top: 0 });
      void refresh().catch(() => {});
    },
    [refresh],
  );

  const hasMe = me !== null;
  useEffect(() => {
    if (hasMe) void load();
  }, [hasMe, load]);

  async function start() {
    if (starting.current) return; // double-tap guard (the server dedupes too)
    starting.current = true;
    setPhase("starting");
    setError("");
    try {
      const v = await call<AttemptView>("/api/quiz/start", { method: "POST", timeoutMs: QUIZ_START_TIMEOUT_MS });
      setView(v);
      setPhase(v.status === "submitted" ? "done" : "run");
      void refresh().catch(() => {});
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start the quiz.");
      setPhase("intro");
    } finally {
      starting.current = false;
    }
  }

  if (!me) {
    return (
      <>
        <SiteHeader />
        <main className="mx-auto max-w-5xl px-4 pb-8 pt-12 sm:px-6 sm:pt-20">
          {meError ? <LoadErrorPanel error={meError} onRetry={refresh} /> : <LoadingPanel text="Loading your quiz…" />}
        </main>
      </>
    );
  }

  if (phase === "run" && view) {
    return (
      <>
        <SiteHeader isAdmin={me.isAdmin} />
        <h1 className="sr-only">Air Force Quiz</h1>
        <Runner initial={view} call={call} onDone={onDone} />
      </>
    );
  }

  if (phase === "loading") {
    return (
      <>
        <SiteHeader isAdmin={me.isAdmin} />
        <main className="mx-auto max-w-5xl px-4 pb-8 pt-12 sm:px-6 sm:pt-20">
          <LoadingPanel text="Loading your quiz…" />
        </main>
      </>
    );
  }

  if (phase === "load-error") {
    return (
      <>
        <SiteHeader isAdmin={me.isAdmin} />
        <main className="mx-auto max-w-5xl px-4 pb-8 pt-12 sm:px-6 sm:pt-20">
          <LoadErrorPanel error={new Error(error)} onRetry={load} />
        </main>
      </>
    );
  }

  const open = me.window.state === "open";
  return (
    <>
      <SiteHeader isAdmin={me.isAdmin} />
      <main className="mx-auto max-w-5xl px-4 pb-8 pt-12 sm:px-6 sm:pt-20">
        <section className="grid-panel fade-up relative px-4 pb-8 sm:px-10 sm:pb-10">
          <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
            <span className="dot -left-5 top-[52%] h-12 w-12 sm:h-16 sm:w-16" />
            <span className="dot -bottom-5 right-[14%] h-10 w-10" />
            <Cloud className="absolute -right-6 top-[18%] w-20 sm:w-28" />
          </div>

          <div className="relative">
            <div className="relative -mt-[0.62em] inline-block text-[clamp(3rem,15vw,6rem)]">
              <h1 className="bubble text-sun">{phase === "done" ? "Done!" : "Quiz!"}</h1>
              <Sparkle className="absolute -left-[0.2em] -top-[0.2em] h-[0.4em] w-[0.4em]" />
            </div>
            <Jet className="absolute -top-2 right-0 hidden w-20 rotate-[18deg] sm:block lg:w-24" />

            {phase === "done" && view ? (
              <Card className="fade-up relative mt-10 max-w-xl p-6 text-center sm:p-8" tilt={-1}>
                <Tag tone="green" tilt={-3} className="absolute -top-5 left-5">
                  Submitted
                </Tag>
                <Label>Your attempt</Label>
                <p className="mt-5 text-lg font-semibold">
                  You answered {Object.keys(view.answers).length} of {view.total} questions.
                </p>
                <p className="mt-1 font-medium opacity-80">Your attempt is recorded and results will be announced later. Thank you for flying with us!</p>
                <Link href="/dashboard" className={`${ghostLink} mt-6 w-full sm:w-auto`}>
                  ← Back to dashboard
                </Link>
              </Card>
            ) : (
              <Card className="mt-10 max-w-xl p-5 sm:p-8">
                <Label>Before you start</Label>
                <ul className="mt-3 space-y-2.5 text-lg font-medium">
                  {RULES.map((t) => (
                    <li key={t} className="flex items-start gap-2.5">
                      <Sparkle className="mt-1.5 h-4 w-4 shrink-0" />
                      {t}
                    </li>
                  ))}
                </ul>
                <Tag tone={open ? "sun" : me.window.state === "before" ? "white" : "red"} tilt={-2} className="mt-5">
                  {windowMessage(me.window)}
                </Tag>
                {error && (
                  <p role="alert" className="mt-5 font-semibold text-signal">
                    {error}
                  </p>
                )}
                <div className="mt-6">
                  <Button className="w-full sm:w-auto" disabled={!open || phase !== "intro"} onClick={start}>
                    {phase === "starting" ? "Preparing your questions…" : open ? "Start quiz →" : "Locked"}
                  </Button>
                  {phase === "starting" && (
                    <p role="status" className="mt-3 text-sm font-medium opacity-80">
                      This can take a few seconds. Your {QUIZ.durationMs / 60000} minutes start once the questions are ready.
                    </p>
                  )}
                </div>
              </Card>
            )}
          </div>
        </section>
      </main>
    </>
  );
}
