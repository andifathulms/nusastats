import Link from "next/link";
import { formatNumber } from "@/lib/api";

export function Panel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-ink-border bg-ink-panel p-5 ${className}`}>{children}</div>
  );
}

export function StatTile({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <Panel>
      <div className="text-xs uppercase tracking-wide text-ink-muted">{label}</div>
      <div className="mt-2 text-3xl font-semibold tabular-nums text-ink-text">
        {typeof value === "number" ? formatNumber(value) : value}
      </div>
      {sub && <div className="mt-1 text-xs text-ink-muted">{sub}</div>}
    </Panel>
  );
}

export function Badge({ children, tone = "muted" }: { children: React.ReactNode; tone?: "muted" | "accent" | "good" }) {
  const tones: Record<string, string> = {
    muted: "bg-ink-panel2 text-ink-muted border-ink-border",
    accent: "bg-ink-accent/15 text-ink-accent border-ink-accent/30",
    good: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${tones[tone]}`}>
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
    <Link href={`/variables/${variableId}`} className="text-ink-accent hover:underline">
      {children}
    </Link>
  );
}
