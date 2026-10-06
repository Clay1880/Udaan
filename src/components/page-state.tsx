"use client";
import { useState } from "react";
import { Cloud, Sparkle } from "./art";
import { Button, Card, Label, Stage } from "./ui";

/** Placeholder panel while `/api/me` loads, shaped like the page it stands in for. */
export function LoadingPanel({ text = "Loading your details…" }: { text?: string }) {
  return (
    <Stage className="fade-up relative overflow-hidden p-5 sm:p-10">
      <Cloud className="absolute -right-4 top-6 w-20 opacity-90 sm:w-28" />
      <p role="status" className="ink-edge flex min-h-12 items-center gap-3 text-xl font-semibold sm:text-2xl">
        <Sparkle className="h-7 w-7 shrink-0" />
        {text}
      </p>
      <div className="mt-6 h-40 max-w-xl rounded-[18px] border-[3px] border-dashed border-white/60" aria-hidden />
    </Stage>
  );
}

/** Shown when `/api/me` fails for any reason other than 401 (which signs out and redirects). */
export function LoadErrorPanel({ error, onRetry }: { error: Error; onRetry: () => Promise<unknown> }) {
  const [busy, setBusy] = useState(false);
  return (
    <Stage className="fade-up p-5 sm:p-10">
      <Card className="max-w-xl p-5 sm:p-8">
        <Label className="text-signal !opacity-100">Something went wrong</Label>
        <h1 className="mt-2 font-display text-2xl leading-tight sm:text-3xl">We couldn&apos;t load your details.</h1>
        <p className="mt-3 font-medium">
          Check your connection and try again. <span className="opacity-75">({error.message})</span>
        </p>
        <Button
          className="mt-6 w-full sm:w-auto"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            onRetry()
              .catch(() => {})
              .finally(() => setBusy(false));
          }}
        >
          {busy ? "Trying…" : "Try again"}
        </Button>
      </Card>
    </Stage>
  );
}
