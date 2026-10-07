import { Sparkle } from "./art";

export function SiteFooter() {
  return (
    <footer className="mx-auto flex max-w-5xl flex-col items-center gap-3 px-4 pb-10 pt-4 text-center text-sm font-semibold">
      <p className="flex items-center justify-center gap-2">
        <Sparkle className="h-4 w-4" />
        <span>NSS · 2026 · On the occasion of Air Force Day</span>
        <Sparkle className="h-4 w-4" />
      </p>
      <p className="flex flex-wrap items-center justify-center gap-x-2 gap-y-2 text-xs">
        <span>Made by</span>
        <a
          href="https://www.instagram.com/prince_sin1729?stkn=azd2MTltZzFvZmhj"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Prince Singh on Instagram"
          className="rounded-full border-[3px] border-ink bg-sun px-3 py-1 shadow-[3px_3px_0_var(--color-ink)] transition-transform hover:-translate-y-0.5"
        >
          Prince Singh · SE IT A
        </a>
        <span>&amp;</span>
        <span className="group relative inline-block">
          <a
            href="https://www.instagram.com/properpriyanshu?stkn=MTI4dnB6OHZ3Y3Rkcg=="
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Priyanshu Rajput on Instagram"
            className="peer inline-block rounded-full border-[3px] border-ink bg-bubble px-3 py-1 text-signal shadow-[3px_3px_0_var(--color-ink)] outline-none transition-transform hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-ink"
          >
            Priyanshu Rajput · SE IT A
          </a>
          <span
            role="tooltip"
            className="pointer-events-none absolute bottom-full left-1/2 mb-2 -translate-x-1/2 whitespace-nowrap rounded-full border-[3px] border-ink bg-signal px-3 py-1 text-white opacity-0 shadow-[3px_3px_0_var(--color-ink)] transition-opacity group-hover:opacity-100 peer-focus-visible:opacity-100"
          >
            Future Secretary ★
          </span>
        </span>
      </p>
    </footer>
  );
}
