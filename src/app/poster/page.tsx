"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Cloud, Lock, Palette, Sparkle } from "@/components/art";
import { Button, Card, Label, Tag } from "@/components/ui";
import { LoadErrorPanel, LoadingPanel } from "@/components/page-state";
import { SiteHeader } from "@/components/site-header";
import { ApiError } from "@/lib/client/api";
import { formatIst, windowMessage } from "@/lib/client/format";
import { useWindowBoundary } from "@/lib/client/use-window-boundary";
import { useRequireMe } from "@/lib/client/use-me";
import { POSTER } from "@/lib/config";
import { checkPosterFile, POSTER_EXT, putFile, UploadError, type PosterType, type Upload } from "@/lib/poster/client";

interface Current {
  uploadedAt: number;
  fileType: string;
  url: string;
}
interface Picked {
  file: File;
  type: PosterType;
  preview: string | null;
}
type Phase = "idle" | "uploading" | "confirming";

const MAX_MB = POSTER.maxBytes / (1024 * 1024);
/** Signed links from /api/poster last 15 minutes; fetch a fresh one well before that. */
const URL_REFRESH_MS = 10 * 60 * 1000;

const ghostLink =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border-[3px] border-ink bg-white px-6 text-lg font-semibold shadow-[4px_4px_0_var(--color-ink)]";

const sizeText = (b: number) => (b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`);
const extLabel = (type: string) => (POSTER_EXT[type as PosterType] ?? "file").toUpperCase();

/** Big tile standing in for a PDF (or an image that won't load). */
function FileTile({ type, name }: { type: string; name?: string }) {
  return (
    <div className="flex min-h-40 flex-col items-center justify-center gap-2 rounded-xl border-[3px] border-ink bg-paper p-4 text-center">
      <span className="rounded-lg border-[3px] border-ink bg-signal px-3 py-1 font-display text-xl text-white shadow-[3px_3px_0_var(--color-ink)]">
        {extLabel(type)}
      </span>
      {name && <span className="max-w-full break-all text-sm font-semibold">{name}</span>}
    </div>
  );
}

export default function PosterPage() {
  const { me, error: meError, call, refresh, user } = useRequireMe(true);
  const [current, setCurrent] = useState<Current | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [loadError, setLoadError] = useState("");
  const [picked, setPicked] = useState<Picked | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [spoken, setSpoken] = useState("");
  const [error, setError] = useState("");
  const [justDone, setJustDone] = useState(false);
  const [drag, setDrag] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const task = useRef<Upload | null>(null);
  const loadedAt = useRef(0);
  /** An upload that reached Drive but whose confirm call failed: retry the confirm, don't re-upload. */
  const uploaded = useRef<{ file: File; path: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await call<{ poster: Current | null }>("/api/poster");
      setCurrent(r.poster);
      setImgFailed(false);
      loadedAt.current = Date.now();
      setLoadState("ready");
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Could not load your poster.");
      setLoadState("error");
      throw e;
    }
  }, [call]);

  const hasMe = me !== null;
  useEffect(() => {
    if (hasMe) void load().catch(() => {});
  }, [hasMe, load]);

  // Signed links expire: refresh when the student comes back to a tab that has sat for a while.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible" && loadedAt.current && Date.now() - loadedAt.current > URL_REFRESH_MS) {
        void load().catch(() => {});
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [load]);

  // Flip between locked / open / closed when the window boundary passes while the page is open.
  useWindowBoundary(me, refresh, "posterWindow");

  useEffect(() => () => {
    if (picked?.preview) URL.revokeObjectURL(picked.preview);
  }, [picked]);

  // Leaving mid-upload would lose it: warn, and cancel the task if the page goes away anyway.
  useEffect(() => {
    if (phase === "idle") return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [phase]);
  useEffect(
    () => () => {
      task.current?.abort();
    },
    [],
  );

  function choose(f: File | undefined) {
    setError("");
    setJustDone(false);
    if (!f) return;
    const check = checkPosterFile(f);
    if (!check.ok) {
      setPicked(null);
      setError(check.message);
      return;
    }
    setPicked({ file: f, type: check.type, preview: check.type.startsWith("image/") ? URL.createObjectURL(f) : null });
    setSpoken(`${f.name} selected, ${sizeText(f.size)}. Press ${current ? "Replace poster" : "Submit poster"} to upload.`);
  }

  function clearPick() {
    setPicked(null);
    if (input.current) input.current.value = "";
  }

  async function upload() {
    if (!picked || !user || phase !== "idle") return;
    setError("");
    setJustDone(false);
    const prior = uploaded.current;
    let path = prior && prior.file === picked.file ? prior.path : null;
    try {
      if (!path) {
        setPhase("uploading");
        setProgress(0);
        setSpoken("Uploading your poster.");
        const { uploadUrl } = await call<{ uploadUrl: string }>("/api/poster/start", {
          method: "POST",
          body: { type: picked.type, size: picked.file.size },
        });
        let lastSpoken = 0;
        const up = putFile(uploadUrl, picked.file, picked.type, (pct) => {
          setProgress(pct);
          // Announce in quarters so screen readers aren't flooded.
          const step = Math.floor(pct / 25) * 25;
          if (step > lastSpoken && step < 100) {
            lastSpoken = step;
            setSpoken(`Uploaded ${step} percent.`);
          }
        });
        task.current = up;
        const fresh = await up.done;
        task.current = null;
        uploaded.current = { file: picked.file, path: fresh };
        path = fresh;
      }
      setPhase("confirming");
      setProgress(100);
      setSpoken("Upload finished. Checking your file.");
      await call("/api/poster/confirm", { method: "POST", body: { path } });
      uploaded.current = null;
      clearPick();
      setJustDone(true);
      setSpoken("Poster submitted.");
      await Promise.all([load(), refresh()]).catch(() => {});
    } catch (e) {
      task.current = null;
      let msg: string;
      if (e instanceof ApiError) {
        msg = e.message;
        // The server rejected (and removed) the file: the next try must upload afresh.
        if (e.status >= 400 && e.status < 500) uploaded.current = null;
        if (e.code === "WINDOW_CLOSED" || e.code === "WINDOW_NOT_OPEN") void refresh().catch(() => {});
      } else if (e instanceof UploadError) {
        msg = "The upload stopped. Check your connection and try again.";
      } else {
        msg = path && uploaded.current ? "Your file is uploaded but we couldn't confirm it. Press the button again to finish." : "Something went wrong. Check your connection and try again.";
      }
      setError(msg);
      setSpoken("");
    } finally {
      setPhase("idle");
    }
  }

  if (!me) {
    return (
      <>
        <SiteHeader />
        <main className="mx-auto max-w-5xl px-4 pb-8 pt-12 sm:px-6 sm:pt-20">
          {meError ? <LoadErrorPanel error={meError} onRetry={refresh} /> : <LoadingPanel text="Loading your poster…" />}
        </main>
      </>
    );
  }

  if (loadState !== "ready") {
    return (
      <>
        <SiteHeader isAdmin={me.isAdmin} />
        <main className="mx-auto max-w-5xl px-4 pb-8 pt-12 sm:px-6 sm:pt-20">
          {loadState === "error" ? (
            <LoadErrorPanel error={new Error(loadError)} onRetry={load} />
          ) : (
            <LoadingPanel text="Loading your poster…" />
          )}
        </main>
      </>
    );
  }

  const w = me.posterWindow;
  const busy = phase !== "idle";
  const windowTone = w.state === "open" ? "sun" : w.state === "before" ? "white" : "red";

  const entry = current && (
    <Card tilt={-1} className="relative p-5 sm:p-7">
      <Tag tone="green" tilt={-3} className="absolute -top-5 left-5">
        Submitted
      </Tag>
      <Label className="mt-2">{w.state === "closed" ? "Your final entry" : "Your entry"}</Label>
      <p className="mt-1 font-semibold">
        {formatIst(current.uploadedAt)} · {extLabel(current.fileType)}
      </p>
      <div className="mt-4">
        {current.fileType.startsWith("image/") && !imgFailed ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={current.url}
            alt="Your submitted poster"
            onError={() => setImgFailed(true)}
            className="max-h-[28rem] w-full rounded-xl border-[3px] border-ink bg-paper object-contain"
          />
        ) : (
          <FileTile type={current.fileType} />
        )}
      </div>
      <a href={current.url} target="_blank" rel="noreferrer" className={`${ghostLink} mt-5 w-full sm:w-auto`}>
        Open full size<span className="sr-only"> (opens in a new tab)</span> <span aria-hidden>↗</span>
      </a>
      {justDone && (
        <p className="mt-4 font-semibold text-leaf">
          Got it! {w.state === "open" ? `You can replace it until ${formatIst(w.closeAt - 1)}.` : ""}
        </p>
      )}
    </Card>
  );

  // Beside an empty upload card: the three steps, so the page explains itself before anything is picked.
  const steps = !current && w.state === "open" && (
    <Card tone="paper" tilt={1} className="order-last p-5 sm:p-7 md:order-none">
      <Label>How it works</Label>
      <ol className="mt-3 space-y-3 text-lg font-medium">
        {[
          `Save your poster as a PDF, JPG or PNG under ${MAX_MB} MB.`,
          "Pick the file and press Submit poster.",
          `Changed your mind? Upload again to replace it, until ${formatIst(w.closeAt - 1)}.`,
        ].map((t, i) => (
          <li key={i} className="flex items-start gap-3">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border-[3px] border-ink bg-sun font-display text-sm" aria-hidden>
              {i + 1}
            </span>
            {t}
          </li>
        ))}
      </ol>
    </Card>
  );

  let action: React.ReactNode;
  if (w.state === "before") {
    action = (
      <Card tone="paper" className="p-5 sm:p-8">
        <Tag tone="white">
          <span className="inline-flex items-center gap-1.5">
            <Lock /> Locked
          </span>
        </Tag>
        <h2 className="mt-4 font-display text-2xl leading-tight sm:text-3xl">Uploads open soon</h2>
        <p className="mt-2 text-lg font-medium">
          You can submit from <b>{formatIst(w.openAt)}</b> until <b>{formatIst(w.closeAt - 1)}</b>.
        </p>
        <p className="mt-4 rounded-xl border-[3px] border-dashed border-ink/60 px-4 py-3 font-medium">
          Start designing now: PDF, JPG or PNG, up to {MAX_MB} MB.
        </p>
      </Card>
    );
  } else if (w.state === "closed") {
    action = current ? (
      <Card tone="paper" className="p-5 sm:p-7">
        <Label className="inline-flex items-center gap-1.5">
          <Lock /> View only
        </Label>
        <h2 className="mt-3 font-display text-2xl leading-tight sm:text-3xl">That&apos;s a wrap</h2>
        <p className="mt-2 text-lg font-medium">Your poster is in and can no longer be changed. Thanks for taking part!</p>
      </Card>
    ) : (
      <Card tone="paper" className="p-5 sm:p-8">
        <Label className="inline-flex items-center gap-1.5">
          <Lock /> Closed
        </Label>
        <h2 className="mt-3 font-display text-2xl leading-tight sm:text-3xl">No poster was submitted</h2>
        <p className="mt-2 text-lg font-medium">The poster window ran from {formatIst(w.openAt)} to {formatIst(w.closeAt - 1)}.</p>
      </Card>
    );
  } else {
    const verb = current ? "Replace" : "Submit";
    action = (
      <Card className="p-5 sm:p-7">
        <Label>{current ? "Replace your poster" : "Upload your poster"}</Label>
        {current && <p className="mt-1 font-medium">Uploading a new file swaps out the old one.</p>}

        <label
          onDragOver={(e) => {
            e.preventDefault();
            if (!busy) setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            if (!busy) choose(e.dataTransfer.files[0]);
          }}
          className={`mt-4 flex min-h-44 w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-[3px] border-dashed border-ink px-4 py-6 text-center has-[:focus-visible]:outline has-[:focus-visible]:outline-[3px] has-[:focus-visible]:outline-offset-[3px] has-[:focus-visible]:outline-ink ${
            busy ? "cursor-not-allowed opacity-60" : drag ? "bg-sun" : "bg-paper hover:bg-sun/30"
          }`}
        >
          <input
            ref={input}
            type="file"
            accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png"
            disabled={busy}
            aria-describedby="poster-rules"
            className="sr-only"
            onChange={(e) => choose(e.target.files?.[0])}
          />
          <Sparkle className="h-9 w-9" />
          <span className="text-2xl font-bold">{picked ? "Choose a different file" : "Tap to choose a file"}</span>
          <span id="poster-rules" className="text-sm font-medium">
            <span className="hidden sm:inline">or drop it here · </span>PDF, JPG or PNG · up to {MAX_MB} MB
          </span>
        </label>

        {picked && (
          <div className="mt-5 space-y-4">
            {picked.preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={picked.preview} alt="Preview of the file you picked" className="max-h-72 w-full rounded-xl border-[3px] border-ink bg-paper object-contain" />
            ) : (
              <FileTile type={picked.type} />
            )}
            <p className="break-all font-semibold">
              {picked.file.name} <span className="opacity-70">· {sizeText(picked.file.size)}</span>
            </p>

            {busy && (
              <div>
                <div className="flex items-center justify-between text-sm font-bold">
                  <span>{phase === "uploading" ? "Uploading" : "Checking your file"}</span>
                  <span aria-hidden>{progress}%</span>
                </div>
                <div
                  role="progressbar"
                  aria-label="Upload progress"
                  aria-valuenow={progress}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  className="mt-1.5 h-5 w-full overflow-hidden rounded-full border-[3px] border-ink bg-white"
                >
                  <div className="h-full bg-leaf transition-[width] duration-300" style={{ width: `${progress}%` }} />
                </div>
              </div>
            )}

            <div className="flex flex-col gap-3 sm:flex-row">
              <Button onClick={upload} disabled={busy} className="w-full sm:w-auto">
                {phase === "uploading" ? `Uploading ${progress}%` : phase === "confirming" ? "Checking…" : `${verb} poster`}
              </Button>
              {!busy && (
                <Button variant="ghost" onClick={clearPick} className="w-full sm:w-auto">
                  Cancel
                </Button>
              )}
            </div>
          </div>
        )}
        {error && (
          <p role="alert" className="mt-4 rounded-xl border-[3px] border-signal bg-white px-4 py-3 font-semibold text-signal">
            {error}
          </p>
        )}
      </Card>
    );
  }

  return (
    <>
      <SiteHeader isAdmin={me.isAdmin} />
      <main className="mx-auto max-w-5xl px-4 pb-8 pt-12 sm:px-6 sm:pt-20">
        <section className="grid-panel fade-up relative px-4 pb-8 sm:px-10 sm:pb-10">
          <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
            <span className="dot -left-5 top-[40%] h-12 w-12 sm:h-16 sm:w-16" />
            <span className="dot -bottom-5 right-[16%] h-10 w-10" />
            <Cloud className="absolute -right-6 top-[22%] w-20 sm:hidden" />
            <Cloud className="absolute bottom-[10%] left-[44%] hidden w-28 md:block" fill="#f27fb5" />
          </div>

          <div className="relative">
            <div className="relative -mt-[0.62em] inline-block text-[clamp(3rem,15vw,6rem)]">
              <h1 className="bubble text-sun">Poster!</h1>
              <Sparkle className="absolute -left-[0.2em] -top-[0.2em] h-[0.4em] w-[0.4em]" />
            </div>
            <Palette className="absolute -top-6 right-0 hidden w-28 rotate-[8deg] sm:block lg:w-32" />

            <p className="ink-edge mt-4 max-w-lg text-lg font-semibold leading-snug sm:text-xl">
              Draw, paint or design a poster on the Indian Air Force. One entry each.
            </p>
            <Tag tone={windowTone} tilt={-2} className="mt-4">
              {windowMessage(w)}
            </Tag>

            <div className={`mt-12 grid items-start gap-10 ${entry || steps ? "md:grid-cols-2 md:gap-8" : "max-w-xl"}`}>
              {entry}
              {action}
              {steps}
            </div>
          </div>
        </section>

        <p role="status" aria-live="polite" className="sr-only">
          {spoken}
        </p>

        <div className="fade-up mt-8" style={{ animationDelay: "0.15s" }}>
          <Link href="/dashboard" className={`${ghostLink} w-full sm:w-auto`}>
            ← Back to dashboard
          </Link>
        </div>
      </main>
    </>
  );
}
