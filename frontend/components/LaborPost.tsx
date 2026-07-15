"use client";

import { useEffect, useMemo, useState } from "react";
import { CartesianGrid, Cell, Line, LineChart, Scatter, ScatterChart, Tooltip as RTooltip, XAxis, YAxis, ZAxis, ResponsiveContainer } from "recharts";
import { api, CHART, groupColor, titleCase } from "@/lib/api";
import { type LaborConfig } from "@/lib/posts";
import { Panel } from "@/components/ui";
import { ChoroplethMap, type MapValue } from "@/components/ChoroplethMap";
import { Stat, PageBtn, PillToggle, pearson } from "@/components/sorotan-ui";

const PAGE = 12;
type Metric = "tpt" | "tpakL" | "tpakP" | "gap";
type Row = { domain_id: string; name: string; tpt?: number; tpakL?: number; tpakP?: number; p0?: number };
const MALE = "#1E4585", FEMALE = "#C74B9E";
const METRICS: { k: Metric; short: string; desc: string; fmt: (r: Row) => number | undefined }[] = [
  { k: "tpt", short: "Pengangguran (TPT)", desc: "Tingkat Pengangguran Terbuka: persen angkatan kerja yang menganggur & mencari kerja. Justru tinggi di provinsi industri (Jawa), rendah di provinsi agraris — pertanian menyerap tenaga kerja secara informal.", fmt: (r) => r.tpt },
  { k: "tpakL", short: "Partisipasi Laki-laki", desc: "Tingkat Partisipasi Angkatan Kerja laki-laki: persen penduduk usia kerja laki-laki yang bekerja atau mencari kerja.", fmt: (r) => r.tpakL },
  { k: "tpakP", short: "Partisipasi Perempuan", desc: "Tingkat Partisipasi Angkatan Kerja perempuan — hampir selalu jauh di bawah laki-laki.", fmt: (r) => r.tpakP },
  { k: "gap", short: "Selisih Partisipasi L−P", desc: "Selisih partisipasi angkatan kerja laki-laki dikurangi perempuan — ukuran kesenjangan gender di pasar kerja.", fmt: (r) => (r.tpakL != null && r.tpakP != null ? r.tpakL - r.tpakP : undefined) },
];

export function LaborPost({ config }: { config: LaborConfig }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [tptSeries, setTptSeries] = useState<Map<string, { year: number; value: number }[]>>(new Map());
  const [natSeries, setNatSeries] = useState<{ year: number; value: number }[]>([]);
  const [metric, setMetric] = useState<Metric>("tpt");
  const [sel, setSel] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const y = String(config.latestYear);
    Promise.all([
      api.ranking(config.tptVar, { admin_level: "province", year: y }).then((d) => ({ k: "tpt", d })),
      api.ranking(config.tpakVar, { admin_level: "province", year: y, turvar_id: config.tpakMaleT }).then((d) => ({ k: "tpakL", d })),
      api.ranking(config.tpakVar, { admin_level: "province", year: y, turvar_id: config.tpakFemaleT }).then((d) => ({ k: "tpakP", d })),
      api.ranking(config.povertyVar, { admin_level: "province", year: y }).then((d) => ({ k: "p0", d })),
      api.series(config.tptVar, { admin_level: "province", year_min: String(config.trendFrom) }).then((d) => ({ k: "series", d })),
    ]).then((res) => {
      if (cancelled) return;
      const by = new Map<string, Row>();
      const ensure = (id: string, name: string) => by.get(id) ?? (() => { const r: Row = { domain_id: id, name: fixName(name) }; by.set(id, r); return r; })();
      for (const { k, d } of res) {
        if (k === "series") continue;
        for (const x of (d as { results: { domain_id: string; domain_name: string; value: number }[] }).results) {
          const r = ensure(x.domain_id, x.domain_name);
          if (k === "tpt") r.tpt = x.value; else if (k === "tpakL") r.tpakL = x.value; else if (k === "tpakP") r.tpakP = x.value; else if (k === "p0") r.p0 = x.value;
        }
      }
      setRows([...by.values()]);
      setSel((cur) => (cur && by.has(cur) ? cur : [...by.keys()][0] ?? null));

      const series = (res.find((x) => x.k === "series")!.d as { results: { domain_id: string; year: number | null; value: number }[] }).results;
      const per = new Map<string, { year: number; value: number }[]>();
      const natY = new Map<number, number[]>();
      for (const d of series) {
        if (d.year == null) continue;
        (per.get(d.domain_id) ?? per.set(d.domain_id, []).get(d.domain_id)!).push({ year: d.year, value: d.value });
        (natY.get(d.year) ?? natY.set(d.year, []).get(d.year)!).push(d.value);
      }
      per.forEach((a) => a.sort((x, z) => x.year - z.year));
      setTptSeries(per);
      setNatSeries([...natY.entries()].map(([year, vs]) => ({ year, value: vs.reduce((a, v) => a + v, 0) / vs.length })).sort((a, b) => a.year - b.year));
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [config]);

  const m = METRICS.find((x) => x.k === metric)!;
  const sorted = useMemo(() => [...rows].filter((r) => m.fmt(r) != null).sort((a, b) => (m.fmt(b) ?? 0) - (m.fmt(a) ?? 0)), [rows, metric]);
  const filtered = useMemo(() => (q ? sorted.filter((r) => r.name.toLowerCase().includes(q.toLowerCase())) : sorted), [sorted, q]);
  const pageRows = filtered.slice(page * PAGE, page * PAGE + PAGE);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const maxVal = sorted.length ? m.fmt(sorted[0])! : 1;
  const selected = rows.find((r) => r.domain_id === sel) ?? rows[0];
  const natNow = natSeries[natSeries.length - 1]?.value;

  if (loading && !rows.length) return <div className="flex h-64 items-center justify-center text-sm text-ink-muted">Memuat…</div>;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label={`Pengangguran nasional (rata-rata provinsi) ${config.latestYear}`} value={natNow != null ? `${natNow.toFixed(2)}%` : "–"} sub="TPT — % angkatan kerja menganggur" />
        <Stat label="Pengangguran tertinggi" value={[...rows].filter((r) => r.tpt != null).sort((a, b) => b.tpt! - a.tpt!)[0]?.name ?? "–"} sub={(() => { const t = [...rows].filter((r) => r.tpt != null).sort((a, b) => b.tpt! - a.tpt!)[0]; return t ? `${t.tpt!.toFixed(2)}%` : undefined; })()} />
        <Stat label="Pengangguran terendah" value={[...rows].filter((r) => r.tpt != null).sort((a, b) => a.tpt! - b.tpt!)[0]?.name ?? "–"} sub={(() => { const t = [...rows].filter((r) => r.tpt != null).sort((a, b) => a.tpt! - b.tpt!)[0]; return t ? `${t.tpt!.toFixed(2)}%` : undefined; })()} />
      </div>

      <div className="rounded-xl border border-ink-border bg-ink-panel px-4 py-3">
        <div className="flex flex-wrap gap-2">
          {METRICS.map((mm) => (
            <button key={mm.k} onClick={() => { setMetric(mm.k); setPage(0); }}
              className={`inline-flex items-center rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${metric === mm.k ? "border-transparent bg-brand-gradient text-white" : "border-ink-border text-ink-muted hover:text-ink-text"}`}>{mm.short}</button>
          ))}
        </div>
        <p className="mt-2 text-xs leading-relaxed text-ink-muted">{m.desc}</p>
      </div>

      <Panel>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm font-semibold text-ink-text">Peringkat · {m.short}<span className="ml-2 text-xs font-normal text-ink-muted">{filtered.length} provinsi · #1 = tertinggi</span></div>
          <input value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} placeholder="Cari…" className="w-36 rounded-lg border border-ink-border bg-ink-panel2 px-2.5 py-1.5 text-sm text-ink-text outline-none focus:border-ink-accent/60" />
        </div>
        <div className="space-y-1">
          {pageRows.map((r) => {
            const rank = filtered.indexOf(r) + 1;
            const v = m.fmt(r) ?? 0;
            const on = r.domain_id === selected?.domain_id;
            return (
              <button key={r.domain_id} onClick={() => setSel(r.domain_id)} className={`flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors ${on ? "bg-ink-panel2 ring-1 ring-ink-accent/50" : "hover:bg-ink-panel2/60"}`}>
                <span className="w-6 shrink-0 text-right text-xs tabular-nums text-ink-muted">{rank}</span>
                <span className="w-40 shrink-0 truncate text-sm text-ink-text" title={r.name}>{r.name}</span>
                <span className="h-3 flex-1 overflow-hidden rounded-full bg-ink-panel2 ring-1 ring-ink-border/60"><span className="block h-full rounded-full" style={{ width: `${maxVal ? Math.max(2, (v / maxVal) * 100) : 0}%`, background: CHART.accent }} /></span>
                <span className="w-14 shrink-0 text-right text-sm tabular-nums text-ink-text">{v.toFixed(2)}%</span>
              </button>
            );
          })}
        </div>
        <div className="mt-3 flex items-center justify-between text-xs text-ink-muted">
          <span>{filtered.length ? page * PAGE + 1 : 0}–{Math.min((page + 1) * PAGE, filtered.length)} dari {filtered.length}</span>
          <div className="flex items-center gap-1"><PageBtn disabled={page === 0} onClick={() => setPage((p) => p - 1)}>‹</PageBtn><span className="px-1 tabular-nums">{page + 1}/{pages}</span><PageBtn disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)}>›</PageBtn></div>
        </div>
      </Panel>

      {selected && <Detail row={selected} series={tptSeries.get(selected.domain_id) ?? null} nat={natSeries} />}
      <ScatterPanel rows={rows} />
      <MapPanel rows={rows} metric={metric} m={m} />
    </div>
  );
}

function fixName(n: string) { return titleCase(n).replace(/\bDki\b/, "DKI").replace(/\bDi\b/, "DI"); }

function Detail({ row, series, nat }: { row: Row; series: { year: number; value: number }[] | null; nat: { year: number; value: number }[] }) {
  const merged = useMemo(() => { if (!series) return []; const nm = new Map(nat.map((n) => [n.year, n.value])); return series.map((s) => ({ year: s.year, prov: s.value, nat: nm.get(s.year) })); }, [series, nat]);
  const gap = row.tpakL != null && row.tpakP != null ? row.tpakL - row.tpakP : null;
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 pt-2"><div className="h-px flex-1 bg-ink-border" /><div className="text-xs font-medium uppercase tracking-wide text-ink-muted">Rincian · {row.name}</div><div className="h-px flex-1 bg-ink-border" /></div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Pengangguran (TPT)" value={row.tpt != null ? `${row.tpt.toFixed(2)}%` : "–"} />
        <Stat label="Partisipasi ♂" value={row.tpakL != null ? `${row.tpakL.toFixed(1)}%` : "–"} />
        <Stat label="Partisipasi ♀" value={row.tpakP != null ? `${row.tpakP.toFixed(1)}%` : "–"} sub={gap != null ? `selisih ${gap.toFixed(1)} poin` : undefined} />
        <Stat label="Kemiskinan (P0)" value={row.p0 != null ? `${row.p0.toFixed(2)}%` : "–"} sub="konteks" />
      </div>
      {merged.length > 1 && (
        <Panel>
          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-muted">Pengangguran (TPT) · {merged[0].year}–{merged[merged.length - 1].year} · perhatikan lonjakan 2020 (COVID)</div>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={merged} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
              <CartesianGrid stroke={CHART.grid} vertical={false} />
              <XAxis dataKey="year" tick={{ fill: CHART.axisTick, fontSize: 12 }} axisLine={{ stroke: CHART.axisLine }} tickLine={false} />
              <YAxis tick={{ fill: CHART.axisTick, fontSize: 12 }} axisLine={{ stroke: CHART.axisLine }} tickLine={false} width={40} tickFormatter={(v) => `${v}%`} />
              <RTooltip contentStyle={{ background: CHART.tooltipBg, border: `1px solid ${CHART.tooltipBorder}`, borderRadius: 8 }} formatter={(v: number, n: string) => [`${v?.toFixed(2)}%`, n === "prov" ? row.name : "Nasional (rata-rata)"]} />
              <Line type="monotone" dataKey="prov" stroke={CHART.accent} strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="nat" stroke="#94A3B8" strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </Panel>
      )}
    </div>
  );
}

// The counterintuitive cut: TPT vs poverty. Industrial provinces have high open
// unemployment yet low poverty; agrarian ones the reverse.
function ScatterPanel({ rows }: { rows: Row[] }) {
  const points = useMemo(() => rows.filter((r) => r.tpt != null && r.p0 != null).map((r) => ({ x: r.tpt!, y: r.p0!, name: r.name, fill: groupColor(r.domain_id.slice(0, 2)) })), [rows]);
  const r = useMemo(() => pearson(points.map((p) => p.x), points.map((p) => p.y)), [points]);
  return (
    <Panel>
      <div className="mb-1 text-sm font-semibold text-ink-text">Pengangguran vs Kemiskinan</div>
      <div className="mb-3 text-xs text-ink-muted">Korelasi (r) = <span className={`font-semibold ${Math.abs(r) >= 0.5 ? "text-ink-text" : "text-ink-muted"}`}>{isNaN(r) ? "–" : r.toFixed(2)}</span> · {points.length} provinsi · sumbu X: TPT, Y: kemiskinan (P0). Korelasi lemah/negatif: provinsi industri bisa punya pengangguran tinggi tapi kemiskinan rendah.</div>
      <ResponsiveContainer width="100%" aspect={1.4} className="mx-auto max-w-[600px]">
        <ScatterChart margin={{ top: 8, right: 16, bottom: 24, left: 8 }}>
          <CartesianGrid stroke={CHART.grid} />
          <XAxis type="number" dataKey="x" name="TPT" unit="%" tick={{ fill: CHART.axisTick, fontSize: 12 }} axisLine={{ stroke: CHART.axisLine }} tickLine={false} label={{ value: "Pengangguran (TPT)", position: "insideBottom", offset: -12, fill: CHART.axisTick, fontSize: 11 }} />
          <YAxis type="number" dataKey="y" name="P0" unit="%" tick={{ fill: CHART.axisTick, fontSize: 12 }} axisLine={{ stroke: CHART.axisLine }} tickLine={false} width={44} />
          <ZAxis range={[36, 36]} />
          <RTooltip cursor={{ strokeDasharray: "3 3" }} content={({ payload }) => payload && payload.length ? (
            <div className="rounded-lg border border-ink-border bg-ink-panel px-3 py-2 text-xs shadow-panel"><div className="font-medium text-ink-text">{payload[0].payload.name}</div><div className="mt-0.5 text-ink-muted">TPT: {payload[0].payload.x.toFixed(2)}%</div><div className="text-ink-muted">Kemiskinan: {payload[0].payload.y.toFixed(2)}%</div></div>
          ) : null} />
          <Scatter data={points} fillOpacity={0.75}>{points.map((p, i) => <Cell key={i} fill={p.fill} />)}</Scatter>
        </ScatterChart>
      </ResponsiveContainer>
    </Panel>
  );
}

function MapPanel({ rows, metric, m }: { rows: Row[]; metric: Metric; m: { fmt: (r: Row) => number | undefined } }) {
  const values = useMemo(() => { const map = new Map<string, MapValue>(); for (const r of rows) { const v = m.fmt(r); if (v != null) map.set(r.domain_id.slice(0, 2), { value: Math.round(v * 10) / 10, name: r.name }); } return map; }, [rows, metric]);
  const vals = [...values.values()].map((v) => v.value);
  const min = vals.length ? Math.min(...vals) : 0;
  const max = vals.length ? Math.max(...vals) : 10;
  return (
    <Panel>
      <div className="mb-3 text-sm font-semibold text-ink-text">Peta · provinsi</div>
      <ChoroplethMap values={values} min={min} max={max} unit="%" geojsonUrls={["/dukcapil-provinces.geojson"]} />
    </Panel>
  );
}
