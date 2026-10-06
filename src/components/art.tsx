const INK = "#1b1b1f";

export function Sparkle({ className = "", fill = "#f4b81c" }: { className?: string; fill?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path d="M12 1 C13 8 16 11 23 12 C16 13 13 16 12 23 C11 16 8 13 1 12 C8 11 11 8 12 1Z" fill={fill} stroke={INK} strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

export function Cloud({ className = "", fill = "#fff" }: { className?: string; fill?: string }) {
  return (
    <svg viewBox="0 0 120 70" className={className} aria-hidden>
      <path
        d="M24 62 C8 62 4 40 22 36 C20 18 44 10 54 24 C62 8 90 12 90 32 C112 30 118 62 96 62 Z"
        fill={fill}
        stroke={INK}
        strokeWidth="4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Cartoon top-view fighter, yellow with a dark outline like the poster's hand. Points up. */
export function Jet({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 140" className={className} aria-hidden>
      <g fill="#f4b81c" stroke={INK} strokeWidth="5" strokeLinejoin="round">
        <path d="M52 58 L6 104 L6 114 L52 100Z" />
        <path d="M68 58 L114 104 L114 114 L68 100Z" />
        <path d="M54 104 L30 128 L30 134 L56 122Z" />
        <path d="M66 104 L90 128 L90 134 L64 122Z" />
        <path d="M60 4 C66 20 68 40 68 62 L68 108 L60 128 L52 108 L52 62 C52 40 54 20 60 4Z" />
      </g>
      <ellipse cx="60" cy="36" rx="5.5" ry="11" fill="#2f5fd0" stroke={INK} strokeWidth="3" />
    </svg>
  );
}

/** Tricolour badge (saffron, white, green) with a simple wheel ring. */
export function Badge({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <defs>
        <clipPath id="badge-clip">
          <circle cx="32" cy="32" r="28" />
        </clipPath>
      </defs>
      <g clipPath="url(#badge-clip)">
        <rect y="0" width="64" height="22" fill="#ff9933" />
        <rect y="22" width="64" height="20" fill="#fff" />
        <rect y="42" width="64" height="22" fill="#138808" />
      </g>
      <circle cx="32" cy="32" r="28" fill="none" stroke={INK} strokeWidth="4" />
      <circle cx="32" cy="32" r="7" fill="none" stroke="#2349a6" strokeWidth="2.5" />
    </svg>
  );
}

function burst(n: number, outer: number, inner: number): string {
  return Array.from({ length: n * 2 }, (_, i) => {
    const r = i % 2 ? inner : outer;
    const a = (Math.PI * i) / n - Math.PI / 2;
    return `${(50 + r * Math.cos(a)).toFixed(1)},${(50 + r * Math.sin(a)).toFixed(1)}`;
  }).join(" ");
}

export function Starburst({ children, className = "", fill = "#f4b81c" }: { children?: React.ReactNode; className?: string; fill?: string }) {
  return (
    <div className={`relative grid place-items-center ${className}`}>
      <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden>
        <polygon points={burst(14, 48, 36)} fill={fill} stroke={INK} strokeWidth="3" strokeLinejoin="round" />
      </svg>
      <span className="relative text-center">{children}</span>
    </div>
  );
}

/** Dotted flight path. */
export function Contrail({ className = "", stroke = "#ffffff" }: { className?: string; stroke?: string }) {
  return (
    <svg viewBox="0 0 320 120" className={className} aria-hidden fill="none" stroke={stroke} strokeWidth="5" strokeLinecap="round" strokeDasharray="1 14">
      <path d="M4 110 C80 110 90 20 170 40 S260 100 316 14" />
    </svg>
  );
}
