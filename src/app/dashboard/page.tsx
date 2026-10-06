"use client";
import Link from "next/link";
import { Card, Label, Stage, Tag, type Tone } from "@/components/ui";
import { Cloud, Jet, Sparkle } from "@/components/art";
import { SiteHeader } from "@/components/site-header";
import { LoadErrorPanel, LoadingPanel } from "@/components/page-state";
import { BRANCH_LABELS, POSTER, QUIZ } from "@/lib/config";
import { formatIst, windowMessage } from "@/lib/client/format";
import { useRequireMe, type Me } from "@/lib/client/use-me";

interface Status {
  tone: Tone;
  text: string;
  /** Null when the card is locked: nothing to do on that page yet (or any more). */
  cta: string | null;
  lockNote?: string;
}

const UNLOCKS = "Unlocks when the window opens";
const CLOSED = "The window has closed";

function quizStatus(me: Me): Status {
  const { attempt, window: w } = me;
  if (attempt?.status === "submitted") {
    return { tone: "green", text: `Done · ${attempt.score ?? "–"}/${QUIZ.questionCount}`, cta: "See your result" };
  }
  if (attempt) {
    return w.state === "open"
      ? { tone: "sun", text: "In progress", cta: "Resume quiz" }
      : { tone: "white", text: "Time's up", cta: "See your result" };
  }
  if (w.state === "open") return { tone: "sun", text: "Ready to start", cta: "Start quiz" };
  if (w.state === "before") return { tone: "white", text: windowMessage(w), cta: null, lockNote: UNLOCKS };
  return { tone: "red", text: "Closed · no attempt made", cta: null, lockNote: CLOSED };
}

function posterStatus(me: Me): Status {
  const { poster, window: w } = me;
  if (poster) {
    return {
      tone: "green",
      text: `Submitted · ${formatIst(poster.uploadedAt)}`,
      cta: w.state === "open" ? "View or replace" : "View your poster",
    };
  }
  if (w.state === "open") return { tone: "sun", text: "Waiting for your poster", cta: "Upload poster" };
  if (w.state === "before") return { tone: "white", text: windowMessage(w), cta: null, lockNote: UNLOCKS };
  return { tone: "red", text: "Closed · nothing submitted", cta: null, lockNote: CLOSED };
}

function LockIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4 shrink-0" aria-hidden>
      <rect x="2.5" y="7" width="11" height="7.5" rx="1.5" fill="currentColor" />
      <path d="M5 7V5a3 3 0 0 1 6 0v2" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function CompetitionCard({
  no,
  title,
  lines,
  href,
  status,
  tilt,
  numTone,
}: {
  no: string;
  title: string;
  lines: string[];
  href: string;
  status: Status;
  tilt: number;
  numTone: string;
}) {
  const locked = status.cta === null;
  const body = (
    <Card tone={locked ? "paper" : "white"} tilt={tilt} className="relative h-full p-5 sm:p-7">
      <span className={`bubble absolute -top-6 right-5 text-5xl ${numTone}`} aria-hidden>
        {no}
      </span>
      <Label>Competition {no}</Label>
      <h2 className="mt-2 font-display text-2xl leading-tight sm:text-3xl">{title}</h2>
      <ul className="mt-3 space-y-1.5 font-medium">
        {lines.map((l) => (
          <li key={l} className="flex items-center gap-2.5">
            <Sparkle className="h-4 w-4 shrink-0" />
            {l}
          </li>
        ))}
      </ul>
      <Tag tone={status.tone} className="mt-5">
        <span className="inline-flex items-center gap-1.5">
          {locked && <LockIcon />}
          {status.text}
        </span>
      </Tag>
      {status.cta ? (
        <span className="mt-5 flex min-h-12 items-center justify-between rounded-xl border-[3px] border-ink bg-sun px-5 text-lg font-semibold shadow-[4px_4px_0_var(--color-ink)]">
          {status.cta}
          <span aria-hidden>→</span>
        </span>
      ) : (
        <p className="mt-5 flex min-h-12 items-center rounded-xl border-[3px] border-dashed border-ink/60 px-5 font-semibold">
          {status.lockNote}
        </p>
      )}
    </Card>
  );
  if (locked) return body;
  return (
    <Link href={href} className="block rounded-[18px] hover:-translate-y-1">
      {body}
    </Link>
  );
}

export default function Dashboard() {
  const { me, error, refresh } = useRequireMe(true);

  if (!me) {
    return (
      <>
        <SiteHeader />
        <main className="mx-auto max-w-5xl px-4 pb-8 pt-12 sm:px-6 sm:pt-20">
          {error ? <LoadErrorPanel error={error} onRetry={refresh} /> : <LoadingPanel text="Loading your dashboard…" />}
        </main>
      </>
    );
  }

  const p = me.profile!; // useRequireMe(true) only returns `me` once a profile exists
  const firstName = p.name.trim().split(/\s+/)[0];
  const w = me.window;
  const windowTag: { tone: Tone; text: string } =
    w.state === "open"
      ? { tone: "sun", text: windowMessage(w) }
      : w.state === "before"
        ? { tone: "white", text: windowMessage(w) }
        : { tone: "red", text: windowMessage(w) };

  return (
    <>
      <SiteHeader isAdmin={me.isAdmin} />
      <main className="mx-auto max-w-5xl px-4 pb-8 pt-12 sm:px-6 sm:pt-20">
        <section className="grid-panel fade-up relative px-4 pb-8 sm:px-10 sm:pb-10">
          <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
            <span className="dot -left-5 top-[46%] h-12 w-12 sm:h-16 sm:w-16" />
            <span className="dot -bottom-5 right-[18%] h-10 w-10" />
            <Cloud className="absolute -right-6 top-[14%] w-20 sm:w-28" />
          </div>

          <div className="relative">
            <div className="relative -mt-[0.62em] inline-block max-w-full text-[clamp(2.6rem,12vw,5.5rem)]">
              <h1 className="bubble break-words text-sun">Hi {firstName}!</h1>
              <Sparkle className="absolute -left-[0.2em] -top-[0.2em] h-[0.4em] w-[0.4em]" />
            </div>
            <Jet className="absolute -top-2 right-0 hidden w-20 rotate-[18deg] sm:block lg:w-24" />

            <ul className="mt-5 flex flex-wrap gap-2.5" aria-label="Your details">
              <li>
                <Tag tone="white">{p.year}</Tag>
              </li>
              <li>
                <Tag tone="white">{BRANCH_LABELS[p.branch]}</Tag>
              </li>
              <li>
                <Tag tone="white">Roll {p.rollNo}</Tag>
              </li>
            </ul>
            <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2">
              <p className="ink-edge text-lg font-semibold sm:text-xl">Competition window</p>
              <Tag tone={windowTag.tone} tilt={-2}>
                {windowTag.text}
              </Tag>
            </div>

            <div className="mt-12 grid gap-10 sm:gap-8 md:grid-cols-2">
              <CompetitionCard
                no="01"
                title="Air Force Quiz"
                numTone="text-bubble"
                tilt={-1}
                href="/quiz"
                lines={[`${QUIZ.questionCount} questions`, `${QUIZ.durationMs / 60000} minutes`, "One attempt only"]}
                status={quizStatus(me)}
              />
              <CompetitionCard
                no="02"
                title="Poster Making"
                numTone="text-sun"
                tilt={1}
                href="/poster"
                lines={["PDF, JPG or PNG", `Up to ${POSTER.maxBytes / (1024 * 1024)} MB`, "Replace until the window closes"]}
                status={posterStatus(me)}
              />
            </div>
          </div>
        </section>

        {!me.attempt && (
          <div className="fade-up mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4" style={{ animationDelay: "0.15s" }}>
            <p className="font-medium">Need to fix your details? They lock once you start the quiz.</p>
            <Link
              href="/register"
              className="inline-flex min-h-12 items-center justify-center rounded-xl border-[3px] border-ink bg-white px-5 font-semibold shadow-[4px_4px_0_var(--color-ink)]"
            >
              Edit profile
            </Link>
          </div>
        )}
      </main>
    </>
  );
}
