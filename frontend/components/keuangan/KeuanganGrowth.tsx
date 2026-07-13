"use client";

import { useEffect, useMemo, useState } from "react";
import { djpkApi, formatRupiah, type DjpkGrowth, type DjpkMeasure, type DjpkRegionLevel, type DjpkSummary } from "@/lib/api";
import { Panel, SectionTitle } from "@/components/ui";
import { Field } from "@/components/keuangan/controls";

export function KeuanganGrowth({
  akun,
  label,
  level,
  measure,
  years,
}: {
  akun: string;
  label: string;
  level: DjpkRegionLevel;
  measure: DjpkMeasure;
  years: DjpkSummary["years"];
}) {
  const sorted = useMemo(() => [...years].sort((a, b) => a - b), [years]);
  const [from, setFrom] = useState<number>(sorted[0]);
  const [to, setTo] = useState<number>(sorted[sorted.length - 1]);
  const [data, setData] = useState<DjpkGrowth | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (from == null || to == null) return;
    setLoading(true);
    setData(null);
    djpkApi
      .growth({ akun, measure, level, from: String(from), to: String(to), order: "desc" })
      .then(setData)
      .finally(() => setLoading(false));
  }, [akun, measure, level, from, to]);

  const isPct = measure === "persentase";
  const rows = data?.results ?? [];
  const maxAbsPct = Math.max(1, ...rows.map((r) => Math.abs(r.change_pct ?? 0)));
  const fmt = (v: number) => (isPct ? `${v.toLocaleString("id-ID", { maximumFractionDigits: 1 })}%` : formatRupiah(v));

  return (
    <div className="space-y-4">
      <Panel>
        <div className="flex flex-wrap items-end gap-4">
          <Field label="Dari tahun">
            <select value={from} onChange={(e) => setFrom(Number(e.target.value))} className="rounded-lg border border-ink-border bg-ink-panel px-3 py-2 text-sm text-ink-text">
              {sorted.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </Field>
          <Field label="Ke tahun">
            <select value={to} onChange={(e) => setTo(Number(e.target.value))} className="rounded-lg border border-ink-border bg-ink-panel px-3 py-2 text-sm text-ink-text">
              {sorted.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </Field>
        </div>
      </Panel>

      <Panel>
        <SectionTitle hint={loading ? "memuat…" : data ? `${data.total} wilayah · ${from}→${to}` : ""}>
          Pertumbuhan {label}
        </SectionTitle>
        {!loading && (
          <div className="space-y-1.5">
            {rows.map((r) => {
              const pct = r.change_pct ?? 0;
              const w = Math.round((Math.abs(pct) / maxAbsPct) * 100);
              const up = pct >= 0;
              return (
                <div key={r.domain_id} className="flex items-center gap-3">
                  <div className="w-6 shrink-0 text-right text-xs tabular-nums text-ink-muted">{r.rank}</div>
                  <div className="w-40 shrink-0 truncate text-sm text-ink-text" title={r.domain_name}>{r.domain_name}</div>
                  <div className="flex flex-1 items-center gap-2">
                    <div className="relative h-4 flex-1 overflow-hidden rounded bg-ink-panel2">
                      <div className="h-full rounded" style={{ width: `${w}%`, background: up ? "#15803D" : "#DC2626" }} />
                    </div>
                    <span className={`w-16 shrink-0 text-right text-xs tabular-nums ${up ? "text-emerald-600" : "text-rose-600"}`}>
                      {up ? "+" : ""}{pct.toLocaleString("id-ID", { maximumFractionDigits: 1 })}%
                    </span>
                  </div>
                  <div className="hidden w-44 shrink-0 text-right text-xs tabular-nums text-ink-muted sm:block">
                    {fmt(r.value_from)} → {fmt(r.value_to)}
                  </div>
                </div>
              );
            })}
            {rows.length === 0 && data && <div className="text-sm text-ink-muted">Tidak ada data untuk rentang ini.</div>}
          </div>
        )}
      </Panel>
    </div>
  );
}
