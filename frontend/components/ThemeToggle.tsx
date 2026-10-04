"use client";

import { useThemePref, type ThemePref } from "@/lib/theme";

const OPTIONS: { v: ThemePref; label: string; icon: (p: { className?: string }) => JSX.Element }[] = [
  { v: "light", label: "Tema terang", icon: SunIcon },
  { v: "dark", label: "Tema gelap", icon: MoonIcon },
  { v: "system", label: "Ikuti sistem", icon: MonitorIcon },
];

/** Light / dark / system switch. Compact segmented control for the top bar. */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const [pref, setPref] = useThemePref();
  return (
    <div role="radiogroup" aria-label="Tema tampilan" className={`flex items-center rounded-full border border-ink-border bg-ink-panel2/70 p-0.5 ${className}`}>
      {OPTIONS.map((o) => (
        <button
          key={o.v}
          role="radio"
          aria-checked={pref === o.v}
          aria-label={o.label}
          title={o.label}
          onClick={() => setPref(o.v)}
          className={`grid h-7 w-7 place-items-center rounded-full transition-colors ${
            pref === o.v ? "bg-ink-panel text-ink-accent shadow-tile" : "text-ink-faint hover:text-ink-text"
          }`}
        >
          <o.icon className="h-3.5 w-3.5" />
        </button>
      ))}
    </div>
  );
}

function SunIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={className} aria-hidden>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}
function MoonIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z" />
    </svg>
  );
}
function MonitorIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M8 20h8M12 16v4" />
    </svg>
  );
}
