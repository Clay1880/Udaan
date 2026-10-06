import type { ButtonHTMLAttributes, ReactNode } from "react";

const TONES = {
  paper: "bg-paper",
  white: "bg-white",
  sun: "bg-sun",
  pink: "bg-bubble",
  green: "bg-leaf text-white",
  blue: "bg-blue text-white",
  red: "bg-signal text-white",
};
export type Tone = keyof typeof TONES;

export function Card({ children, className = "", tone = "white", tilt = 0 }: { children: ReactNode; className?: string; tone?: Tone; tilt?: number }) {
  return (
    <div style={tilt ? { transform: `rotate(${tilt}deg)` } : undefined} className={`sticker ${TONES[tone]} ${className}`}>
      {children}
    </div>
  );
}

export function Stage({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`grid-panel ${className}`}>{children}</div>;
}

export function Label({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <p className={`text-xs font-semibold uppercase tracking-[0.18em] opacity-75 ${className}`}>{children}</p>;
}

export function Tag({ children, tone = "sun", tilt = 0, className = "" }: { children: ReactNode; tone?: Tone; tilt?: number; className?: string }) {
  return (
    <span
      style={tilt ? { transform: `rotate(${tilt}deg)` } : undefined}
      className={`inline-block rounded-full border-[3px] border-ink px-3 py-1 text-sm font-semibold shadow-[3px_3px_0_var(--color-ink)] ${TONES[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

const variants = {
  primary: "bg-sun text-ink",
  ghost: "bg-white text-ink",
  danger: "bg-signal text-white",
};

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof variants }) {
  return (
    <button
      {...props}
      className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border-[3px] border-ink px-6 text-lg font-semibold shadow-[4px_4px_0_var(--color-ink)] transition-transform hover:-translate-y-0.5 active:translate-x-[3px] active:translate-y-[3px] active:shadow-none disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 ${variants[variant]} ${className}`}
    />
  );
}

export const inputClass =
  "min-h-12 w-full rounded-xl border-[3px] border-ink bg-white px-4 text-base text-ink outline-none placeholder:text-ink/40 focus:bg-sun/20 focus:shadow-[4px_4px_0_var(--color-ink)]";

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block space-y-2">
      <Label>{label}</Label>
      {children}
      {hint && <span className="block text-sm opacity-75">{hint}</span>}
    </label>
  );
}
