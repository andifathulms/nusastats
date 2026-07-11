"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { type CompositionConfig } from "@/lib/posts";
import { Panel } from "@/components/ui";

// 17 distinct-but-harmonious hues for the lapangan-usaha categories.
const PALETTE = [
  "#2E5BDA", "#4E8CF0", "#37A98C", "#5FBF6A", "#9BCB4A", "#E0B93B", "#EE9A3A",
  "#E8683C", "#D9455E", "#C74B9E", "#8E5BD1", "#6C6FE0", "#3AA0C2", "#5AC4C9",
  "#94A3B8", "#7C8894", "#546074",
];

type Part = { id: string; label: string; value: number; share: number; color: string };
type RegionOpt = { domain_id: string; domain_name: string; value: number };

// PDRB is in Milyar Rupiah; show large sums as Triliun.
function rp(milyar: number): string {
  if (milyar >= 1000) return `Rp ${(milyar / 1000).toLocaleString("id-ID", { maximumFractionDigits: 2 })} T`;
  return `Rp ${milyar.toLocaleString("id-ID", { maximumFractionDigits: 1 })} M`;
}
const pct = (p: number) => `${p.toLocaleString("id-ID", { maximumFractionDigits: 1 })}%`;
// Drop the leading "A "/"M,N " category letter for a cleaner label.
const clean = (label: string) => label.replace(/^([A-Z](,[A-Z])*)\s+/, "");

export function CompositionPost({ config }: { config: CompositionConfig }) {
  const [regions, setRegions] = useState<RegionOpt[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [parts, setParts] = useState<Part[] | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  // Region list + their totals (ranked biggest economy first) — one call.
  useEffect(() => {
    api
      .ranking(config.variableId, {
        admin_level: config.adminLevel,
        turvar_id: config.totalTurvarId,
        order: "desc",
        limit: "600",
        ...(config.year ? { year: config.year } : {}),
      })
      .then((r) => {
        const opts = r.results.map((x) => ({ domain_id: x.domain_id, domain_name: x.domain_name, value: x.value }));
        setRegions(opts);
        setSel((cur) => cur ?? opts[0]?.domain_id ?? null);
      });
  }, [config.variableId, config.adminLevel, config.totalTurvarId, config.year]);

  // One region's parts.
  useEffect(() => {
    if (!sel) return;
    setLoading(true);
    api
      .series(config.variableId, { domain_id: sel, ...(config.year ? { year: config.year } : {}) })
      .then((s) => {
        const totalRow = s.results.find((d) => d.turvar_id === config.totalTurvarId);
        const tot = totalRow?.value ?? s.results.reduce((a, d) => a + (d.turvar_id !== config.totalTurvarId ? d.value : 0), 0);
        const rows = s.results
          .filter((d) => d.turvar_id !== config.totalTurvarId)
          .sort((a, b) => b.value - a.value)
          .map((d, i) => ({
            id: d.turvar_id,
            label: clean(d.turvar_label),
            value: d.value,
            share: tot ? (d.value / tot) * 100 : 0,
            color: PALETTE[i % PALETTE.length],
          }));
        setTotal(tot);
        setParts(rows);
      })
      .finally(() => setLoading(false));
  }, [sel, config.variableId, config.totalTurvarId, config.year]);

  const region = regions.find((r) => r.domain_id === sel);
  const top = parts?.[0];
  // Colour the stacked strip in descending order but keep legend order = value.
  const strip = useMemo(() => parts ?? [], [parts]);

  return (
    <div className="space-y-4">
      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <RegionSelect regions={regions} value={sel} onChange={setSel} />
          <div className="text-xs text-ink-muted">{config.note}</div>
        </div>
      </Panel>

      {loading || !parts ? (
        <div className="flex h-64 items-center justify-center text-sm text-ink-muted">Memuat…</div>
      ) : (
        <>
          {/* Headline stats */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Stat label="Total PDRB" value={rp(total)} sub={region?.domain_name} />
            <Stat label="Sektor dominan" value={top ? clean(top.label) : "–"} sub={top ? pct(top.share) + " dari PDRB" : undefined} />
            <Stat
              label="3 sektor teratas"
              value={parts.slice(0, 3).reduce((a, p) => a + p.share, 0).toLocaleString("id-ID", { maximumFractionDigits: 0 }) + "%"}
              sub="konsentrasi ekonomi"
            />
          </div>

          {/* 100% stacked composition strip */}
          <Panel>
            <div className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-muted">Komposisi PDRB</div>
            <div className="flex h-7 w-full overflow-hidden rounded-md ring-1 ring-ink-border">
              {strip.map((p) => (
                <div
                  key={p.id}
                  title={`${p.label}: ${pct(p.share)} · ${rp(p.value)}`}
                  style={{ width: `${p.share}%`, background: p.color }}
                  className="h-full transition-[width]"
                />
              ))}
            </div>
          </Panel>

          {/* Ranked sectors */}
          <Panel>
            <div className="mb-3 text-xs font-medium uppercase tracking-wide text-ink-muted">
              17 kategori lapangan usaha
            </div>
            <div className="space-y-1.5">
              {parts.map((p) => (
                <div key={p.id} className="flex items-center gap-3">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: p.color }} />
                  <span className="w-56 shrink-0 truncate text-sm text-ink-text" title={p.label}>{p.label}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-ink-panel2">
                    <div className="h-full rounded-full" style={{ width: `${p.share}%`, background: p.color }} />
                  </div>
                  <span className="w-16 shrink-0 text-right text-sm tabular-nums text-ink-text">{pct(p.share)}</span>
                  <span className="hidden w-24 shrink-0 text-right text-xs tabular-nums text-ink-muted sm:block">{rp(p.value)}</span>
                </div>
              ))}
            </div>
          </Panel>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Panel>
      <div className="text-xs uppercase tracking-wide text-ink-muted">{label}</div>
      <div className="mt-1 truncate text-lg font-semibold text-ink-text" title={value}>{value}</div>
      {sub && <div className="mt-0.5 truncate text-xs text-ink-muted">{sub}</div>}
    </Panel>
  );
}

function RegionSelect({
  regions,
  value,
  onChange,
}: {
  regions: RegionOpt[];
  value: string | null;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const current = regions.find((r) => r.domain_id === value);
  const filtered = q ? regions.filter((r) => r.domain_name.toLowerCase().includes(q.toLowerCase())) : regions;

  return (
    <div ref={boxRef} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="min-w-[240px] rounded-lg border border-ink-border bg-ink-panel px-3 py-2 text-left text-sm text-ink-text hover:border-ink-accent/60"
      >
        <span className="text-ink-muted">Wilayah: </span>
        <span className="font-medium">{current?.domain_name ?? "…"}</span>
        <span className="float-right text-ink-muted">▾</span>
      </button>
      {open && (
        <div className="absolute left-0 z-30 mt-1 w-80 rounded-lg border border-ink-border bg-ink-panel shadow-xl shadow-black/40">
          <div className="border-b border-ink-border p-2">
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Cari kabupaten/kota…"
              className="w-full rounded-md border border-ink-border bg-ink-panel2 px-2 py-1.5 text-sm text-ink-text outline-none focus:border-ink-accent/60"
            />
          </div>
          <div className="max-h-72 overflow-y-auto scroll-thin py-1">
            {filtered.map((r, i) => (
              <button
                key={r.domain_id}
                onClick={() => {
                  onChange(r.domain_id);
                  setOpen(false);
                  setQ("");
                }}
                className={`flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm hover:bg-ink-panel2 ${
                  r.domain_id === value ? "text-ink-accent" : "text-ink-text"
                }`}
              >
                <span className="truncate">
                  <span className="mr-1.5 text-xs tabular-nums text-ink-muted">{i + 1}.</span>
                  {r.domain_name}
                </span>
              </button>
            ))}
            {!filtered.length && <div className="px-3 py-4 text-center text-sm text-ink-muted">Tidak ada.</div>}
          </div>
        </div>
      )}
    </div>
  );
}
