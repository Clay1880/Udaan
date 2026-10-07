"use client";
import JSZip from "jszip";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Cloud, Lock, Sparkle } from "@/components/art";
import { Button, Card, Field, Label, Tag, inputClass, type Tone } from "@/components/ui";
import { LoadErrorPanel, LoadingPanel } from "@/components/page-state";
import { SiteHeader } from "@/components/site-header";
import { adminCsv, FILE_EXT, filterRows, posterFileName, formatDuration, quizLabel, rankRows, sortByScore, summarise, type AdminRow } from "@/lib/admin/rows";
import { ApiError } from "@/lib/client/api";
import { formatIst } from "@/lib/client/format";
import { useRequireMe } from "@/lib/client/use-me";
import { BRANCHES, BRANCH_LABELS, YEARS } from "@/lib/config";
import type { EventSettings, Mode } from "@/lib/event-mode";

type Tab = "participants" | "quiz" | "posters";
const TABS: { id: Tab; label: string }[] = [
  { id: "participants", label: "Participants" },
  { id: "quiz", label: "Quiz scores" },
  { id: "posters", label: "Posters" },
];
/** Poster links are signed for an hour; refetch before they lapse. */
const STALE_MS = 45 * 60 * 1000;
const ZIP_PARALLEL = 4;

const ghostLink =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border-[3px] border-ink bg-white px-4 font-semibold shadow-[3px_3px_0_var(--color-ink)]";

function saveBlob(blob: Blob, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 30_000);
}

const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }); // YYYY-MM-DD

function QuizCell({ r }: { r: AdminRow }) {
  const label = quizLabel(r);
  const tone: Tone = !r.quiz ? "paper" : r.quiz.status === "submitted" ? "sun" : "white";
  return (
    <span className={`inline-block whitespace-nowrap rounded-full border-2 border-ink px-2.5 py-0.5 text-sm font-bold ${tone === "sun" ? "bg-sun" : tone === "white" ? "bg-white" : "bg-paper opacity-70"}`}>
      {label}
    </span>
  );
}

function Stat({ n, label, tone, tilt }: { n: number; label: string; tone: Tone; tilt: number }) {
  return (
    <Card tone={tone} tilt={tilt} className="px-4 py-3">
      <p className="font-display text-3xl leading-none sm:text-4xl">{n}</p>
      <p className="mt-1 text-sm font-semibold leading-tight">{label}</p>
    </Card>
  );
}

const th = "whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.14em]";
const td = "px-4 py-3 align-middle";

const MODE_OPTIONS: { id: Mode; label: string; hint: string }[] = [
  { id: "auto", label: "Auto", hint: "follows the event dates" },
  { id: "open", label: "Open", hint: "open now, whatever the date" },
  { id: "closed", label: "Closed", hint: "closed now, whatever the date" },
];

function EventControls({
  settings,
  busy,
  onChange,
}: {
  settings: EventSettings;
  busy: boolean;
  onChange: (key: keyof EventSettings, mode: Mode) => void;
}) {
  return (
    <Card className="fade-up mt-8 p-4 sm:p-6" tone="white">
      <Label>Event controls</Label>
      <p className="mt-1 text-sm opacity-75">
        Override the dates to test any time. Set both back to <b>Auto</b> before the real event. Changes apply to students on their next page load.
      </p>
      <div className="mt-4 grid gap-5 sm:grid-cols-2">
        {(["quiz", "poster"] as const).map((key) => (
          <div key={key}>
            <p className="font-display text-lg capitalize">{key}</p>
            <div role="group" aria-label={`${key} window`} className="mt-2 grid grid-cols-3 gap-2">
              {MODE_OPTIONS.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  disabled={busy}
                  aria-pressed={settings[key] === o.id}
                  onClick={() => settings[key] !== o.id && onChange(key, o.id)}
                  className={`min-h-12 rounded-xl border-[3px] border-ink px-2 text-sm font-bold shadow-[3px_3px_0_var(--color-ink)] disabled:opacity-50 sm:text-base ${
                    settings[key] === o.id ? (o.id === "closed" ? "bg-signal text-white" : "bg-sun") : "bg-white"
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
            <p className="mt-2 text-sm opacity-75">{MODE_OPTIONS.find((o) => o.id === settings[key])!.hint}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}

export default function AdminPage() {
  const { me, error: meError, call, refresh } = useRequireMe(false);
  const [rows, setRows] = useState<AdminRow[] | null>(null);
  const [settings, setSettings] = useState<EventSettings | null>(null);
  const [savingMode, setSavingMode] = useState(false);
  const [loadError, setLoadError] = useState<Error | null>(null);
  const [denied, setDenied] = useState(false);
  const [reloading, setReloading] = useState(false);
  const loadedAt = useRef(0);
  const [tab, setTab] = useState<Tab>("participants");
  const [year, setYear] = useState("");
  const [branch, setBranch] = useState("");
  const [q, setQ] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [zip, setZip] = useState<{ done: number; total: number } | null>(null);

  const isAdmin = me?.isAdmin ?? false;

  const load = useCallback(async () => {
    setReloading(true);
    try {
      const r = await call<{ rows: AdminRow[] }>("/api/admin/overview");
      setRows(r.rows);
      setLoadError(null);
      loadedAt.current = Date.now();
      return r.rows;
    } catch (e) {
      if (e instanceof ApiError && e.status === 403) setDenied(true);
      else setLoadError(e instanceof Error ? e : new Error("Could not load the overview."));
      throw e;
    } finally {
      setReloading(false);
    }
  }, [call]);

  useEffect(() => {
    if (isAdmin) void load().catch(() => {});
  }, [isAdmin, load]);

  useEffect(() => {
    if (isAdmin) call<EventSettings>("/api/admin/settings").then(setSettings).catch(() => {});
  }, [isAdmin, call]);

  async function changeMode(key: keyof EventSettings, mode: Mode) {
    setSavingMode(true);
    setError("");
    try {
      setSettings(await call<EventSettings>("/api/admin/settings", { method: "POST", body: { [key]: mode } }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not change the setting.");
    } finally {
      setSavingMode(false);
    }
  }

  // Keep signed poster links fresh while the page stays open.
  useEffect(() => {
    if (!isAdmin) return;
    const check = () => {
      if (document.visibilityState === "visible" && loadedAt.current && Date.now() - loadedAt.current > STALE_MS) void load().catch(() => {});
    };
    const t = setInterval(check, 60_000);
    document.addEventListener("visibilitychange", check);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", check);
    };
  }, [isAdmin, load]);

  const filtered = useMemo(() => filterRows(rows ?? [], { year, branch, q }), [rows, year, branch, q]);
  const [ranked, setRanked] = useState(false);
  const showRank = ranked && tab !== "posters";
  const ordered = useMemo(() => (tab === "quiz" || showRank ? sortByScore(filtered) : filtered), [filtered, tab, showRank]);
  const visible = useMemo(() => (tab === "posters" ? filtered.filter((r) => r.poster) : ordered), [filtered, ordered, tab]);
  const ranks = useMemo(() => rankRows(filtered), [filtered]);
  const stats = useMemo(() => summarise(rows ?? []), [rows]);
  const filteredPosters = useMemo(() => filtered.filter((r) => r.poster), [filtered]);
  const filtering = Boolean(year || branch || q.trim());
  const suffix = [year, branch].filter(Boolean).join("-");

  function exportCsv() {
    setError("");
    const name = `udaan-participants${suffix ? `-${suffix}` : ""}-${today()}.csv`;
    // BOM so Excel opens UTF-8 names correctly.
    saveBlob(new Blob(["﻿" + adminCsv(ordered, showRank)], { type: "text/csv;charset=utf-8" }), name);
    setNotice(`Exported ${filtered.length} ${filtered.length === 1 ? "row" : "rows"} to ${name}.`);
  }

  async function freshRows(): Promise<AdminRow[]> {
    const current = rows ?? [];
    if (Date.now() - loadedAt.current < STALE_MS) return current;
    return load();
  }

  async function downloadOne(r: AdminRow) {
    setError("");
    try {
      const res = await fetch(r.poster!.url);
      if (!res.ok) throw new Error(String(res.status));
      saveBlob(await res.blob(), posterFileName(r, new Set()));
    } catch {
      setError(`Couldn't download ${r.name}'s poster here. Use “Open” instead, or press Refresh and try again.`);
    }
  }

  async function zipPosters() {
    if (zip) return;
    setError("");
    setNotice("");
    try {
      const all = filterRows(await freshRows(), { year, branch, q }).filter((r) => r.poster);
      if (all.length === 0) {
        setNotice("No posters match the current filters.");
        return;
      }
      setZip({ done: 0, total: all.length });
      const z = new JSZip();
      const used = new Set<string>();
      const names = all.map((r) => posterFileName(r, used));
      const failed: string[] = [];
      let next = 0;
      let done = 0;
      const worker = async () => {
        while (next < all.length) {
          const i = next++;
          const r = all[i];
          try {
            const res = await fetch(r.poster!.url);
            if (!res.ok) throw new Error(String(res.status));
            z.file(names[i], await res.blob());
          } catch {
            failed.push(`${r.name} (${r.rollNo})`);
          }
          setZip({ done: ++done, total: all.length });
        }
      };
      await Promise.all(Array.from({ length: Math.min(ZIP_PARALLEL, all.length) }, worker));
      if (failed.length === all.length) throw new Error("none");
      if (failed.length) z.file("_MISSING.txt", `These posters could not be downloaded:\r\n${failed.join("\r\n")}\r\n`);
      // Posters are already compressed images/PDFs: store them as-is, which is much faster.
      const blob = await z.generateAsync({ type: "blob", compression: "STORE" });
      saveBlob(blob, `udaan-posters${suffix ? `-${suffix}` : ""}-${today()}.zip`);
      setNotice(`Zipped ${all.length - failed.length} of ${all.length} posters.`);
      if (failed.length) setError(`${failed.length} could not be downloaded: ${failed.join(", ")}. They are listed in _MISSING.txt inside the zip.`);
    } catch {
      setError("Couldn't download the posters. If this keeps happening, the storage bucket's CORS setting (cors.json) may not be applied yet.");
    } finally {
      setZip(null);
    }
  }

  const shell = (children: React.ReactNode) => (
    <>
      <SiteHeader isAdmin={isAdmin} />
      <main className="mx-auto max-w-6xl px-4 pb-10 pt-12 sm:px-6 sm:pt-20">{children}</main>
    </>
  );

  if (!me) return shell(meError ? <LoadErrorPanel error={meError} onRetry={refresh} /> : <LoadingPanel text="Checking access…" />);

  if (!me.isAdmin || denied) {
    return shell(
      <section className="grid-panel fade-up p-5 sm:p-10">
        <Card className="max-w-xl p-5 sm:p-8">
          <Tag tone="white">
            <span className="inline-flex items-center gap-1.5">
              <Lock /> Organisers only
            </span>
          </Tag>
          <h1 className="mt-4 font-display text-2xl leading-tight sm:text-3xl">This page is for the NSS team.</h1>
          <p className="mt-3 font-medium">
            You&apos;re signed in as <b className="break-all">{me.email}</b>, which isn&apos;t on the organisers&apos; list. If you should have access, ask the
            event coordinator to add your email.
          </p>
          <Link href="/dashboard" className={`${ghostLink} mt-6 w-full px-6 text-lg sm:w-auto`}>
            ← Back to dashboard
          </Link>
        </Card>
      </section>,
    );
  }

  if (!rows) {
    return shell(loadError ? <LoadErrorPanel error={loadError} onRetry={load} /> : <LoadingPanel text="Loading registrations…" />);
  }

  return shell(
    <>
      <section className="grid-panel fade-up relative px-4 pb-8 sm:px-8">
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
          <span className="dot -bottom-5 right-[12%] h-10 w-10" />
          <Cloud className="absolute -right-6 top-6 w-20 sm:w-24" />
        </div>
        <div className="relative">
          <div className="relative -mt-[0.62em] inline-block text-[clamp(2.6rem,11vw,4.5rem)]">
            <h1 className="bubble text-sun">Admin</h1>
            <Sparkle className="absolute -right-[0.35em] -top-[0.15em] h-[0.4em] w-[0.4em]" />
          </div>
          <p className="ink-edge mt-3 text-lg font-semibold sm:text-xl">Udaan 2026 · view and export</p>

          <div className="mt-7 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat n={stats.registered} label="Registered" tone="white" tilt={-1} />
            <Stat n={stats.quizDone} label="Quiz submitted" tone="sun" tilt={1} />
            <Stat n={stats.quizInProgress} label="Quiz in progress" tone="paper" tilt={-0.5} />
            <Stat n={stats.posters} label="Posters in" tone="pink" tilt={1} />
          </div>
        </div>
      </section>

      {settings && <EventControls settings={settings} busy={savingMode} onChange={changeMode} />}

      <Card className="fade-up mt-8 overflow-hidden" tone="white">
        <div className="space-y-5 border-b-[3px] border-ink bg-paper p-4 sm:p-6">
          <div role="group" aria-label="View" className="grid grid-cols-3 gap-2 sm:inline-grid sm:gap-3">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                aria-pressed={tab === t.id}
                onClick={() => setTab(t.id)}
                className={`min-h-12 rounded-xl border-[3px] border-ink px-2 text-sm font-bold shadow-[3px_3px_0_var(--color-ink)] sm:px-5 sm:text-base ${tab === t.id ? "bg-sun" : "bg-white"}`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-[1fr_10rem_14rem_auto] lg:items-end">
            <div className="col-span-2 lg:col-span-1">
              <Field label="Search">
                <input type="search" className={inputClass} placeholder="Name, registration no or email" value={q} onChange={(e) => setQ(e.target.value)} />
              </Field>
            </div>
            <Field label="Year">
              <select className={inputClass} value={year} onChange={(e) => setYear(e.target.value)}>
                <option value="">All years</option>
                {YEARS.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Branch">
              <select className={inputClass} value={branch} onChange={(e) => setBranch(e.target.value)}>
                <option value="">All branches</option>
                {BRANCHES.map((b) => (
                  <option key={b} value={b}>
                    {b} · {BRANCH_LABELS[b]}
                  </option>
                ))}
              </select>
            </Field>
            <Button
              variant="ghost"
              className="col-span-2 text-base lg:col-span-1"
              disabled={!filtering}
              onClick={() => {
                setQ("");
                setYear("");
                setBranch("");
              }}
            >
              Clear filters
            </Button>
          </div>

          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <p role="status" className="font-semibold">
              Showing <b>{visible.length}</b> of {tab === "posters" ? `${stats.posters} posters` : `${rows.length} students`}
              {filtering && <span className="opacity-70"> · filtered</span>}
            </p>
            <div className="grid gap-3 sm:grid-cols-4 lg:flex">
              <Button variant="ghost" className="text-base" aria-pressed={ranked} onClick={() => setRanked((v) => !v)} disabled={tab === "posters"}>
                {ranked ? "Rank: on (score, then time)" : "Rank by score & time"}
              </Button>
              <Button variant="ghost" className="text-base" onClick={exportCsv} disabled={filtered.length === 0}>
                Export CSV ({filtered.length})
              </Button>
              <Button variant="ghost" className="text-base" onClick={zipPosters} disabled={!!zip || filteredPosters.length === 0}>
                {zip ? `Zipping ${zip.done}/${zip.total}…` : `Posters .zip (${filteredPosters.length})`}
              </Button>
              <Button variant="ghost" className="text-base" onClick={() => void load().catch(() => {})} disabled={reloading}>
                {reloading ? "Refreshing…" : "Refresh"}
              </Button>
            </div>
          </div>
          <p className="text-sm font-medium opacity-80">Exports and the zip use the current filters. Quiz scores are final once submitted; nothing here can change them.</p>
          {notice && (
            <p aria-live="polite" className="font-semibold text-leaf">
              {notice}
            </p>
          )}
          {error && (
            <p role="alert" className="rounded-xl border-[3px] border-signal bg-white px-4 py-3 font-semibold text-signal">
              {error}
            </p>
          )}
          {loadError && (
            <p role="alert" className="rounded-xl border-[3px] border-signal bg-white px-4 py-3 font-semibold text-signal">
              Refresh failed: {loadError.message}. Showing the last loaded data.
            </p>
          )}
        </div>

        {visible.length === 0 ? (
          <p className="p-6 text-lg font-semibold">{filtering ? "Nobody matches these filters." : tab === "posters" ? "No posters submitted yet." : "No registrations yet."}</p>
        ) : tab === "posters" ? (
          <ul className="grid gap-6 p-4 sm:grid-cols-2 sm:p-6 lg:grid-cols-3">
            {visible.map((r) => {
              const p = r.poster!;
              return (
                <li key={r.uid} className="sticker flex flex-col overflow-hidden bg-white">
                  <div className="flex h-56 items-center justify-center border-b-[3px] border-ink bg-paper">
                    {p.fileType.startsWith("image/") ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.url} alt={`Poster by ${r.name}`} loading="lazy" className="h-full w-full object-contain" />
                    ) : (
                      <span className="rounded-lg border-[3px] border-ink bg-signal px-3 py-1 font-display text-xl text-white shadow-[3px_3px_0_var(--color-ink)]">PDF</span>
                    )}
                  </div>
                  <div className="flex flex-1 flex-col p-4">
                    <p className="break-words text-lg font-bold leading-tight">{r.name}</p>
                    <p className="mt-1 text-sm font-semibold opacity-80">
                      Reg. {r.rollNo} · {r.year} · {r.branch}
                    </p>
                    <p className="mt-1 text-sm font-medium">
                      {formatIst(p.uploadedAt)} · {(FILE_EXT[p.fileType] ?? "file").toUpperCase()}
                    </p>
                    <div className="mt-auto grid grid-cols-2 gap-3 pt-4">
                      <a href={p.url} target="_blank" rel="noreferrer" className={ghostLink}>
                        Open<span className="sr-only"> {r.name}&apos;s poster (new tab)</span>
                      </a>
                      <button type="button" className={ghostLink} onClick={() => void downloadOne(r)}>
                        Save<span className="sr-only"> {r.name}&apos;s poster</span>
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <>
          <p className="border-b-2 border-ink/15 px-4 py-2 text-sm font-semibold opacity-80 md:hidden" aria-hidden>
            Swipe the table sideways for more columns →
          </p>
          <div role="region" aria-label={tab === "quiz" ? "Quiz scores table" : "Participants table"} tabIndex={0} className="overflow-x-auto">
            <table className="w-full min-w-[40rem] border-collapse">
              <caption className="sr-only">
                {tab === "quiz" ? "Quiz scores, highest first" : "Registered participants"}
                {filtering ? ", filtered" : ""}
              </caption>
              <thead>
                <tr className="border-b-[3px] border-ink">
                  {showRank && (
                    <th scope="col" className={th}>
                      Rank
                    </th>
                  )}
                  <th scope="col" className={`${th} sticky left-0 z-10 bg-white`}>
                    Name
                  </th>
                  <th scope="col" className={th}>Registration no</th>
                  <th scope="col" className={th}>Year</th>
                  <th scope="col" className={th}>Branch</th>
                  {tab === "participants" && (
                    <th scope="col" className={th}>
                      Email
                    </th>
                  )}
                  <th scope="col" className={th}>
                    Score
                  </th>
                  <th scope="col" className={th}>
                    Time taken
                  </th>
                  <th scope="col" className={th}>
                    Poster
                  </th>
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => (
                  <tr key={r.uid} className="border-b-2 border-ink/15 bg-white last:border-b-0 even:bg-paper">
                    {showRank && <td className={`${td} font-display text-xl`}>{ranks.get(r.uid) ?? "–"}</td>}
                    <th scope="row" className={`${td} sticky left-0 z-10 max-w-[12rem] break-words bg-inherit text-left font-bold`}>
                      {r.name}
                    </th>
                    <td className={`${td} font-mono text-sm`}>{r.rollNo}</td>
                    <td className={td}>{r.year}</td>
                    <td className={td}>{r.branch}</td>
                    {tab === "participants" && <td className={`${td} whitespace-nowrap text-sm`}>{r.email}</td>}
                    <td className={td}>
                      <QuizCell r={r} />
                    </td>
                    <td className={`${td} whitespace-nowrap font-mono text-sm font-semibold`}>
                      {r.quiz?.status === "submitted" ? formatDuration(r.quiz.timeMs) || "–" : "–"}
                    </td>
                    <td className={`${td} whitespace-nowrap text-sm font-semibold`}>
                      {r.poster ? (
                        <a href={r.poster.url} target="_blank" rel="noreferrer" className="inline-flex min-h-12 items-center underline underline-offset-4">
                          {formatIst(r.poster.uploadedAt)}
                          <span className="sr-only"> (open poster in new tab)</span>
                        </a>
                      ) : (
                        <span className="opacity-60">None</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}
      </Card>
    </>,
  );
}
