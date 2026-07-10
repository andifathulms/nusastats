"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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
    <Panel className="relative overflow-hidden pt-4 transition-shadow hover:shadow-md">
      <div className={`absolute inset-x-0 top-0 h-[3px] ${dot[accent]}`} />
      <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-ink-muted">
        <span className={`h-1.5 w-1.5 rounded-full ${dot[accent]}`} />
        {label}
      </div>
      <div className="mt-2 text-3xl font-semibold tabular-nums text-ink-text">
        {typeof value === "number" ? formatNumber(value) : value}
      </div>
      {sub && <div className="mt-1 text-xs text-ink-muted">{sub}</div>}
    </Panel>
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
    accent: "bg-ink-accent/15 text-ink-accent border-ink-accent/30",
    good: "bg-ink-good/15 text-ink-good border-ink-good/30",
    warn: "bg-ink-warn/15 text-ink-warn border-ink-warn/30",
    bad: "bg-ink-bad/15 text-ink-bad border-ink-bad/30",
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
}

export function SectionTitle({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div className="mb-3 flex items-baseline gap-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">{children}</h2>
      {hint && <span className="text-xs text-ink-muted/70">{hint}</span>}
    </div>
  );
}

export function VariableLink({ variableId, children }: { variableId: string; children: React.ReactNode }) {
  return (
    <Link href={`/variables/${variableId}`} className="text-ink-accent2 hover:underline">
      {children}
    </Link>
  );
}

export function NavLink({
  href,
  children,
  collapsed = false,
  title,
}: {
  href: string;
  children: React.ReactNode;
  collapsed?: boolean;
  title?: string;
}) {
  const pathname = usePathname();
  const active = href === "/" ? pathname === "/" : pathname?.startsWith(href);
  return (
    <Link
      href={href}
      title={collapsed ? title : undefined}
      className={`flex items-center gap-2.5 rounded-lg py-2 text-sm font-medium transition-colors ${
        collapsed ? "justify-center px-0" : "px-3"
      } ${
        active
          ? "bg-coal-hover text-coal-text shadow-[inset_2px_0_0_0_#ba9a7b]"
          : "text-coal-muted hover:bg-coal-hover/60 hover:text-coal-text"
      }`}
    >
      {children}
    </Link>
  );
}
