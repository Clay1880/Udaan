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
