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
      <div className="mt-2.5 text-[28px] font-semibold leading-none tabular-nums text-ink-text">
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

