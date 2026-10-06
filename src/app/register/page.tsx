"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Card, Field, Label, Tag, inputClass } from "@/components/ui";
import { Cloud, Jet, Sparkle } from "@/components/art";
import { SiteHeader } from "@/components/site-header";
import { LoadErrorPanel, LoadingPanel } from "@/components/page-state";
import { BRANCH_LABELS, BRANCHES, YEARS } from "@/lib/config";
import { ProfileSchema } from "@/lib/profile";
import { ApiError } from "@/lib/client/api";
import { useRequireMe } from "@/lib/client/use-me";

type Form = { name: string; rollNo: string; year: string; branch: string };
type FieldErrors = Partial<Record<keyof Form, string>>;

const MESSAGES: Record<keyof Form, string> = {
  name: "Enter your full name (2 to 80 characters).",
  rollNo: "Enter your roll number: up to 20 letters, digits, - _ or /.",
  year: "Pick your year.",
  branch: "Pick your branch.",
};

/** Same schema the server uses, so the student sees a field-level message instead of a bare 400. */
function check(form: Form): { data: Form } | { errors: FieldErrors } {
  const r = ProfileSchema.safeParse(form);
  if (r.success) return { data: r.data };
  const errors: FieldErrors = {};
  for (const issue of r.error.issues) {
    const k = issue.path[0] as keyof Form;
    if (k in MESSAGES) errors[k] ??= MESSAGES[k];
  }
  return { errors };
}

const ghostLink =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border-[3px] border-ink bg-white px-6 text-lg font-semibold shadow-[4px_4px_0_var(--color-ink)]";

export default function Register() {
  const { me, error: loadError, call, refresh } = useRequireMe(false);
  const router = useRouter();
  const [form, setForm] = useState<Form>({ name: "", rollNo: "", year: "", branch: "" });
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!me) return;
    setForm((f) => ({
      name: me.profile?.name ?? (f.name || me.name || ""),
      rollNo: me.profile?.rollNo ?? f.rollNo,
      year: me.profile?.year ?? f.year,
      branch: me.profile?.branch ?? f.branch,
    }));
  }, [me]);

  const locked = me?.attempt != null;
  const editing = me?.profile != null;
  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm({ ...form, [k]: e.target.value });
    if (fieldErrors[k]) setFieldErrors({ ...fieldErrors, [k]: undefined });
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const r = check(form);
    if ("errors" in r) {
      setFieldErrors(r.errors);
      return;
    }
    setFieldErrors({});
    setBusy(true);
    try {
      await call("/api/profile", { method: "POST", body: r.data });
      await refresh();
      router.push("/dashboard");
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        // A quiz attempt exists (maybe from another tab): reload so the form shows as locked.
        refresh().catch(() => {});
      }
      setError(err instanceof Error ? err.message : "Could not save your details.");
    } finally {
      setBusy(false);
    }
  }

  const errId = (k: keyof Form) => (fieldErrors[k] ? `${k}-error` : undefined);
  const fieldError = (k: keyof Form) =>
    fieldErrors[k] && (
      <span id={`${k}-error`} className="block text-sm font-semibold text-signal">
        {fieldErrors[k]}
      </span>
    );

  return (
    <>
      <SiteHeader isAdmin={me?.isAdmin} />
      <main className="mx-auto max-w-5xl px-4 pb-8 pt-12 sm:px-6 sm:pt-20">
        {!me && loadError ? (
          <LoadErrorPanel error={loadError} onRetry={refresh} />
        ) : !me ? (
          <LoadingPanel />
        ) : (
          <section className="grid-panel fade-up relative px-4 pb-6 sm:px-10 sm:pb-10">
            <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
              <span className="dot -right-4 top-[38%] h-10 w-10 sm:h-14 sm:w-14 lg:hidden" />
              <span className="dot -bottom-5 left-[12%] h-11 w-11" />
              <Cloud className="absolute -right-6 top-6 w-20 sm:w-28 lg:hidden" />
              <Cloud className="absolute bottom-[12%] right-[6%] hidden w-32 lg:block" fill="#f27fb5" />
            </div>

            <div className="relative">
              <div className="relative -mt-[0.62em] inline-block text-[clamp(2.6rem,12vw,5.5rem)]">
                <h1 className="bubble text-sun">{editing ? "Your details" : "Who are you?"}</h1>
                <Sparkle className="absolute -right-[0.3em] -top-[0.15em] h-[0.4em] w-[0.4em]" />
              </div>

              <p className="ink-edge mt-4 max-w-md text-lg font-semibold leading-snug sm:text-xl">
                {editing ? "Check these before you start the quiz." : "Tell us who you are so we can put your name on the results."}
              </p>
              <Tag tone="white" className="mt-4 max-w-full !rounded-xl">
                <span className="block text-xs uppercase tracking-[0.14em] opacity-75">Signed in as</span>
                <span className="block break-all">{me.email}</span>
              </Tag>

              <div className="lg:grid lg:grid-cols-[minmax(0,36rem)_1fr] lg:items-start lg:gap-8">
                <Card className="mt-7 p-5 sm:p-8">
                  {locked && (
                    <div role="status" className="mb-6 rounded-xl border-[3px] border-ink bg-sun px-4 py-3 font-semibold">
                      Your details are locked because you have started the quiz.
                    </div>
                  )}
                  <form onSubmit={submit} noValidate className="space-y-6">
                    <Field label="Full name">
                      <input
                        className={inputClass}
                        value={form.name}
                        onChange={set("name")}
                        required
                        minLength={2}
                        maxLength={80}
                        disabled={locked}
                        autoComplete="name"
                        aria-invalid={!!fieldErrors.name}
                        aria-describedby={errId("name")}
                      />
                      {fieldError("name")}
                    </Field>
                    <Field label="Roll number" hint={fieldErrors.rollNo ? undefined : "As printed on your college ID."}>
                      <input
                        className={inputClass}
                        value={form.rollNo}
                        onChange={set("rollNo")}
                        required
                        maxLength={20}
                        disabled={locked}
                        autoCapitalize="characters"
                        autoComplete="off"
                        spellCheck={false}
                        aria-invalid={!!fieldErrors.rollNo}
                        aria-describedby={errId("rollNo")}
                      />
                      {fieldError("rollNo")}
                    </Field>

                    <fieldset disabled={locked} aria-describedby={errId("year")}>
                      <legend className="mb-2">
                        <Label>Year</Label>
                      </legend>
                      <div className="grid grid-cols-4 gap-2 sm:gap-3">
                        {YEARS.map((y) => (
                          <label key={y} className="relative">
                            <input
                              type="radio"
                              name="year"
                              value={y}
                              checked={form.year === y}
                              onChange={set("year")}
                              className="peer absolute inset-0 opacity-0"
                            />
                            <span className="flex min-h-12 cursor-pointer items-center justify-center rounded-xl border-[3px] border-ink bg-white text-lg font-semibold peer-checked:bg-sun peer-checked:shadow-[3px_3px_0_var(--color-ink)] peer-focus-visible:outline peer-focus-visible:outline-[3px] peer-focus-visible:outline-offset-[3px] peer-focus-visible:outline-ink peer-disabled:cursor-not-allowed peer-disabled:opacity-60">
                              {y}
                            </span>
                          </label>
                        ))}
                      </div>
                      {fieldError("year")}
                    </fieldset>

                    <fieldset disabled={locked} aria-describedby={errId("branch")}>
                      <legend className="mb-2">
                        <Label>Branch</Label>
                      </legend>
                      <div className="grid gap-2 sm:grid-cols-2 sm:gap-3">
                        {BRANCHES.map((b) => (
                          <label key={b} className="relative">
                            <input
                              type="radio"
                              name="branch"
                              value={b}
                              checked={form.branch === b}
                              onChange={set("branch")}
                              className="peer absolute inset-0 opacity-0"
                            />
                            <span className="flex min-h-12 cursor-pointer items-center justify-between gap-3 rounded-xl border-[3px] border-ink bg-white px-4 py-2 font-semibold leading-tight peer-checked:bg-sun peer-checked:shadow-[3px_3px_0_var(--color-ink)] peer-focus-visible:outline peer-focus-visible:outline-[3px] peer-focus-visible:outline-offset-[3px] peer-focus-visible:outline-ink peer-disabled:cursor-not-allowed peer-disabled:opacity-60">
                              {BRANCH_LABELS[b]}
                              <span className="text-xs font-semibold tracking-[0.14em] opacity-75">{b}</span>
                            </span>
                          </label>
                        ))}
                      </div>
                      {fieldError("branch")}
                    </fieldset>

                    {error && (
                      <p role="alert" className="font-semibold text-signal">
                        {error}
                      </p>
                    )}
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                      {!locked && (
                        <Button type="submit" disabled={busy} className="w-full sm:w-auto">
                          {busy ? "Saving…" : editing ? "Save changes" : "Save and continue"}
                          {!busy && <span aria-hidden>→</span>}
                        </Button>
                      )}
                      {editing && (
                        <Link href="/dashboard" className={`${ghostLink} w-full sm:w-auto`}>
                          {locked ? "Back to dashboard" : "Cancel"}
                        </Link>
                      )}
                    </div>
                  </form>
                </Card>

                {/* Laptop: a jet climbing past the form, like the landing panel. */}
                <div className="pointer-events-none relative hidden h-72 lg:block" aria-hidden>
                  <Jet className="absolute left-10 top-16 w-32 rotate-[24deg]" />
                  <Sparkle className="absolute right-16 top-8 h-10 w-10" fill="#fff" />
                </div>
              </div>
            </div>
          </section>
        )}
      </main>
    </>
  );
}
