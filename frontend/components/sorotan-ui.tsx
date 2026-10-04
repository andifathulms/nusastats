"use client";

// Small shared primitives for Sorotan post components (poverty/hdi/education/…),
// so each post doesn't re-copy the same stat tile, pager, toggle and stats.
import { Panel } from "@/components/ui";

export function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Panel>
      <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">{label}</div>
      <div className="mt-1.5 truncate text-[22px] font-extrabold tracking-[-0.02em] text-ink-accent" title={value}>{value}</div>
      {sub && <div className="mt-0.5 truncate text-xs text-ink-muted">{sub}</div>}
    </Panel>
  );
}

export function PageBtn({ disabled, onClick, children }: { disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="grid h-7 w-7 place-items-center rounded-md border border-ink-border bg-ink-panel text-ink-text hover:border-ink-accent/60 disabled:opacity-40"
    >
      {children}
    </button>
  );
}

// A segmented pill toggle. `opts` is [value, label] pairs.
export function PillToggle<T extends string>({ opts, value, onChange }: { opts: [T, string][]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex rounded-full border border-ink-border bg-ink-bg2 p-0.5">
      {opts.map(([v, label]) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
            value === v ? "bg-ink-panel text-ink-accent shadow-tile" : "text-ink-muted hover:text-ink-text"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export function pearson(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n < 2) return NaN;
  const mx = xs.reduce((a, v) => a + v, 0) / n;
  const my = ys.reduce((a, v) => a + v, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx, dy = ys[i] - my;
    sxy += dx * dy; sxx += dx * dx; syy += dy * dy;
  }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : NaN;
}
