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
