"use client";

import { useEffect, useRef, useState } from "react";
import type { DukcapilRegionRow } from "@/lib/api";

/** Island groups, Kemendagri codes (the same groups backend/api/carousel.py names in a pack's text). */
export const PROV_GROUPS: { name: string; codes: string[] }[] = [
  { name: "Sumatera", codes: ["11", "12", "13", "14", "15", "16", "17", "18", "19", "21"] },
  { name: "Jawa", codes: ["31", "32", "33", "34", "35", "36"] },
  { name: "Bali & Nusa Tenggara", codes: ["51", "52", "53"] },
  { name: "Kalimantan", codes: ["61", "62", "63", "64", "65"] },
  { name: "Sulawesi", codes: ["71", "72", "73", "74", "75", "76"] },
  { name: "Maluku", codes: ["81", "82"] },
  { name: "Papua", codes: ["91", "92", "93", "94", "95", "96"] },
];

/** "73,71" -> ["71", "73"]; "" -> []. */
export const provList = (v: string) => [...new Set(v.split(/[,\-\s]+/).filter(Boolean))].sort();

const same = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/** What the button says for a selection. */
function summary(codes: string[], provinces: DukcapilRegionRow[], empty: string): string {
  if (!codes.length) return empty;
  const group = PROV_GROUPS.find((g) => same([...g.codes].sort(), codes));
  if (group) return `${group.name} (${codes.length} provinsi)`;
  if (codes.length === 1) return provinces.find((p) => p.code === codes[0])?.name ?? codes[0];
  return `${codes.length} provinsi`;
}

/**
 * One or more provinces: a whole island group in one click, or any provinces
 * cherry-picked. `value` is a comma-separated list of codes ("" = none, which
 * means all of Indonesia where `allowAll`).
 */
export function ProvincePicker({
  value,
  onChange,
  provinces,
  allowAll,
  disabled,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  provinces: DukcapilRegionRow[];
  allowAll: boolean;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const codes = provList(value);
  const set = (next: string[]) => onChange([...new Set(next)].sort().join(","));

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const byCode = new Map(provinces.map((p) => [p.code, p]));
  const chip = (on: boolean) =>
    `rounded-full border px-3 py-1 text-sm transition-colors ${
      on ? "border-ink-accent bg-ink-accent/15 text-ink-accent" : "border-ink-border text-ink-text hover:border-ink-accent hover:text-ink-accent"
    }`;

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={className}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        {summary(codes, provinces, allowAll ? "Seluruh Indonesia" : "Pilih provinsi…")}
        <span aria-hidden className="ml-2 text-ink-muted">▾</span>
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Pilih provinsi"
          className="absolute right-0 z-20 mt-2 w-[min(36rem,calc(100vw-2rem))] rounded-2xl border border-ink-border bg-ink-panel p-4 shadow-lg"
        >
          <div className="text-xs font-semibold text-ink-muted">Satu pulau sekaligus</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {allowAll && (
              <button type="button" className={chip(!codes.length)} onClick={() => set([])}>
                Seluruh Indonesia
              </button>
            )}
            {PROV_GROUPS.map((g) => (
              <button key={g.name} type="button" className={chip(same([...g.codes].sort(), codes))} onClick={() => set(g.codes)}>
                {g.name}
              </button>
            ))}
          </div>
          <div className="mt-4 flex items-baseline justify-between">
            <span className="text-xs font-semibold text-ink-muted">Atau pilih provinsinya</span>
            {codes.length > 0 && (
              <button type="button" className="text-xs text-ink-muted hover:text-ink-accent" onClick={() => set([])}>
                Kosongkan
              </button>
            )}
          </div>
          <div className="mt-2 max-h-72 space-y-3 overflow-y-auto pr-1">
            {PROV_GROUPS.map((g) => (
              <div key={g.name}>
                <div className="text-xs text-ink-muted">{g.name}</div>
                <div className="mt-1 grid grid-cols-1 gap-x-4 sm:grid-cols-2">
                  {g.codes
                    .filter((c) => byCode.has(c))
                    .map((c) => (
                      <label key={c} className="flex cursor-pointer items-center gap-2 py-0.5 text-sm text-ink-text">
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-[rgb(var(--ink-accent))]"
                          checked={codes.includes(c)}
                          onChange={(e) => set(e.target.checked ? [...codes, c] : codes.filter((x) => x !== c))}
                        />
                        {byCode.get(c)!.name}
                      </label>
                    ))}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 flex justify-end">
            <button type="button" className={chip(false)} onClick={() => setOpen(false)}>
              Selesai
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
