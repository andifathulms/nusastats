"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid, Cell, ReferenceLine, Scatter, ScatterChart, Tooltip as RTooltip, XAxis, YAxis, ZAxis, ResponsiveContainer,
} from "recharts";
import { api, bpsRegionLabel, CHART, dukcapilApi, groupColor, type RegencyCrosswalk } from "@/lib/api";
import { type ProsperityConfig } from "@/lib/posts";
import { Panel } from "@/components/ui";
import { ChoroplethMap, type MapValue } from "@/components/ChoroplethMap";
import { Stat, PageBtn, PillToggle, pearson } from "@/components/sorotan-ui";

const PAGE = 10;
type Row = {
  domain_id: string; name: string; provCode: string; provName: string;
  perkap: number; // PDRB per capita, Juta Rp/orang (reconstructed)
  p0: number; // poverty headcount %
  pdrb: number; // PDRB total, Milyar Rupiah
  poor: number; // poor count, ribu jiwa
};
type MetricKey = "perkap" | "p0" | "pdrb";
const METRICS: { key: MetricKey; short: string; desc: string; color: string }[] = [
  { key: "perkap", short: "PDRB per kapita", desc: "Output ekonomi per penduduk (PDRB harga berlaku ÷ jumlah penduduk) — ukuran 'kekayaan' produksi daerah, bukan yang dinikmati warga.", color: "#15803D" },
  { key: "p0", short: "Kemiskinan (P0)", desc: "Persentase penduduk miskin — seberapa banyak warga yang tak menikmati output itu.", color: "#C0392B" },
  { key: "pdrb", short: "PDRB total", desc: "Ukuran besar ekonomi daerah secara keseluruhan (harga berlaku).", color: "#1E4585" },
];

// perkap in Juta Rp/orang → "Rp X jt" or "Rp X,X M" (miliar) when ≥1000.
function rpKap(juta: number): string {
  if (juta >= 1000) return `Rp ${(juta / 1000).toLocaleString("id-ID", { maximumFractionDigits: 2 })} M`;
  return `Rp ${juta.toLocaleString("id-ID", { maximumFractionDigits: 0 })} jt`;
}
function rpMilyar(milyar: number): string {
  if (milyar >= 1000) return `Rp ${(milyar / 1000).toLocaleString("id-ID", { maximumFractionDigits: 1 })} T`;
  return `Rp ${milyar.toLocaleString("id-ID", { maximumFractionDigits: 0 })} M`;
}
const fmtMetric = (k: MetricKey, v: number) => (k === "perkap" ? rpKap(v) : k === "p0" ? `${v.toFixed(2)}%` : rpMilyar(v));
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; };

export function ProsperityPost({ config }: { config: ProsperityConfig }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [xwalk, setXwalk] = useState<Map<string, RegencyCrosswalk>>(new Map());
  const [metric, setMetric] = useState<MetricKey>("perkap");
  const [sel, setSel] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const y = String(config.latestYear);
    Promise.all([
      api.ranking(config.pdrbVariableId, { admin_level: "regency", year: y, turvar_id: config.pdrbTotalTurvar }),
      api.ranking(config.poorCountVariableId, { admin_level: "regency", year: y }),
      api.ranking(config.povertyRateVariableId, { admin_level: "regency", year: y }),
      dukcapilApi.regencyCrosswalk(),
    ]).then(([pdrb, poor, p0, cw]) => {
      if (cancelled) return;
      const xw = new Map(cw.results.map((x) => [x.bps_domain_id, x]));
      setXwalk(xw);
      const poorMap = new Map(poor.results.map((d) => [d.domain_id, d.value]));
      const p0Map = new Map(p0.results.map((d) => [d.domain_id, d.value]));
      const list: Row[] = [];
      for (const d of pdrb.results) {
        const pv = p0Map.get(d.domain_id), pc = poorMap.get(d.domain_id);
        if (pv == null || pc == null || pv <= 0) continue;
        const pop = (pc / pv) * 100; // ribu jiwa (reconstructed, BPS-consistent)
        if (pop <= 0) continue;
        list.push({
          domain_id: d.domain_id,
          name: bpsRegionLabel(d.domain_name, d.domain_id),
          provCode: xw.get(d.domain_id)?.prov_code ?? d.domain_id.slice(0, 2),
          provName: xw.get(d.domain_id)?.prov_name ?? d.domain_id.slice(0, 2),
          perkap: d.value / pop, // Juta Rp/orang
          p0: pv,
          pdrb: d.value,
          poor: pc,
        });
      }
      setRows(list);
      setSel((cur) => (cur && list.some((r) => r.domain_id === cur) ? cur : list[0]?.domain_id ?? null));
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [config]);

  const val = (r: Row, k: MetricKey) => r[k];
  const sorted = useMemo(() => [...rows].sort((a, b) => val(b, metric) - val(a, metric)), [rows, metric]);
  const filtered = useMemo(() => (q ? sorted.filter((r) => r.name.toLowerCase().includes(q.toLowerCase())) : sorted), [sorted, q]);
  const pageRows = filtered.slice(page * PAGE, page * PAGE + PAGE);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const maxVal = sorted[0] ? val(sorted[0], metric) : 1;
  const selected = rows.find((r) => r.domain_id === sel) ?? rows[0];
  const m = METRICS.find((x) => x.key === metric)!;

  const medPerkap = useMemo(() => median(rows.map((r) => r.perkap)), [rows]);
  const medP0 = useMemo(() => median(rows.map((r) => r.p0)), [rows]);
  // "Paradox" regions: prosperity above median yet poverty above median.
  const paradox = useMemo(() => rows.filter((r) => r.perkap > medPerkap && r.p0 > medP0).sort((a, b) => b.perkap - a.perkap), [rows, medPerkap, medP0]);
  const corr = useMemo(() => pearson(rows.map((r) => Math.log(r.perkap)), rows.map((r) => r.p0)), [rows]);

  if (loading && !rows.length) return <div className="flex h-64 items-center justify-center text-sm text-ink-muted">Memuat…</div>;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="PDRB per kapita tertinggi" value={sorted[0] ? rpKap([...rows].sort((a, b) => b.perkap - a.perkap)[0].perkap) : "–"} sub={[...rows].sort((a, b) => b.perkap - a.perkap)[0]?.name} />
        <Stat label="Kaya tapi tetap miskin" value={paradox[0]?.name ?? "–"} sub={paradox[0] ? `${rpKap(paradox[0].perkap)}/org · P0 ${paradox[0].p0.toFixed(1)}%` : undefined} />
        <Stat label="Korelasi makmur–miskin" value={isNaN(corr) ? "–" : corr.toFixed(2)} sub="ln(PDRB/kapita) vs P0 — lemah = kekayaan ≠ kesejahteraan" />
      </div>

      {/* Metric chips */}
      <div className="rounded-xl border border-ink-border bg-ink-panel px-4 py-3">
        <div className="flex flex-wrap gap-2">
          {METRICS.map((mm) => (
            <button key={mm.key} onClick={() => { setMetric(mm.key); setPage(0); }}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${metric === mm.key ? "border-transparent text-white" : "border-ink-border text-ink-muted hover:text-ink-text"}`}
              style={metric === mm.key ? { background: mm.color } : undefined}>
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: mm.color }} />{mm.short}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs leading-relaxed text-ink-muted">{m.desc}</p>
      </div>

      {/* Ranking */}
      <Panel>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm font-semibold text-ink-text">
            Peringkat · {m.short}
            <span className="ml-2 text-xs font-normal text-ink-muted">{filtered.length} kabupaten/kota · #1 = tertinggi</span>
          </div>
          <input value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} placeholder="Cari…"
            className="w-36 rounded-lg border border-ink-border bg-ink-panel2 px-2.5 py-1.5 text-sm text-ink-text outline-none focus:border-ink-accent/60" />
        </div>
        <div className="space-y-1">
          {pageRows.map((r) => {
            const rank = filtered.indexOf(r) + 1;
            const v = val(r, metric);
            const on = r.domain_id === selected?.domain_id;
            const flag = r.perkap > medPerkap && r.p0 > medP0;
            return (
              <button key={r.domain_id} onClick={() => setSel(r.domain_id)}
                className={`flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors ${on ? "bg-ink-panel2 ring-1 ring-ink-accent/50" : "hover:bg-ink-panel2/60"}`}>
                <span className="w-6 shrink-0 text-right text-xs tabular-nums text-ink-muted">{rank}</span>
                <span className="w-40 shrink-0 truncate text-sm text-ink-text" title={r.name}>
                  {r.name}
                  {flag && <span className="ml-1 rounded bg-amber-500/15 px-1 text-[10px] font-medium text-amber-600" title="PDRB per kapita & kemiskinan sama-sama di atas median">timpang</span>}
                </span>
                <span className="h-3 flex-1 overflow-hidden rounded-full bg-ink-panel2 ring-1 ring-ink-border/60">
                  <span className="block h-full rounded-full" style={{ width: `${maxVal ? Math.max(2, (v / maxVal) * 100) : 0}%`, background: m.color }} />
                </span>
                <span className="w-24 shrink-0 text-right text-sm tabular-nums text-ink-text">{fmtMetric(metric, v)}</span>
              </button>
            );
          })}
        </div>
        <div className="mt-3 flex items-center justify-between text-xs text-ink-muted">
          <span>{filtered.length ? page * PAGE + 1 : 0}–{Math.min((page + 1) * PAGE, filtered.length)} dari {filtered.length}</span>
          <div className="flex items-center gap-1">
            <PageBtn disabled={page === 0} onClick={() => setPage((p) => p - 1)}>‹</PageBtn>
            <span className="px-1 tabular-nums">{page + 1}/{pages}</span>
            <PageBtn disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)}>›</PageBtn>
          </div>
        </div>
      </Panel>

      {selected && <Detail row={selected} medPerkap={medPerkap} medP0={medP0} />}
      <ParadoxScatter rows={rows} medPerkap={medPerkap} medP0={medP0} />
      <MapPanel rows={rows} metric={metric} xwalk={xwalk} />
    </div>
  );
}

function Detail({ row, medPerkap, medP0 }: { row: Row; medPerkap: number; medP0: number }) {
  const paradox = row.perkap > medPerkap && row.p0 > medP0;
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 pt-2">
        <div className="h-px flex-1 bg-ink-border" />
        <div className="text-xs font-medium uppercase tracking-wide text-ink-muted">Rincian · {row.name}</div>
        <div className="h-px flex-1 bg-ink-border" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="PDRB per kapita" value={rpKap(row.perkap)} sub="per orang/tahun (perkiraan)" />
        <Stat label="Kemiskinan (P0)" value={`${row.p0.toFixed(2)}%`} sub={`${row.poor.toLocaleString("id-ID", { maximumFractionDigits: 0 })} rb penduduk miskin`} />
        <Stat label="PDRB total" value={rpMilyar(row.pdrb)} sub="harga berlaku" />
        <Stat label="Perkiraan penduduk" value={`${(row.poor / row.p0 * 100 / 1000).toLocaleString("id-ID", { maximumFractionDigits: 2 })} jt`} sub="dari 619 ÷ 621" />
      </div>
      <Panel>
        <p className="text-sm leading-relaxed text-ink-text/90">
          <span className="font-medium">{row.name}</span> menghasilkan sekitar <span className="font-medium" style={{ color: "#15803D" }}>{rpKap(row.perkap)}</span> output ekonomi per penduduk per tahun,
          namun <span className="font-medium" style={{ color: "#C0392B" }}>{row.p0.toFixed(1)}%</span> penduduknya masih miskin.
          {paradox
            ? " Keduanya sama-sama di atas median nasional — potret klasik daerah yang kaya secara produksi (sering karena tambang/migas) tapi kekayaannya belum menetes ke warga."
            : " "}
        </p>
      </Panel>
    </div>
  );
}

// Signature: log(PDRB per kapita) vs poverty rate. Median lines split four
// quadrants; the top-right (rich yet poor) is the paradox zone.
function ParadoxScatter({ rows, medPerkap, medP0 }: { rows: Row[]; medPerkap: number; medP0: number }) {
  const [selProvs, setSelProvs] = useState<Set<string>>(new Set());
  const provs = useMemo(() => {
    const s = new Map<string, string>();
    rows.forEach((r) => s.set(r.provCode, r.provName));
    return [...s.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows]);
  const points = useMemo(() => rows.filter((r) => !selProvs.size || selProvs.has(r.provCode))
    .map((r) => ({ x: r.perkap, y: r.p0, name: r.name, fill: groupColor(r.provCode) })), [rows, selProvs]);

  return (
    <Panel>
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-ink-text">Kemakmuran vs Kemiskinan</span>
      </div>
      <div className="mb-2 text-xs text-ink-muted">
        Sumbu X: PDRB per kapita (skala log) · Sumbu Y: kemiskinan (P0). {points.length} kab/kota · warna = provinsi.
        Kuadrant <span className="text-amber-600 font-medium">kanan-atas</span> = output tinggi tapi kemiskinan tetap tinggi (kaya tapi timpang).
      </div>
      <div className="mb-3 flex flex-wrap gap-x-3 gap-y-1">
        {selProvs.size > 0 && <button onClick={() => setSelProvs(new Set())} className="text-xs text-ink-accent hover:underline">Semua provinsi</button>}
        {provs.map(([code, name]) => {
          const on = selProvs.size === 0 || selProvs.has(code);
          return (
            <button key={code} onClick={() => setSelProvs((cur) => { const n = new Set(cur); n.has(code) ? n.delete(code) : n.add(code); return n; })}
              className={`inline-flex items-center gap-1.5 text-xs transition-opacity ${on ? "opacity-100" : "opacity-30"}`} title={name}>
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: groupColor(code) }} /><span className="text-ink-muted">{name}</span>
            </button>
          );
        })}
      </div>
      <ResponsiveContainer width="100%" aspect={1.4} className="mx-auto max-w-[640px]">
        <ScatterChart margin={{ top: 8, right: 16, bottom: 24, left: 8 }}>
          <CartesianGrid stroke={CHART.grid} />
          <XAxis type="number" dataKey="x" name="PDRB/kapita" scale="log" domain={["auto", "auto"]} allowDataOverflow
            tick={{ fill: CHART.axisTick, fontSize: 12 }} axisLine={{ stroke: CHART.axisLine }} tickLine={false}
            tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}M` : `${v}jt`)}
            label={{ value: "PDRB per kapita (log)", position: "insideBottom", offset: -12, fill: CHART.axisTick, fontSize: 11 }} />
          <YAxis type="number" dataKey="y" name="P0" unit="%" tick={{ fill: CHART.axisTick, fontSize: 12 }} axisLine={{ stroke: CHART.axisLine }} tickLine={false} width={44} />
          <ZAxis range={[30, 30]} />
          <ReferenceLine x={medPerkap} stroke={CHART.axisLine} strokeDasharray="4 4" />
          <ReferenceLine y={medP0} stroke={CHART.axisLine} strokeDasharray="4 4" />
          <RTooltip cursor={{ strokeDasharray: "3 3" }} content={({ payload }) => payload && payload.length ? (
            <div className="rounded-lg border border-ink-border bg-ink-panel px-3 py-2 text-xs shadow-panel">
              <div className="font-medium text-ink-text">{payload[0].payload.name}</div>
              <div className="mt-0.5 text-ink-muted">PDRB/kapita: {rpKap(payload[0].payload.x)}</div>
              <div className="text-ink-muted">Kemiskinan: {payload[0].payload.y.toFixed(2)}%</div>
            </div>
          ) : null} />
          <Scatter data={points} fillOpacity={0.72}>{points.map((p, i) => <Cell key={i} fill={p.fill} />)}</Scatter>
        </ScatterChart>
      </ResponsiveContainer>
    </Panel>
  );
}

function MapPanel({ rows, metric, xwalk }: { rows: Row[]; metric: MetricKey; xwalk: Map<string, RegencyCrosswalk> }) {
  const [key, setKey] = useState<MetricKey>(metric);
  useEffect(() => setKey(metric), [metric]);
  const { values, unit } = useMemo(() => {
    const map = new Map<string, MapValue>();
    for (const r of rows) {
      const kem = xwalk.get(r.domain_id)?.kemendagri_code;
      if (!kem) continue;
      const v = key === "pdrb" ? r.pdrb / 1000 : r[key]; // pdrb → Triliun
      map.set(kem, { value: Math.round(v * 100) / 100, name: r.name });
    }
    return { values: map, unit: key === "perkap" ? "jt" : key === "p0" ? "%" : "T" };
  }, [rows, key, xwalk]);
  const vals = [...values.values()].map((v) => v.value);
  const min = vals.length ? Math.min(...vals) : 0;
  const max = vals.length ? Math.max(...vals) : 1;

  return (
    <Panel>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-ink-text">Peta · kabupaten/kota</span>
        <select value={key} onChange={(e) => setKey(e.target.value as MetricKey)} className="ml-auto rounded-lg border border-ink-border bg-ink-panel2 px-2 py-1.5 text-sm text-ink-text outline-none focus:border-ink-accent/60">
          {METRICS.map((mm) => <option key={mm.key} value={mm.key}>{mm.short}</option>)}
        </select>
      </div>
      <ChoroplethMap values={values} min={min} max={max} unit={unit} geojsonUrls={["/dukcapil-regencies.geojson"]} />
    </Panel>
  );
}
