"use client";

import type { DjpkMeasure } from "@/lib/api";

export const MEASURES: { v: DjpkMeasure; label: string }[] = [
  { v: "realisasi", label: "Realisasi" },
  { v: "anggaran", label: "Anggaran" },
  { v: "persentase", label: "% Serapan" },
];

export const GROUP_LABEL: Record<string, string> = {
  pendapatan: "Pendapatan",
  belanja: "Belanja",
  pembiayaan: "Pembiayaan",
};

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] font-medium uppercase tracking-wider text-ink-muted">{label}</span>
      {children}
    </label>
  );
}

export function Segmented({
  options,
  value,
  onChange,
}: {
  options: { v: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="inline-flex rounded-lg border border-ink-border bg-ink-panel2/50 p-0.5">
      {options.map((o) => (
        <button
          key={o.v}
          onClick={() => onChange(o.v)}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            value === o.v ? "bg-brand-gradient text-white shadow-glow" : "text-ink-muted hover:text-ink-text"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
