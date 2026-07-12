"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid, Cell, Line, LineChart, Scatter, ScatterChart, Tooltip as RTooltip,
  XAxis, YAxis, ZAxis, ResponsiveContainer,
} from "recharts";
import { api, bpsRegionLabel, CHART, dukcapilApi, groupColor, type RegencyCrosswalk } from "@/lib/api";
import { type HdiConfig, type HdiMetric } from "@/lib/posts";
import { Panel } from "@/components/ui";
import { ChoroplethMap, type MapValue } from "@/components/ChoroplethMap";
import { Stat, PageBtn, PillToggle, pearson } from "@/components/sorotan-ui";

const PAGE = 10;
type Level = "province" | "regency";
type Cell4 = { value: number; rank: number };
type Row = { domain_id: string; name: string; provCode: string; provName: string; byKey: Record<string, Cell4> };

// Colour per metric — the composite is coloured by its category instead.
const METRIC_COLOR: Record<string, string> = {
  ipm: "#1E4585",
  uhh: "#0E8F9C", // health — teal
  hls: "#1E4585", // education — navy
  rls: "#5B8DEF", // education — light blue
  income: "#C49A48", // living standard — gold
};
const POV = "#C0392B"; // poverty axis in the scatter

function categoryOf(v: number, cats: HdiConfig["categories"]) {
  return [...cats].sort((a, b) => b.min - a.min).find((c) => v >= c.min) ?? cats[cats.length - 1];
}

function fmtVal(m: HdiMetric, v: number | undefined): string {
  if (v == null) return "–";
  if (m.key === "income") return `Rp ${(v / 1000).toLocaleString("id-ID", { maximumFractionDigits: 1 })} jt/th`;
  const s = v.toLocaleString("id-ID", { minimumFractionDigits: m.decimals, maximumFractionDigits: m.decimals });
  return m.unit === "Tahun" ? `${s} th` : s;
}
// Value for a scatter axis (income → juta, poverty → %, else raw).
const axisVal = (key: string, v: number) => (key === "income" ? v / 1000 : v);
const axisUnit = (key: string) => (key === "income" ? "jt" : key === "p0" ? "%" : "");

export function HdiPost({ config }: { config: HdiConfig }) {
  const metricByKey = useMemo(() => Object.fromEntries(config.metrics.map((m) => [m.key, m])) as Record<string, HdiMetric>, [config.metrics]);
  const dims = useMemo(() => config.metrics.filter((m) => m.key !== config.compositeKey), [config.metrics, config.compositeKey]);
  const composite = metricByKey[config.compositeKey];

  const [level, setLevel] = useState<Level>("regency");
  const [rows, setRows] = useState<Row[]>([]);
  const [series, setSeries] = useState<Map<string, { year: number; value: number }[]>>(new Map());
  const [rankByYear, setRankByYear] = useState<Map<string, Record<number, number>>>(new Map());
  const [national, setNational] = useState<{ year: number; value: number }[]>([]);
  const [xwalk, setXwalk] = useState<Map<string, RegencyCrosswalk>>(new Map());
  const [metric, setMetric] = useState<string>(config.compositeKey);
  const [sel, setSel] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);

  // National composite series + crosswalk (level-independent, once).
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api.series(composite.variableId, { admin_level: "national" }).catch(() => null),
      dukcapilApi.regencyCrosswalk(),
    ]).then(([ns, cw]) => {
      if (cancelled) return;
      setXwalk(new Map(cw.results.map((x) => [x.bps_domain_id, x])));
      if (ns) setNational(ns.results.filter((d) => d.year != null).map((d) => ({ year: d.year!, value: d.value })).sort((a, b) => a.year - b.year));
    });
    return () => { cancelled = true; };
  }, [composite.variableId]);

  // Per-level: composite + every dimension ranking (latest) + optional poverty
  // ranking, joined into rows; plus the composite's full history.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      Promise.all(config.metrics.map((m) => api.ranking(m.variableId, { admin_level: level, year: String(config.latestYear) }).then((r) => ({ key: m.key, r })))),
      config.povertyVariableId
        ? api.ranking(config.povertyVariableId, { admin_level: level, year: String(config.latestYear) }).then((r) => ({ key: "p0", r })).catch(() => null)
        : Promise.resolve(null),
      api.series(composite.variableId, { admin_level: level }),
    ]).then(([rankings, pov, hist]) => {
      if (cancelled) return;
      const byRegion = new Map<string, Row>();
      const all = pov ? [...rankings, pov] : rankings;
      for (const { key, r } of all) {
        for (const d of r.results) {
          const cur =
            byRegion.get(d.domain_id) ??
            (() => {
              const isProv = level === "province";
              const provCode = isProv ? d.domain_id.slice(0, 2) : xwalk.get(d.domain_id)?.prov_code ?? d.domain_id.slice(0, 2);
              const provName = isProv ? d.domain_name : xwalk.get(d.domain_id)?.prov_name ?? provCode;
              return { domain_id: d.domain_id, name: isProv ? d.domain_name : bpsRegionLabel(d.domain_name, d.domain_id), provCode, provName, byKey: {} as Record<string, Cell4> };
            })();
          cur.byKey[key] = { value: d.value, rank: d.rank };
          byRegion.set(d.domain_id, cur);
        }
      }
      const rowList = [...byRegion.values()];
      setRows(rowList);
      setSel((cur) => (cur && byRegion.has(cur) ? cur : rowList[0]?.domain_id ?? null));

      const h = new Map<string, { year: number; value: number }[]>();
      for (const d of hist.results) {
        if (d.year == null) continue;
        const arr = h.get(d.domain_id) ?? [];
        arr.push({ year: d.year, value: d.value });
        h.set(d.domain_id, arr);
      }
      h.forEach((arr) => arr.sort((a, b) => a.year - b.year));
      const rank = new Map<string, Record<number, number>>();
      const years = [...new Set(hist.results.map((d) => d.year).filter((y): y is number => y != null))];
      for (const y of years) {
        hist.results.filter((d) => d.year === y).sort((a, b) => b.value - a.value).forEach((d, i) => {
          const m = rank.get(d.domain_id) ?? {};
          m[y] = i + 1;
          rank.set(d.domain_id, m);
        });
      }
      setSeries(h);
      setRankByYear(rank);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [level, config.metrics, config.povertyVariableId, config.latestYear, composite.variableId, xwalk]);

  const m = metricByKey[metric];
  const sorted = useMemo(() => [...rows].sort((a, b) => (b.byKey[metric]?.value ?? -Infinity) - (a.byKey[metric]?.value ?? -Infinity)), [rows, metric]);
  const filtered = useMemo(() => (q ? sorted.filter((r) => r.name.toLowerCase().includes(q.toLowerCase())) : sorted), [sorted, q]);
  const pageRows = filtered.slice(page * PAGE, page * PAGE + PAGE);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const maxVal = sorted[0]?.byKey[metric]?.value ?? 1;
  const minVal = useMemo(() => Math.min(...sorted.map((r) => r.byKey[metric]?.value ?? Infinity)), [sorted, metric]);
  const selected = rows.find((r) => r.domain_id === sel) ?? rows[0];

  const natLast = national[national.length - 1];
  const natFirst = national[0];
  const catCounts = useMemo(() => {
    const c = new Map<string, number>();
    rows.forEach((r) => {
      const v = r.byKey[config.compositeKey]?.value;
      if (v == null) return;
      const cat = categoryOf(v, config.categories).label;
      c.set(cat, (c.get(cat) ?? 0) + 1);
    });
    return c;
  }, [rows, config.categories, config.compositeKey]);

  if (loading && !rows.length) return <div className="flex h-64 items-center justify-center text-sm text-ink-muted">Memuat…</div>;

  // Bar length uses a zoomed floor (min−pad) so IPM's ~55–89 range spreads out.
  const floor = Math.max(0, minVal - (maxVal - minVal) * 0.15);
  const span = maxVal - floor || 1;

  return (
    <div className="space-y-4">
      {natLast && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Stat label={`IPM nasional ${natLast.year}`} value={natLast.value.toFixed(2)} sub={natFirst ? `dari ${natFirst.value.toFixed(2)} di ${natFirst.year}` : undefined} />
          <Stat label={`Wilayah "Sangat Tinggi" (≥80)`} value={`${catCounts.get("Sangat Tinggi") ?? 0}`} sub={`dari ${rows.length} ${level === "province" ? "provinsi" : "kab/kota"}`} />
          <Stat label="Termuda pembangunannya" value={worstName(rows, config.compositeKey)} sub={`IPM terendah`} />
        </div>
      )}

      {/* Category strip */}
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 rounded-xl border border-ink-border bg-ink-panel px-4 py-3">
        {config.categories.map((c) => (
          <span key={c.label} className="inline-flex items-center gap-1.5 text-xs text-ink-muted">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: c.color }} />
            {c.label} <span className="tabular-nums text-ink-text">{catCounts.get(c.label) ?? 0}</span>
          </span>
        ))}
      </div>

      {/* Metric chips */}
      <div className="rounded-xl border border-ink-border bg-ink-panel px-4 py-3">
        <div className="flex flex-wrap gap-2">
          {config.metrics.map((mm) => (
            <button
              key={mm.key}
              onClick={() => { setMetric(mm.key); setPage(0); }}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${metric === mm.key ? "border-transparent text-white" : "border-ink-border text-ink-muted hover:text-ink-text"}`}
              style={metric === mm.key ? { background: METRIC_COLOR[mm.key] ?? CHART.accent } : undefined}
            >
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: METRIC_COLOR[mm.key] ?? CHART.accent }} />
              {mm.short}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs leading-relaxed text-ink-muted">{m.desc}</p>
      </div>

      {/* Ranking */}
      <Panel>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm font-semibold text-ink-text">
            Peringkat · {m.label}
            <span className="ml-2 text-xs font-normal text-ink-muted">{filtered.length} {level === "province" ? "provinsi" : "kabupaten/kota"} · #1 = tertinggi</span>
          </div>
          <div className="flex items-center gap-2">
            <PillToggle opts={[["regency", "Kab/Kota"], ["province", "Provinsi"]]} value={level} onChange={(lv) => { setLevel(lv as Level); setPage(0); }} />
            <input value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} placeholder="Cari…"
              className="w-36 rounded-lg border border-ink-border bg-ink-panel2 px-2.5 py-1.5 text-sm text-ink-text outline-none focus:border-ink-accent/60" />
          </div>
        </div>
        <div className="space-y-1">
          {pageRows.map((r) => {
            const rank = filtered.indexOf(r) + 1;
            const v = r.byKey[metric]?.value;
            const on = r.domain_id === selected?.domain_id;
            const color = metric === config.compositeKey && v != null ? categoryOf(v, config.categories).color : METRIC_COLOR[metric] ?? CHART.accent;
            return (
              <button key={r.domain_id} onClick={() => setSel(r.domain_id)}
                className={`flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors ${on ? "bg-ink-panel2 ring-1 ring-ink-accent/50" : "hover:bg-ink-panel2/60"}`}>
                <span className="w-6 shrink-0 text-right text-xs tabular-nums text-ink-muted">{rank}</span>
                <span className="w-40 shrink-0 truncate text-sm text-ink-text" title={r.name}>{r.name}</span>
                <span className="h-3 flex-1 overflow-hidden rounded-full bg-ink-panel2 ring-1 ring-ink-border/60">
                  <span className="block h-full rounded-full" style={{ width: `${v != null ? Math.max(2, ((v - floor) / span) * 100) : 0}%`, background: color }} />
                </span>
                <span className="w-24 shrink-0 text-right text-sm tabular-nums text-ink-text">{fmtVal(m, v)}</span>
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

      {selected && (
        <Detail row={selected} config={config} composite={composite} dims={dims} totalRegions={rows.length}
          series={series.get(selected.domain_id) ?? null} ranks={rankByYear.get(selected.domain_id) ?? null} level={level} />
      )}

      <ScatterPanel rows={rows} metrics={config.metrics} composite={config.compositeKey} hasPoverty={!!config.povertyVariableId} level={level} />
      <MapPanel rows={rows} config={config} metrics={config.metrics} level={level} xwalk={xwalk} />
      {national.length > 1 && (
        <Panel>
          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-muted">IPM nasional · {natFirst?.year}–{natLast?.year}</div>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={national} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
              <CartesianGrid stroke={CHART.grid} vertical={false} />
              <XAxis dataKey="year" tick={{ fill: CHART.axisTick, fontSize: 12 }} axisLine={{ stroke: CHART.axisLine }} tickLine={false} />
              <YAxis domain={["dataMin - 1", "dataMax + 1"]} tick={{ fill: CHART.axisTick, fontSize: 12 }} axisLine={{ stroke: CHART.axisLine }} tickLine={false} width={44} />
              <RTooltip contentStyle={{ background: CHART.tooltipBg, border: `1px solid ${CHART.tooltipBorder}`, borderRadius: 8 }} formatter={(v: number) => [v.toFixed(2), "IPM"]} />
              <Line type="monotone" dataKey="value" name="IPM" stroke={CHART.accent} strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </Panel>
      )}
    </div>
  );
}

function worstName(rows: Row[], key: string): string {
  const w = [...rows].filter((r) => r.byKey[key]).sort((a, b) => a.byKey[key]!.value - b.byKey[key]!.value)[0];
  return w?.name ?? "–";
}

function Detail({
  row, config, composite, dims, totalRegions, series, ranks, level,
}: {
  row: Row; config: HdiConfig; composite: HdiMetric; dims: HdiMetric[]; totalRegions: number;
  series: { year: number; value: number }[] | null; ranks: Record<number, number> | null; level: Level;
}) {
  const ipm = row.byKey[config.compositeKey]?.value;
  const cat = ipm != null ? categoryOf(ipm, config.categories) : null;
  // Percentile within the level (rank 1 = best → 100th pct).
  const pct = (c?: Cell4) => (c && totalRegions > 1 ? ((totalRegions - c.rank) / (totalRegions - 1)) * 100 : null);
  const lead = [...dims].map((d) => ({ d, p: pct(row.byKey[d.key]) })).filter((x) => x.p != null).sort((a, b) => a.p! - b.p!)[0];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 pt-2">
        <div className="h-px flex-1 bg-ink-border" />
        <div className="text-xs font-medium uppercase tracking-wide text-ink-muted">Rincian · {row.name}</div>
        <div className="h-px flex-1 bg-ink-border" />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Panel>
          <div className="text-xs uppercase tracking-wide text-ink-muted">IPM</div>
          <div className="mt-1 text-lg font-semibold text-ink-text">{ipm != null ? ipm.toFixed(2) : "–"}</div>
          {cat && <div className="mt-0.5 inline-flex items-center gap-1 text-xs" style={{ color: cat.color }}><span className="h-2 w-2 rounded-sm" style={{ background: cat.color }} />{cat.label}</div>}
        </Panel>
        {dims.map((d) => {
          const c = row.byKey[d.key];
          return (
            <Panel key={d.key}>
              <div className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ background: METRIC_COLOR[d.key] }} />
                <span className="truncate text-xs uppercase tracking-wide text-ink-muted" title={d.short}>{d.short}</span>
              </div>
              <div className="mt-1 text-lg font-semibold text-ink-text">{fmtVal(d, c?.value)}</div>
              <div className="mt-0.5 text-xs text-ink-muted">{c ? `#${c.rank} dari ${totalRegions}` : "–"}</div>
            </Panel>
          );
        })}
      </div>

      {/* Dimension profile: percentile per dimension so strengths/weaknesses show */}
      <Panel>
        <div className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-muted">Profil dimensi · persentil {level === "province" ? "antar-provinsi" : "antar-kab/kota"}</div>
        <p className="mb-3 text-xs text-ink-muted">
          Posisi relatif tiap dimensi (100 = terbaik). {lead?.p != null && <><span className="font-medium text-ink-text">{row.name}</span> paling tertinggal di <span className="font-medium" style={{ color: METRIC_COLOR[lead.d.key] }}>{lead.d.short}</span> (persentil {lead.p!.toFixed(0)}).</>}
        </p>
        <div className="space-y-2">
          {dims.map((d) => {
            const p = pct(row.byKey[d.key]);
            return (
              <div key={d.key} className="flex items-center gap-3">
                <span className="w-32 shrink-0 truncate text-xs text-ink-text" title={d.short}>{d.short}</span>
                <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-ink-panel2">
                  <div className="h-full rounded-full" style={{ width: `${p ?? 0}%`, background: METRIC_COLOR[d.key] }} />
                </div>
                <span className="w-16 shrink-0 text-right text-xs tabular-nums text-ink-text">{fmtVal(d, row.byKey[d.key]?.value)}</span>
                <span className="hidden w-12 shrink-0 text-right text-xs tabular-nums text-ink-muted sm:block">p{p != null ? p.toFixed(0) : "–"}</span>
              </div>
            );
          })}
        </div>
      </Panel>

      {series && series.length > 1 && <TrendPanel series={series} ranks={ranks} composite={composite} level={level} />}
    </div>
  );
}

function TrendPanel({ series, ranks, composite, level }: { series: { year: number; value: number }[]; ranks: Record<number, number> | null; composite: HdiMetric; level: Level }) {
  const [mode, setMode] = useState<"value" | "rank">("value");
  const first = series[0], last = series[series.length - 1];
  const change = last.value - first.value;
  const rankNow = ranks?.[last.year], rankThen = ranks?.[first.year];
  const rankRows = series.map((s) => ({ year: s.year, rank: ranks?.[s.year] })).filter((r): r is { year: number; rank: number } => r.rank != null);

  return (
    <Panel>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs font-medium uppercase tracking-wide text-ink-muted">{composite.label} · {first.year}–{last.year}</div>
        <PillToggle opts={[["value", "IPM"], ["rank", "Peringkat"]]} value={mode} onChange={(v) => setMode(v as "value" | "rank")} />
      </div>
      <div className="mb-3 grid grid-cols-3 gap-3">
        <Stat label={`Perubahan ${first.year}→${last.year}`} value={`${change >= 0 ? "+" : ""}${change.toFixed(2)} poin`} sub={change >= 0 ? "membaik" : "menurun"} />
        <Stat label={`Peringkat ${last.year}`} value={rankNow != null ? `#${rankNow}` : "–"} sub={level === "province" ? "antar-provinsi" : "antar-kab/kota"} />
        <Stat label="Pergeseran peringkat" value={rankThen != null && rankNow != null ? deltaText(rankThen - rankNow) : "–"} sub={rankThen != null ? `dari #${rankThen}` : undefined} />
      </div>
      {mode === "value" ? (
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={series} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
            <CartesianGrid stroke={CHART.grid} vertical={false} />
            <XAxis dataKey="year" tick={{ fill: CHART.axisTick, fontSize: 12 }} axisLine={{ stroke: CHART.axisLine }} tickLine={false} />
            <YAxis domain={["dataMin - 1", "dataMax + 1"]} tick={{ fill: CHART.axisTick, fontSize: 12 }} axisLine={{ stroke: CHART.axisLine }} tickLine={false} width={44} />
            <RTooltip contentStyle={{ background: CHART.tooltipBg, border: `1px solid ${CHART.tooltipBorder}`, borderRadius: 8 }} formatter={(v: number) => [v.toFixed(2), composite.short]} />
            <Line type="monotone" dataKey="value" name={composite.short} stroke={METRIC_COLOR.ipm} strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      ) : (
        <RankChart rows={rankRows} />
      )}
    </Panel>
  );
}

function deltaText(d: number) { return d === 0 ? "tetap" : d > 0 ? `naik ${d}` : `turun ${-d}`; }

function RankChart({ rows }: { rows: { year: number; rank: number }[] }) {
  if (rows.length < 2) return <div className="flex h-[280px] items-center justify-center text-sm text-ink-muted">Data peringkat tidak cukup.</div>;
  const rr = rows.map((r) => r.rank);
  const minR = Math.min(...rr), maxR = Math.max(...rr);
  const pad = Math.max(0.6, (maxR - minR) * 0.3);
  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={rows} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
        <CartesianGrid stroke={CHART.grid} vertical={false} />
        <XAxis dataKey="year" tick={{ fill: CHART.axisTick, fontSize: 12 }} axisLine={{ stroke: CHART.axisLine }} tickLine={false} />
        <YAxis reversed domain={[minR - pad, maxR + pad]} allowDecimals={false} width={40} tick={{ fill: CHART.axisTick, fontSize: 12 }} axisLine={{ stroke: CHART.axisLine }} tickLine={false} tickFormatter={(v) => `#${v}`} />
        <RTooltip contentStyle={{ background: CHART.tooltipBg, border: `1px solid ${CHART.tooltipBorder}`, borderRadius: 8 }} formatter={(v: number) => [`#${v}`, "Peringkat"]} />
        <Line type="monotone" dataKey="rank" name="Peringkat" stroke={CHART.accent} strokeWidth={2} dot={{ r: 2 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}

// IPM (or a dimension) vs poverty — the headline cross-cut. Axes switchable.
function ScatterPanel({ rows, metrics, composite, hasPoverty, level }: { rows: Row[]; metrics: HdiMetric[]; composite: string; hasPoverty: boolean; level: Level }) {
  const axes = useMemo(() => {
    const a = metrics.map((m) => ({ key: m.key, short: m.short }));
    return hasPoverty ? [...a, { key: "p0", short: "Kemiskinan (P0)" }] : a;
  }, [metrics, hasPoverty]);
  const [xKey, setXKey] = useState(composite);
  const [yKey, setYKey] = useState(hasPoverty ? "p0" : metrics[1]?.key ?? composite);
  const [selProvs, setSelProvs] = useState<Set<string>>(new Set());
  const shortOf = (k: string) => axes.find((a) => a.key === k)?.short ?? k;

  const provs = useMemo(() => {
    const set = new Map<string, string>();
    rows.forEach((r) => set.set(r.provCode, r.provName));
    return [...set.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows]);

  const points = useMemo(
    () => rows.filter((r) => r.byKey[xKey] && r.byKey[yKey] && (!selProvs.size || selProvs.has(r.provCode)))
      .map((r) => ({ x: axisVal(xKey, r.byKey[xKey].value), y: axisVal(yKey, r.byKey[yKey].value), name: r.name, fill: groupColor(r.provCode) })),
    [rows, xKey, yKey, selProvs]
  );
  const r = useMemo(() => pearson(points.map((p) => p.x), points.map((p) => p.y)), [points]);
  const fmtA = (v: number, k: string) => `${v.toLocaleString("id-ID", { maximumFractionDigits: 2 })}${axisUnit(k) ? ` ${axisUnit(k)}` : ""}`;

  const Sel = ({ v, on }: { v: string; on: (s: string) => void }) => (
    <select value={v} onChange={(e) => on(e.target.value)} className="rounded-lg border border-ink-border bg-ink-panel2 px-2 py-1.5 text-sm text-ink-text outline-none focus:border-ink-accent/60">
      {axes.map((a) => <option key={a.key} value={a.key}>{a.short}</option>)}
    </select>
  );

  return (
    <Panel>
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-ink-text">Hubungan antar-indikator</span>
        <span className="ml-auto flex items-center gap-2 text-xs text-ink-muted"><Sel v={xKey} on={setXKey} /> vs <Sel v={yKey} on={setYKey} /></span>
      </div>
      <div className="mb-2 text-xs text-ink-muted">
        Korelasi (r) = <span className={`font-semibold ${Math.abs(r) >= 0.5 ? "text-ink-text" : "text-ink-muted"}`}>{isNaN(r) ? "–" : r.toFixed(2)}</span>{" "}
        · {points.length} {level === "province" ? "provinsi" : "kab/kota"} · warna = provinsi.{" "}
        {xKey === composite && yKey === "p0" && "IPM tinggi cenderung berpasangan dengan kemiskinan rendah (korelasi negatif)."}
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
          <XAxis type="number" dataKey="x" name={shortOf(xKey)} tick={{ fill: CHART.axisTick, fontSize: 12 }} axisLine={{ stroke: CHART.axisLine }} tickLine={false} unit={axisUnit(xKey)}
            label={{ value: shortOf(xKey), position: "insideBottom", offset: -12, fill: CHART.axisTick, fontSize: 11 }} />
          <YAxis type="number" dataKey="y" name={shortOf(yKey)} tick={{ fill: CHART.axisTick, fontSize: 12 }} axisLine={{ stroke: CHART.axisLine }} tickLine={false} width={48} unit={axisUnit(yKey)} />
          <ZAxis range={[34, 34]} />
          <RTooltip cursor={{ strokeDasharray: "3 3" }} content={({ payload }) => payload && payload.length ? (
            <div className="rounded-lg border border-ink-border bg-ink-panel px-3 py-2 text-xs shadow-panel">
              <div className="font-medium text-ink-text">{payload[0].payload.name}</div>
              <div className="mt-0.5 text-ink-muted">{shortOf(xKey)}: {fmtA(payload[0].payload.x, xKey)}</div>
              <div className="text-ink-muted">{shortOf(yKey)}: {fmtA(payload[0].payload.y, yKey)}</div>
            </div>
          ) : null} />
          <Scatter data={points} fillOpacity={0.72}>{points.map((p, i) => <Cell key={i} fill={p.fill} />)}</Scatter>
        </ScatterChart>
      </ResponsiveContainer>
    </Panel>
  );
}

function MapPanel({ rows, config, metrics, level, xwalk }: { rows: Row[]; config: HdiConfig; metrics: HdiMetric[]; level: Level; xwalk: Map<string, RegencyCrosswalk> }) {
  const [key, setKey] = useState(config.compositeKey);
  const m = metrics.find((mm) => mm.key === key)!;

  const { values, geojsonUrls, unit } = useMemo(() => {
    const map = new Map<string, MapValue>();
    const isProv = level === "province";
    for (const r of rows) {
      const c = r.byKey[key];
      if (!c) continue;
      const v = key === "income" ? c.value / 1000 : c.value;
      const gk = isProv ? r.domain_id.slice(0, 2) : xwalk.get(r.domain_id)?.kemendagri_code;
      if (!gk) continue;
      map.set(gk, { value: Math.round(v * 100) / 100, name: r.name });
    }
    return { values: map, geojsonUrls: [isProv ? "/dukcapil-provinces.geojson" : "/dukcapil-regencies.geojson"], unit: key === "income" ? "jt" : m.unit === "Tahun" ? "th" : "" };
  }, [rows, key, level, xwalk, m.unit]);
  const vals = [...values.values()].map((v) => v.value);
  const min = vals.length ? Math.min(...vals) : 0;
  const max = vals.length ? Math.max(...vals) : 1;

  return (
    <Panel>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-ink-text">Peta · {level === "province" ? "provinsi" : "kabupaten/kota"}</span>
        <select value={key} onChange={(e) => setKey(e.target.value)} className="ml-auto rounded-lg border border-ink-border bg-ink-panel2 px-2 py-1.5 text-sm text-ink-text outline-none focus:border-ink-accent/60">
          {metrics.map((mm) => <option key={mm.key} value={mm.key}>{mm.short}</option>)}
        </select>
      </div>
      <ChoroplethMap key={level} values={values} min={min} max={max} unit={unit} geojsonUrls={geojsonUrls} />
    </Panel>
  );
}
