"use client";

import Link from "next/link";
import { formatNumber } from "@/lib/api";

export function Panel({
  children,
  className = "",
  glow = false,
}: {
  children: React.ReactNode;
  className?: string;
  glow?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border border-ink-border bg-ink-panel p-5 shadow-panel ${
        glow ? "shadow-glow" : ""
      } ${className}`}
    >
      {children}
    </div>
  );
}

export function StatTile({
  label,
  value,
  sub,
  accent = "accent",
}: {
  label: string;
  value: string | number;
  sub?: string;
  accent?: "accent" | "accent2" | "good" | "warn";
}) {
  const dot: Record<string, string> = {
    accent: "bg-ink-accent",
    accent2: "bg-ink-accent2",
    good: "bg-ink-good",
    warn: "bg-ink-warn",
  };
  return (
    <div className="rounded-2xl border border-ink-border bg-ink-panel p-4 shadow-tile transition-shadow hover:shadow-panel">
      <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-ink-muted">
        <span className={`h-1.5 w-1.5 rounded-full ${dot[accent]}`} />
        {label}
      </div>
      {/* Proportional figures on the big value — tabular-nums makes "121" look loose at display sizes. */}
      <div className="mt-2.5 text-[28px] font-semibold leading-none text-ink-text">
        {typeof value === "number" ? formatNumber(value) : value}
      </div>
      {sub && <div className="mt-1.5 text-xs text-ink-muted">{sub}</div>}
    </div>
  );
}

export function Badge({
  children,
  tone = "muted",
}: {
  children: React.ReactNode;
  tone?: "muted" | "accent" | "good" | "warn" | "bad";
}) {
  const tones: Record<string, string> = {
    muted: "bg-ink-panel2 text-ink-muted border-ink-border",
    accent: "bg-ink-accent/10 text-ink-accent border-ink-accent/25",
    good: "bg-ink-good/12 text-ink-good border-ink-good/30",
    warn: "bg-ink-warn/12 text-ink-warn border-ink-warn/30",
    bad: "bg-ink-bad/12 text-ink-bad border-ink-bad/30",
  };
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

export function SectionTitle({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div className="mb-3 flex items-baseline gap-3">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-muted">{children}</h2>
      {hint && <span className="text-xs text-ink-muted/70">{hint}</span>}
    </div>
  );
}

export function VariableLink({ variableId, children }: { variableId: string; children: React.ReactNode }) {
  return (
    <Link href={`/variables/${variableId}`} className="font-medium text-ink-accent hover:underline">
      {children}
    </Link>
  );
}

// --- loading ---------------------------------------------------------------
//
// Every page used to render a bare "Memuat…" line, so the layout collapsed to
// one line of text and then snapped to full height when the data landed. These
// keep the shape of what's coming, so arrival is a fill rather than a jump.

/** One shimmering placeholder block. `className` sets its size. */
export function Skeleton({ className = "", style }: { className?: string; style?: React.CSSProperties }) {
  return <div aria-hidden style={style} className={`animate-pulse rounded-md bg-ink-panel2 ${className}`} />;
}

/** Stat-tile placeholder — same padding/border as StatTile so nothing shifts. */
export function SkeletonTile() {
  return (
    <div className="rounded-2xl border border-ink-border bg-ink-panel p-4 shadow-tile">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="mt-3 h-7 w-32" />
      <Skeleton className="mt-2 h-3 w-20" />
    </div>
  );
}

/** Placeholder rows for a ranked/table list. */
export function SkeletonRows({ rows = 8, className = "" }: { rows?: number; className?: string }) {
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="h-4 w-6 shrink-0" />
          <Skeleton className="h-4 w-40 shrink-0" />
          <Skeleton className="h-3 min-w-0 flex-1" />
          <Skeleton className="h-4 w-16 shrink-0" />
        </div>
      ))}
    </div>
  );
}

/** Panel-sized placeholder for a chart/map, sized to the real chart's height. */
export function SkeletonChart({ height = 280 }: { height?: number }) {
  return (
    <div className="rounded-2xl border border-ink-border bg-ink-panel p-5 shadow-panel">
      <Skeleton className="h-3 w-40" />
      <Skeleton className="mt-4 w-full" style={{ height }} />
    </div>
  );
}

/**
 * Wraps content that refetches. On the FIRST load it shows `fallback`; on a
 * refetch it keeps the last render and just dims it, so filtering or paging
 * never collapses the page to a spinner and back (skeleton flash).
 */
export function Loadable({
  loading,
  first,
  fallback,
  children,
}: {
  loading: boolean;
  first: boolean;
  fallback: React.ReactNode;
  children: React.ReactNode;
}) {
  if (first) return <>{fallback}</>;
  return (
    <div
      aria-busy={loading}
      className={loading ? "pointer-events-none opacity-60 transition-opacity duration-200" : "transition-opacity duration-200"}
    >
      {children}
    </div>
  );
}

/** A failure the reader can act on, instead of a raw exception string. */
export function ErrorState({ message, className = "" }: { message?: string; className?: string }) {
  return (
    <div className={`rounded-2xl border border-ink-bad/25 bg-ink-bad/[0.04] p-6 text-center ${className}`}>
      <div className="text-sm font-medium text-ink-text">Gagal memuat data</div>
      <p className="mx-auto mt-1 max-w-md text-sm text-ink-muted">
        Sambungan ke server data terputus atau permintaannya gagal. Coba muat ulang halaman.
      </p>
      {message && (
        <p className="mx-auto mt-2 max-w-md truncate font-mono text-[11px] text-ink-faint" title={message}>
          {message}
        </p>
      )}
    </div>
  );
}

/** Nothing matched — distinct from "still loading" and from "it broke". */
export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-ink-border bg-ink-panel/50 p-8 text-center">
      <div className="text-sm font-medium text-ink-text">{title}</div>
      {hint && <p className="mx-auto mt-1 max-w-sm text-sm text-ink-muted">{hint}</p>}
    </div>
  );
}

// --- page header -----------------------------------------------------------

/** The standard page header. Pages hand-rolled this and drifted apart. */
export function PageHeader({
  eyebrow,
  title,
  children,
}: {
  eyebrow?: string;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <header className="border-b border-ink-border pb-5">
      {eyebrow && (
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-ink-accent">
          <span className="h-1.5 w-1.5 rounded-full bg-ink-accent" />
          {eyebrow}
        </div>
      )}
      <h1 className={`font-display text-3xl font-medium tracking-tight text-ink-text sm:text-4xl ${eyebrow ? "mt-2" : ""}`}>
        {title}
      </h1>
      {children && <div className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-muted">{children}</div>}
    </header>
  );
}

