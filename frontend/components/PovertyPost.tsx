"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CartesianGrid, Cell, Line, LineChart, Scatter, ScatterChart, Tooltip as RTooltip,
  XAxis, YAxis, ZAxis, ResponsiveContainer,
} from "recharts";
import { api, bpsRegionLabel, CHART, dukcapilApi, groupColor, type RegencyCrosswalk } from "@/lib/api";
import { type PovertyConfig, type PovertyMetric } from "@/lib/posts";
import { Panel } from "@/components/ui";
import { ChoroplethMap, type MapValue } from "@/components/ChoroplethMap";

const PAGE = 10;
type MetricKey = "count" | "p0" | "p1" | "p2";
type Level = "province" | "regency";

// Fixed colour per metric so a metric reads the same in every chart/bar.
// The series endpoint caps at 10 000 rows (ordered by domain_id), which would
// silently drop the last regencies — Papua/Maluku, the highest-poverty ones —
// for a 488-region × 22-year metric. Fetch in year-halves and merge so every
// region/year is present. Province level (≈750 rows) fits in one call.
async function fullSeries(variableId: string, level: Level, firstYear: number, latestYear: number) {
  if (level !== "regency") return (await api.series(variableId, { admin_level: level })).results;
  const mid = Math.floor((firstYear + latestYear) / 2);
  const [a, b] = await Promise.all([
    api.series(variableId, { admin_level: level, year_max: String(mid) }),
    api.series(variableId, { admin_level: level, year_min: String(mid + 1) }),
  ]);
  return [...a.results, ...b.results];
}

const METRIC_COLOR: Record<MetricKey, string> = {
  count: "#1E4585", // navy — magnitude
  p0: "#C0392B", // red — headcount (how wide)
  p1: "#E0803A", // orange — depth
  p2: "#7C3AED", // purple — severity
};

// A region with every metric's latest value + national rank (1 = highest).
type Cell4 = { value: number; rank: number };
type Row = {
  domain_id: string;
  name: string;
  provCode: string;
  provName: string;
  byKey: Partial<Record<MetricKey, Cell4>>;
};

// A regency cross-section (latest year), always at kab/kota level regardless of
// the ranking's level toggle — powers the disparity, concentration and Dukcapil
// panels, which are inherently about kabupaten within provinces.
type RegRow = { domain_id: string; name: string; provCode: string; provName: string; p0?: number; count?: number };

// count is stored in *ribu jiwa* (thousands); everything else as given.
function fmtVal(m: PovertyMetric, v: number | undefined): string {
  if (v == null) return "–";
  if (m.key === "count") {
    return v >= 1000
      ? `${(v / 1000).toLocaleString("id-ID", { maximumFractionDigits: 2 })} jt`
      : `${v.toLocaleString("id-ID", { maximumFractionDigits: 0 })} rb`;
  }
  const s = v.toLocaleString("id-ID", { minimumFractionDigits: m.decimals, maximumFractionDigits: m.decimals });
  return m.unit === "%" ? `${s}%` : s;
}
const fmtJuta = (ribu: number) => `${(ribu / 1000).toLocaleString("id-ID", { maximumFractionDigits: 2 })} juta`;

export function PovertyPost({ config }: { config: PovertyConfig }) {
  const metricByKey = useMemo(
    () => Object.fromEntries(config.metrics.map((m) => [m.key, m])) as Record<MetricKey, PovertyMetric>,
    [config.metrics]
  );
  const [level, setLevel] = useState<Level>("regency");
  const [rows, setRows] = useState<Row[]>([]);
  const [primarySeries, setPrimarySeries] = useState<Map<string, { year: number; value: number }[]>>(new Map());
  const [rankByYear, setRankByYear] = useState<Map<string, Record<number, number>>>(new Map());
  const [national, setNational] = useState<{ year: number; poor: number; rate: number }[]>([]);
  const [regLatest, setRegLatest] = useState<RegRow[]>([]);
  const [xwalk, setXwalk] = useState<Map<string, RegencyCrosswalk>>(new Map());
  const [metric, setMetric] = useState<MetricKey>(config.primaryKey);
  const [sel, setSel] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);

  // National trend + crosswalk — level-independent, fetched once. National
  // totals are only valid once every province reports (fullCoverageYear).
  useEffect(() => {
    let cancelled = false;
    const countVar = config.metrics.find((m) => m.key === "count")!.variableId;
    const rateVar = config.metrics.find((m) => m.key === "p0")!.variableId;
    Promise.all([
      dukcapilApi.regencyCrosswalk(),
      api.series(countVar, { admin_level: "province" }),
      api.series(rateVar, { admin_level: "province" }),
    ]).then(([cw, cs, rs]) => {
      if (cancelled) return;
      setXwalk(new Map(cw.results.map((x) => [x.bps_domain_id, x])));
      const count = new Map<number, Map<string, number>>();
      const rate = new Map<number, Map<string, number>>();
      for (const d of cs.results) if (d.year != null) (count.get(d.year) ?? count.set(d.year, new Map()).get(d.year)!).set(d.domain_id, d.value);
      for (const d of rs.results) if (d.year != null) (rate.get(d.year) ?? rate.set(d.year, new Map()).get(d.year)!).set(d.domain_id, d.value);
      const nat: { year: number; poor: number; rate: number }[] = [];
      for (const [year, cm] of count) {
        if (year < config.fullCoverageYear) continue;
        const rm = rate.get(year);
        if (!rm) continue;
        let poor = 0, pop = 0;
        for (const [dom, poorK] of cm) {
          poor += poorK; // ribu jiwa
          const r = rm.get(dom);
          if (r) pop += (poorK / r) * 100; // reconstructed population (ribu jiwa)
        }
        nat.push({ year, poor, rate: pop ? (poor / pop) * 100 : 0 });
      }
      nat.sort((a, b) => a.year - b.year);
      setNational(nat);
    });
    return () => { cancelled = true; };
  }, [config.metrics, config.fullCoverageYear]);

  // Regency cross-section (latest year): P0 + count joined, for the panels that
  // are always kab/kota level (disparity, concentration, Dukcapil correlation).
  useEffect(() => {
    let cancelled = false;
    const p0Var = metricByKey.p0.variableId;
    const countVar = metricByKey.count.variableId;
    Promise.all([
      api.ranking(p0Var, { admin_level: "regency", year: String(config.latestYear) }),
      api.ranking(countVar, { admin_level: "regency", year: String(config.latestYear) }),
    ]).then(([p0r, cr]) => {
      if (cancelled) return;
      const by = new Map<string, RegRow>();
      const ensure = (domain_id: string, name: string) =>
        by.get(domain_id) ??
        (() => {
          const provCode = xwalk.get(domain_id)?.prov_code ?? domain_id.slice(0, 2);
          const provName = xwalk.get(domain_id)?.prov_name ?? provCode;
          const r: RegRow = { domain_id, name: bpsRegionLabel(name, domain_id), provCode, provName };
          by.set(domain_id, r);
          return r;
        })();
      for (const d of p0r.results) ensure(d.domain_id, d.domain_name).p0 = d.value;
      for (const d of cr.results) ensure(d.domain_id, d.domain_name).count = d.value;
      setRegLatest([...by.values()]);
    });
    return () => { cancelled = true; };
  }, [metricByKey, config.latestYear, xwalk]);

  // Per-level cross-section (latest year, all four metrics) + the primary
  // metric's full history (for the selected region's trend & rank-over-time).
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const primary = metricByKey[config.primaryKey];
    Promise.all([
      Promise.all(
        config.metrics.map((m) =>
          api.ranking(m.variableId, { admin_level: level, year: String(config.latestYear) }).then((r) => ({ key: m.key, r }))
        )
      ),
      fullSeries(primary.variableId, level, config.firstYear, config.latestYear),
    ]).then(([rankings, seriesPoints]) => {
      if (cancelled) return;

      const byRegion = new Map<string, Row>();
      for (const { key, r } of rankings) {
        for (const d of r.results) {
          const cur =
            byRegion.get(d.domain_id) ??
            (() => {
              const isProv = level === "province";
              const provCode = isProv ? d.domain_id.slice(0, 2) : xwalk.get(d.domain_id)?.prov_code ?? d.domain_id.slice(0, 2);
              const provName = isProv ? d.domain_name : xwalk.get(d.domain_id)?.prov_name ?? provCode;
              return {
                domain_id: d.domain_id,
                name: isProv ? d.domain_name : bpsRegionLabel(d.domain_name, d.domain_id),
                provCode,
                provName,
                byKey: {} as Row["byKey"],
              };
            })();
          cur.byKey[key] = { value: d.value, rank: d.rank };
          byRegion.set(d.domain_id, cur);
        }
      }
      const rowList = [...byRegion.values()];
      setRows(rowList);
      setSel((cur) => (cur && byRegion.has(cur) ? cur : rowList[0]?.domain_id ?? null));

      // Primary series → per-region history + rank within each year (desc).
      const hist = new Map<string, { year: number; value: number }[]>();
      for (const d of seriesPoints) {
        if (d.year == null) continue;
        const arr = hist.get(d.domain_id) ?? [];
        arr.push({ year: d.year, value: d.value });
        hist.set(d.domain_id, arr);
      }
      hist.forEach((arr) => arr.sort((a, b) => a.year - b.year));
      const rank = new Map<string, Record<number, number>>();
      const years = [...new Set(seriesPoints.map((d) => d.year).filter((y): y is number => y != null))];
      for (const y of years) {
        seriesPoints
          .filter((d) => d.year === y)
          .sort((a, b) => b.value - a.value) // higher poverty = rank 1
          .forEach((d, i) => {
            const m = rank.get(d.domain_id) ?? {};
            m[y] = i + 1;
            rank.set(d.domain_id, m);
          });
      }
      setPrimarySeries(hist);
      setRankByYear(rank);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [level, config.metrics, config.primaryKey, config.latestYear, metricByKey, xwalk]);

  const m = metricByKey[metric];
  const sorted = useMemo(
    () => [...rows].sort((a, b) => (b.byKey[metric]?.value ?? -Infinity) - (a.byKey[metric]?.value ?? -Infinity)),
    [rows, metric]
  );
  const filtered = useMemo(
    () => (q ? sorted.filter((r) => r.name.toLowerCase().includes(q.toLowerCase())) : sorted),
    [sorted, q]
  );
  const pageRows = filtered.slice(page * PAGE, page * PAGE + PAGE);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const maxVal = sorted[0]?.byKey[metric]?.value ?? 1;
  const selected = rows.find((r) => r.domain_id === sel) ?? rows[0];

  const latest = national[national.length - 1];
  const first = national[0];

  if (loading && !rows.length)
    return <div className="flex h-64 items-center justify-center text-sm text-ink-muted">Memuat…</div>;

  return (
    <div className="space-y-4">
      {/* National headline */}
      {latest && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Stat label={`Penduduk miskin ${latest.year}`} value={fmtJuta(latest.poor)} sub="total nasional (jumlah provinsi)" />
          <Stat label={`Tingkat kemiskinan ${latest.year}`} value={`${latest.rate.toFixed(2)}%`} sub={first ? `dari ${first.rate.toFixed(2)}% di ${first.year}` : undefined} />
          <Stat
            label="Wilayah termiskin (P0)"
            value={worst(rows, "p0")?.name ?? "–"}
            sub={worst(rows, "p0") ? `${fmtVal(metricByKey.p0, worst(rows, "p0")!.byKey.p0?.value)} penduduk miskin` : undefined}
          />
        </div>
      )}

      {/* Metric legend / meaning */}
      <div className="rounded-xl border border-ink-border bg-ink-panel px-4 py-3">
        <div className="flex flex-wrap gap-2">
          {config.metrics.map((mm) => (
            <button
              key={mm.key}
              onClick={() => { setMetric(mm.key); setPage(0); }}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${
                metric === mm.key ? "border-transparent text-white" : "border-ink-border text-ink-muted hover:text-ink-text"
              }`}
              style={metric === mm.key ? { background: METRIC_COLOR[mm.key] } : undefined}
            >
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: METRIC_COLOR[mm.key] }} />
              {mm.short}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs leading-relaxed text-ink-muted">{m.desc}</p>
      </div>

      {/* Ranking by the selected metric */}
      <Panel>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm font-semibold text-ink-text">
            Peringkat · {m.label}
            <span className="ml-2 text-xs font-normal text-ink-muted">
              {filtered.length} {level === "province" ? "provinsi" : "kabupaten/kota"} · #1 = tertinggi
            </span>
          </div>
          <div className="flex items-center gap-2">
            <LevelToggle level={level} onChange={(lv) => { setLevel(lv); setPage(0); }} />
            <input
              value={q}
              onChange={(e) => { setQ(e.target.value); setPage(0); }}
              placeholder="Cari…"
              className="w-36 rounded-lg border border-ink-border bg-ink-panel2 px-2.5 py-1.5 text-sm text-ink-text outline-none focus:border-ink-accent/60"
            />
          </div>
        </div>

        <div className="space-y-1">
          {pageRows.map((r) => {
            const rank = filtered.indexOf(r) + 1;
            const v = r.byKey[metric]?.value;
            const on = r.domain_id === selected?.domain_id;
            return (
              <button
                key={r.domain_id}
                onClick={() => setSel(r.domain_id)}
                className={`flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors ${
                  on ? "bg-ink-panel2 ring-1 ring-ink-accent/50" : "hover:bg-ink-panel2/60"
                }`}
              >
                <span className="w-6 shrink-0 text-right text-xs tabular-nums text-ink-muted">{rank}</span>
                <span className="w-40 shrink-0 truncate text-sm text-ink-text" title={r.name}>{r.name}</span>
                <span className="h-3 flex-1 overflow-hidden rounded-full bg-ink-panel2 ring-1 ring-ink-border/60">
                  <span
                    className="block h-full rounded-full"
                    style={{ width: `${maxVal ? ((v ?? 0) / maxVal) * 100 : 0}%`, background: METRIC_COLOR[metric] }}
                  />
                </span>
                <span className="w-20 shrink-0 text-right text-sm tabular-nums text-ink-text">{fmtVal(m, v)}</span>
              </button>
            );
          })}
        </div>

        <div className="mt-3 flex items-center justify-between text-xs text-ink-muted">
          <span>
            {filtered.length ? page * PAGE + 1 : 0}–{Math.min((page + 1) * PAGE, filtered.length)} dari {filtered.length}
          </span>
          <div className="flex items-center gap-1">
            <PageBtn disabled={page === 0} onClick={() => setPage((p) => p - 1)}>‹</PageBtn>
            <span className="px-1 tabular-nums">{page + 1}/{pages}</span>
            <PageBtn disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)}>›</PageBtn>
          </div>
        </div>
      </Panel>

      {selected && (
        <Detail
          row={selected}
          metrics={config.metrics}
          level={level}
          series={primarySeries.get(selected.domain_id) ?? null}
          ranks={rankByYear.get(selected.domain_id) ?? null}
          primary={metricByKey[config.primaryKey]}
          totalRegions={rows.length}
        />
      )}

      <ScatterPanel rows={rows} metrics={config.metrics} level={level} />
      <DisparityPanel regLatest={regLatest} p0={metricByKey.p0} />
      <ConcentrationPanel regLatest={regLatest} />
      <LeaderboardPanel primary={metricByKey[config.primaryKey]} startYear={2015} latestYear={config.latestYear} firstYear={config.firstYear} xwalk={xwalk} />
      <DukcapilCorrelationPanel regLatest={regLatest} xwalk={xwalk} />
      <MapPanel rows={rows} metrics={config.metrics} level={level} xwalk={xwalk} />
      <NationalTrend national={national} primary={metricByKey[config.primaryKey]} />
    </div>
  );
}

function worst(rows: Row[], key: MetricKey): Row | undefined {
  return [...rows].filter((r) => r.byKey[key]).sort((a, b) => (b.byKey[key]!.value) - (a.byKey[key]!.value))[0];
}

function LevelToggle({ level, onChange }: { level: Level; onChange: (l: Level) => void }) {
  return (
    <div className="inline-flex rounded-lg border border-ink-border/80 bg-ink-panel2/50 p-0.5">
      {(["regency", "province"] as const).map((lv) => (
        <button
          key={lv}
          onClick={() => onChange(lv)}
          className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
            level === lv ? "bg-brand-gradient text-white" : "text-ink-muted hover:text-ink-text"
          }`}
        >
          {lv === "regency" ? "Kab/Kota" : "Provinsi"}
        </button>
      ))}
    </div>
  );
}

function Detail({
  row, metrics, level, series, ranks, primary, totalRegions,
}: {
  row: Row;
  metrics: PovertyMetric[];
  level: Level;
  series: { year: number; value: number }[] | null;
  ranks: Record<number, number> | null;
  primary: PovertyMetric;
  totalRegions: number;
}) {
  const p0 = row.byKey.p0?.value;
  const p1 = row.byKey.p1?.value;
  // Average gap of the poor as a share of the poverty line = P1/P0 (×100).
  const gap = p0 && p1 != null ? (p1 / p0) * 100 : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 pt-2">
        <div className="h-px flex-1 bg-ink-border" />
        <div className="text-xs font-medium uppercase tracking-wide text-ink-muted">Rincian · {row.name}</div>
        <div className="h-px flex-1 bg-ink-border" />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {metrics.map((mm) => {
          const c = row.byKey[mm.key];
          return (
            <Panel key={mm.key}>
              <div className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ background: METRIC_COLOR[mm.key] }} />
                <span className="truncate text-xs uppercase tracking-wide text-ink-muted" title={mm.short}>{mm.short}</span>
              </div>
              <div className="mt-1 text-lg font-semibold text-ink-text">{fmtVal(mm, c?.value)}</div>
              <div className="mt-0.5 text-xs text-ink-muted">{c ? `#${c.rank} dari ${totalRegions}` : "–"}</div>
            </Panel>
          );
        })}
      </div>

      {/* Plain-language FGT reading for this region */}
      <Panel>
        <div className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-muted">Membaca angka</div>
        <p className="text-sm leading-relaxed text-ink-text/90">
          Di <span className="font-medium">{row.name}</span>,{" "}
          {p0 != null ? (
            <><span className="font-medium" style={{ color: METRIC_COLOR.p0 }}>{p0.toFixed(2)}%</span> penduduk hidup di bawah garis kemiskinan</>
          ) : "tingkat kemiskinan tidak tersedia"}
          {gap != null && (
            <>. Rata-rata pengeluaran mereka sekitar{" "}
              <span className="font-medium" style={{ color: METRIC_COLOR.p1 }}>{gap.toFixed(1)}%</span>{" "}
              di bawah garis kemiskinan (kedalaman)</>
          )}
          {row.byKey.p2 && (
            <>, dengan indeks keparahan <span className="font-medium" style={{ color: METRIC_COLOR.p2 }}>{row.byKey.p2.value.toFixed(2)}</span> yang menandai ketimpangan di antara penduduk miskin</>
          )}
          .
        </p>
      </Panel>

      {series && series.length > 1 && (
        <RegionTrend series={series} ranks={ranks} primary={primary} level={level} />
      )}
    </div>
  );
}

function RegionTrend({
  series, ranks, primary, level,
}: {
  series: { year: number; value: number }[];
  ranks: Record<number, number> | null;
  primary: PovertyMetric;
  level: Level;
}) {
  const [mode, setMode] = useState<"value" | "rank">("value");
  const first = series[0];
  const last = series[series.length - 1];
  const change = last.value - first.value; // percentage points for P0
  const rankNow = ranks?.[last.year];
  const rankThen = ranks?.[first.year];

  return (
    <Panel>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs font-medium uppercase tracking-wide text-ink-muted">
          {primary.label} · {first.year}–{last.year}
        </div>
        <div className="inline-flex rounded-lg border border-ink-border/80 bg-ink-panel2/50 p-0.5">
          {(["value", "rank"] as const).map((mm) => (
            <button
              key={mm}
              onClick={() => setMode(mm)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                mode === mm ? "bg-brand-gradient text-white" : "text-ink-muted hover:text-ink-text"
              }`}
            >
              {mm === "value" ? "Tingkat" : "Peringkat"}
            </button>
          ))}
        </div>
      </div>
      <div className="mb-3 grid grid-cols-3 gap-3">
        <Stat label={`Perubahan ${first.year}→${last.year}`} value={`${change >= 0 ? "+" : ""}${change.toFixed(2)} poin`} sub={change <= 0 ? "membaik" : "memburuk"} />
        <Stat label={`Peringkat ${last.year}`} value={rankNow != null ? `#${rankNow}` : "–"} sub={`${level === "province" ? "antar-provinsi" : "antar-kab/kota"}`} />
        <Stat
          label="Pergeseran peringkat"
          value={rankThen != null && rankNow != null ? deltaText(rankThen - rankNow) : "–"}
          sub={rankThen != null ? `dari #${rankThen}` : undefined}
        />
      </div>
      {mode === "value" ? (
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={series} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
            <CartesianGrid stroke={CHART.grid} vertical={false} />
            <XAxis dataKey="year" tick={{ fill: CHART.axisTick, fontSize: 12 }} axisLine={{ stroke: CHART.axisLine }} tickLine={false} />
            <YAxis tick={{ fill: CHART.axisTick, fontSize: 12 }} axisLine={{ stroke: CHART.axisLine }} tickLine={false} width={44}
              tickFormatter={(v) => `${v}${primary.unit === "%" ? "%" : ""}`} />
            <RTooltip
              contentStyle={{ background: CHART.tooltipBg, border: `1px solid ${CHART.tooltipBorder}`, borderRadius: 8 }}
              formatter={(v: number) => [`${v.toFixed(2)}${primary.unit === "%" ? "%" : ""}`, primary.short]}
            />
            <Line type="monotone" dataKey="value" name={primary.short} stroke={METRIC_COLOR[primary.key]} strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      ) : (
        <RankChart rows={series.map((s) => ({ year: s.year, rank: ranks?.[s.year] })).filter((r): r is { year: number; rank: number } => r.rank != null)} />
      )}
    </Panel>
  );
}

function deltaText(d: number) {
  return d === 0 ? "tetap" : d > 0 ? `naik ${d}` : `turun ${-d}`;
}

// Rank-over-time — Y reversed so #1 (worst) sits at top; axis zoomed to the
// region's own range so movement is visible.
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
        <YAxis reversed domain={[minR - pad, maxR + pad]} allowDecimals={false} width={40}
          tick={{ fill: CHART.axisTick, fontSize: 12 }} axisLine={{ stroke: CHART.axisLine }} tickLine={false}
          tickFormatter={(v) => `#${v}`} />
        <RTooltip contentStyle={{ background: CHART.tooltipBg, border: `1px solid ${CHART.tooltipBorder}`, borderRadius: 8 }}
          formatter={(v: number) => [`#${v}`, "Peringkat"]} />
        <Line type="monotone" dataKey="rank" name="Peringkat" stroke={CHART.accent} strokeWidth={2} dot={{ r: 2 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}

// Signature insight: absolute number of poor (x) vs poverty rate (y). Java-type
// regions land bottom-right (many poor, low rate); Papua-type top-left (few in
// number, very high rate). Axes are switchable across the four metrics.
function ScatterPanel({ rows, metrics, level }: { rows: Row[]; metrics: PovertyMetric[]; level: Level }) {
  const [xKey, setXKey] = useState<MetricKey>("count");
  const [yKey, setYKey] = useState<MetricKey>("p0");
  const [selProvs, setSelProvs] = useState<Set<string>>(new Set());
  const xm = metrics.find((m) => m.key === xKey)!;
  const ym = metrics.find((m) => m.key === yKey)!;

  const provs = useMemo(() => {
    const set = new Map<string, string>();
    rows.forEach((r) => set.set(r.provCode, r.provName));
    return [...set.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows]);

  const points = useMemo(
    () =>
      rows
        .filter((r) => r.byKey[xKey] && r.byKey[yKey] && (!selProvs.size || selProvs.has(r.provCode)))
        .map((r) => ({
          x: xKey === "count" ? r.byKey[xKey]!.value / 1000 : r.byKey[xKey]!.value, // count → juta
          y: yKey === "count" ? r.byKey[yKey]!.value / 1000 : r.byKey[yKey]!.value,
          name: r.name,
          fill: groupColor(r.provCode),
        })),
    [rows, xKey, yKey, selProvs]
  );
  const r = useMemo(() => pearson(points.map((p) => p.x), points.map((p) => p.y)), [points]);
  const axisUnit = (m: PovertyMetric) => (m.key === "count" ? "jt" : m.unit === "%" ? "%" : "");
  const fmtAxis = (v: number, m: PovertyMetric) => `${v.toLocaleString("id-ID", { maximumFractionDigits: 2 })}${axisUnit(m)}`;

  return (
    <Panel>
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-ink-text">Jumlah vs Tingkat kemiskinan</span>
        <span className="ml-auto flex items-center gap-2 text-xs text-ink-muted">
          <MetricSelect metrics={metrics} v={xKey} on={setXKey} /> vs <MetricSelect metrics={metrics} v={yKey} on={setYKey} />
        </span>
      </div>
      <div className="mb-2 text-xs text-ink-muted">
        Korelasi (r) = <span className={`font-semibold ${Math.abs(r) >= 0.5 ? "text-ink-text" : "text-ink-muted"}`}>{isNaN(r) ? "–" : r.toFixed(2)}</span>{" "}
        · {points.length} {level === "province" ? "provinsi" : "kab/kota"} · tiap titik satu wilayah, warna = provinsi.{" "}
        {xKey === "count" && yKey === "p0" && "Kanan-bawah: banyak jumlahnya tapi tingkatnya rendah (tipe Jawa). Kiri-atas: sedikit jumlahnya tapi tingkat kemiskinan sangat tinggi (tipe Papua)."}
      </div>

      <div className="mb-3 flex flex-wrap gap-x-3 gap-y-1">
        {selProvs.size > 0 && (
          <button onClick={() => setSelProvs(new Set())} className="text-xs text-ink-accent hover:underline">Semua provinsi</button>
        )}
        {provs.map(([code, name]) => {
          const on = selProvs.size === 0 || selProvs.has(code);
          return (
            <button key={code} onClick={() => setSelProvs((cur) => { const n = new Set(cur); n.has(code) ? n.delete(code) : n.add(code); return n; })}
              className={`inline-flex items-center gap-1.5 text-xs transition-opacity ${on ? "opacity-100" : "opacity-30"}`} title={name}>
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: groupColor(code) }} />
              <span className="text-ink-muted">{name}</span>
            </button>
          );
        })}
      </div>

      <ResponsiveContainer width="100%" aspect={1.4} className="mx-auto max-w-[640px]">
        <ScatterChart margin={{ top: 8, right: 16, bottom: 24, left: 8 }}>
          <CartesianGrid stroke={CHART.grid} />
          <XAxis type="number" dataKey="x" name={xm.short} tick={{ fill: CHART.axisTick, fontSize: 12 }}
            axisLine={{ stroke: CHART.axisLine }} tickLine={false} unit={axisUnit(xm)}
            label={{ value: `${xm.short} (${axisUnit(xm) || "indeks"})`, position: "insideBottom", offset: -12, fill: CHART.axisTick, fontSize: 12 }} />
          <YAxis type="number" dataKey="y" name={ym.short} tick={{ fill: CHART.axisTick, fontSize: 12 }}
            axisLine={{ stroke: CHART.axisLine }} tickLine={false} width={48} unit={axisUnit(ym)} />
          <ZAxis range={[36, 36]} />
          <RTooltip cursor={{ strokeDasharray: "3 3" }}
            content={({ payload }) =>
              payload && payload.length ? (
                <div className="rounded-lg border border-ink-border bg-ink-panel px-3 py-2 text-xs shadow-panel">
                  <div className="font-medium text-ink-text">{payload[0].payload.name}</div>
                  <div className="mt-0.5 text-ink-muted">{xm.short}: {fmtAxis(payload[0].payload.x, xm)}</div>
                  <div className="text-ink-muted">{ym.short}: {fmtAxis(payload[0].payload.y, ym)}</div>
                </div>
              ) : null
            } />
          <Scatter data={points} fillOpacity={0.72}>
            {points.map((p, i) => <Cell key={i} fill={p.fill} />)}
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>
    </Panel>
  );
}

function MetricSelect({ metrics, v, on }: { metrics: PovertyMetric[]; v: MetricKey; on: (k: MetricKey) => void }) {
  return (
    <select value={v} onChange={(e) => on(e.target.value as MetricKey)}
      className="rounded-lg border border-ink-border bg-ink-panel2 px-2 py-1.5 text-sm text-ink-text outline-none focus:border-ink-accent/60">
      {metrics.map((m) => <option key={m.key} value={m.key}>{m.short}</option>)}
    </select>
  );
}

function MapPanel({ rows, metrics, level, xwalk }: { rows: Row[]; metrics: PovertyMetric[]; level: Level; xwalk: Map<string, RegencyCrosswalk> }) {
  const [metric, setMetric] = useState<MetricKey>("p0");
  const m = metrics.find((mm) => mm.key === metric)!;

  const { values, geojsonUrls, unit } = useMemo(() => {
    const map = new Map<string, MapValue>();
    const isProv = level === "province";
    for (const r of rows) {
      const c = r.byKey[metric];
      if (!c) continue;
      const v = metric === "count" ? c.value / 1000 : c.value; // count → juta
      const key = isProv ? r.domain_id.slice(0, 2) : xwalk.get(r.domain_id)?.kemendagri_code;
      if (!key) continue;
      map.set(key, { value: Math.round(v * 100) / 100, name: r.name });
    }
    return {
      values: map,
      geojsonUrls: [isProv ? "/dukcapil-provinces.geojson" : "/dukcapil-regencies.geojson"],
      unit: metric === "count" ? "jt" : m.unit === "%" ? "%" : "",
    };
  }, [rows, metric, level, xwalk, m.unit]);

  const vals = [...values.values()].map((v) => v.value);
  const min = vals.length ? Math.min(...vals) : 0;
  const max = vals.length ? Math.max(...vals) : 1;

  return (
    <Panel>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-ink-text">Peta · {level === "province" ? "provinsi" : "kabupaten/kota"}</span>
        <div className="ml-auto">
          <MetricSelect metrics={metrics} v={metric} on={setMetric} />
        </div>
      </div>
      <ChoroplethMap key={level} values={values} min={min} max={max} unit={unit} geojsonUrls={geojsonUrls} />
    </Panel>
  );
}

function NationalTrend({ national, primary }: { national: { year: number; poor: number; rate: number }[]; primary: PovertyMetric }) {
  const [mode, setMode] = useState<"rate" | "count">("rate");
  if (national.length < 2) return null;
  const rows = national.map((n) => ({ year: n.year, rate: Math.round(n.rate * 100) / 100, poor: Math.round((n.poor / 1000) * 100) / 100 }));
  const first = national[0], last = national[national.length - 1];

  return (
    <Panel>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs font-medium uppercase tracking-wide text-ink-muted">Nasional · {first.year}–{last.year}</div>
        <div className="inline-flex rounded-lg border border-ink-border/80 bg-ink-panel2/50 p-0.5">
          {(["rate", "count"] as const).map((mm) => (
            <button key={mm} onClick={() => setMode(mm)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${mode === mm ? "bg-brand-gradient text-white" : "text-ink-muted hover:text-ink-text"}`}>
              {mm === "rate" ? "Tingkat (%)" : "Jumlah (juta)"}
            </button>
          ))}
        </div>
      </div>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={rows} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
          <CartesianGrid stroke={CHART.grid} vertical={false} />
          <XAxis dataKey="year" tick={{ fill: CHART.axisTick, fontSize: 12 }} axisLine={{ stroke: CHART.axisLine }} tickLine={false} />
          <YAxis tick={{ fill: CHART.axisTick, fontSize: 12 }} axisLine={{ stroke: CHART.axisLine }} tickLine={false} width={44}
            tickFormatter={(v) => (mode === "rate" ? `${v}%` : `${v}`)} />
          <RTooltip contentStyle={{ background: CHART.tooltipBg, border: `1px solid ${CHART.tooltipBorder}`, borderRadius: 8 }}
            formatter={(v: number) => [mode === "rate" ? `${v.toFixed(2)}%` : `${v.toFixed(2)} juta`, mode === "rate" ? "Tingkat kemiskinan" : "Penduduk miskin"]} />
          <Line type="monotone" dataKey={mode === "rate" ? "rate" : "poor"} name={mode === "rate" ? "Tingkat" : "Jumlah"} stroke={mode === "rate" ? METRIC_COLOR.p0 : METRIC_COLOR.count} strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
      <div className="mt-2 text-xs text-ink-muted">
        Agregat nasional dihitung dari penjumlahan seluruh provinsi; dibatasi sejak {first.year} saat seluruh 34 provinsi melapor lengkap.
        {primary.unit === "%" && " Tingkat nasional = total penduduk miskin ÷ total penduduk."}
      </div>
    </Panel>
  );
}

// ── Disparity within provinces ────────────────────────────────────────────
// A province's headline P0 hides how spread-out its kabupaten are. Show each
// province's min→max P0 range so the "hidden pockets" become visible.
function DisparityPanel({ regLatest, p0 }: { regLatest: RegRow[]; p0: PovertyMetric }) {
  const [sort, setSort] = useState<"gap" | "max">("gap");
  const provinces = useMemo(() => {
    const g = new Map<string, { code: string; name: string; vals: { name: string; v: number }[] }>();
    for (const r of regLatest) {
      if (r.p0 == null) continue;
      const cur = g.get(r.provCode) ?? { code: r.provCode, name: r.provName, vals: [] };
      cur.vals.push({ name: r.name, v: r.p0 });
      g.set(r.provCode, cur);
    }
    const list = [...g.values()]
      .filter((p) => p.vals.length >= 2)
      .map((p) => {
        const sorted = [...p.vals].sort((a, b) => a.v - b.v);
        const min = sorted[0], max = sorted[sorted.length - 1];
        const median = sorted[Math.floor(sorted.length / 2)].v;
        return { ...p, min, max, median, gap: max.v - min.v, n: p.vals.length };
      });
    return list.sort((a, b) => (sort === "gap" ? b.gap - a.gap : b.max.v - a.max.v));
  }, [regLatest, sort]);

  const gMax = useMemo(() => Math.max(1, ...provinces.map((p) => p.max.v)), [provinces]);
  if (!provinces.length) return null;
  const lead = provinces[0];

  return (
    <Panel>
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-ink-text">Disparitas dalam provinsi</span>
        <div className="ml-auto inline-flex rounded-lg border border-ink-border/80 bg-ink-panel2/50 p-0.5">
          {(["gap", "max"] as const).map((s) => (
            <button key={s} onClick={() => setSort(s)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${sort === s ? "bg-brand-gradient text-white" : "text-ink-muted hover:text-ink-text"}`}>
              {s === "gap" ? "Rentang" : "Tertinggi"}
            </button>
          ))}
        </div>
      </div>
      <p className="mb-3 text-xs leading-relaxed text-ink-muted">
        Tiap batang membentang dari kabupaten/kota dengan P0 terendah hingga tertinggi di provinsi itu; titik = median.
        Rata-rata provinsi bisa terlihat rendah sementara sebagian daerahnya sangat miskin — di{" "}
        <span className="font-medium text-ink-text">{lead.name}</span> jaraknya {lead.gap.toFixed(1)} poin
        ({lead.min.v.toFixed(1)}%–{lead.max.v.toFixed(1)}%).
      </p>
      <div className="max-h-[420px] space-y-2 overflow-y-auto scroll-thin pr-1">
        {provinces.map((p) => (
          <div key={p.code} className="flex items-center gap-3">
            <span className="w-28 shrink-0 truncate text-xs text-ink-text" title={p.name}>{p.name}</span>
            <div className="relative h-4 flex-1 rounded bg-ink-panel2">
              <div className="absolute top-0 h-full rounded"
                style={{ left: `${(p.min.v / gMax) * 100}%`, width: `${((p.max.v - p.min.v) / gMax) * 100}%`, background: METRIC_COLOR.p0, opacity: 0.35 }} />
              <div className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-ink-panel"
                style={{ left: `${(p.median / gMax) * 100}%`, background: METRIC_COLOR.p0 }} title={`Median: ${p.median.toFixed(1)}%`} />
            </div>
            <span className="w-16 shrink-0 text-right text-xs tabular-nums text-ink-muted" title={`${p.min.name}: ${p.min.v.toFixed(1)}%`}>{p.min.v.toFixed(1)}%</span>
            <span className="w-24 shrink-0 truncate text-right text-xs tabular-nums text-ink-text" title={`${p.max.name}: ${p.max.v.toFixed(1)}%`}>
              {p.max.v.toFixed(1)}%
            </span>
          </div>
        ))}
      </div>
      <div className="mt-2 text-[11px] text-ink-muted">Kolom kanan = P0 kab/kota tertinggi di provinsi (arahkan kursor untuk namanya) · {p0.label}.</div>
    </Panel>
  );
}

// ── Concentration: where the poor actually live ───────────────────────────
// Cumulative share of the poor (var 619) as regions are added largest-first —
// a Lorenz-style curve. The steeper it starts, the more concentrated poverty is.
function ConcentrationPanel({ regLatest }: { regLatest: RegRow[] }) {
  const [level, setLevel] = useState<"regency" | "province">("regency");

  const { curve, tot, n, kFor } = useMemo(() => {
    let vals: number[];
    if (level === "province") {
      const g = new Map<string, number>();
      for (const r of regLatest) if (r.count != null) g.set(r.provCode, (g.get(r.provCode) ?? 0) + r.count);
      vals = [...g.values()];
    } else {
      vals = regLatest.filter((r) => r.count != null).map((r) => r.count!);
    }
    vals.sort((a, b) => b - a);
    const total = vals.reduce((a, v) => a + v, 0);
    const nn = vals.length;
    const pts: { p: number; lorenz: number; equal: number }[] = [{ p: 0, lorenz: 0, equal: 0 }];
    let cum = 0;
    vals.forEach((v, i) => {
      cum += v;
      const p = ((i + 1) / nn) * 100;
      pts.push({ p, lorenz: (cum / total) * 100, equal: p });
    });
    const kAt = (frac: number) => {
      let c = 0;
      for (let i = 0; i < nn; i++) { c += vals[i]; if (c / total >= frac) return i + 1; }
      return nn;
    };
    return { curve: pts, tot: total, n: nn, kFor: kAt };
  }, [regLatest, level]);

  if (!n) return null;
  const label = level === "province" ? "provinsi" : "kab/kota";
  const k50 = kFor(0.5), k80 = kFor(0.8);

  return (
    <Panel>
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-ink-text">Konsentrasi kemiskinan</span>
        <div className="ml-auto inline-flex rounded-lg border border-ink-border/80 bg-ink-panel2/50 p-0.5">
          {(["regency", "province"] as const).map((lv) => (
            <button key={lv} onClick={() => setLevel(lv)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${level === lv ? "bg-brand-gradient text-white" : "text-ink-muted hover:text-ink-text"}`}>
              {lv === "regency" ? "Kab/Kota" : "Provinsi"}
            </button>
          ))}
        </div>
      </div>
      <div className="mb-3 grid grid-cols-3 gap-3">
        <Stat label="Separuh penduduk miskin" value={`${k50} ${label}`} sub={`${((k50 / n) * 100).toFixed(0)}% dari total ${label}`} />
        <Stat label="80% penduduk miskin" value={`${k80} ${label}`} sub={`${((k80 / n) * 100).toFixed(0)}% dari total ${label}`} />
        <Stat label="Total penduduk miskin" value={fmtJuta(tot)} sub={`tersebar di ${n} ${label}`} />
      </div>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={curve} margin={{ top: 8, right: 16, bottom: 4, left: 8 }}>
          <CartesianGrid stroke={CHART.grid} />
          <XAxis type="number" dataKey="p" domain={[0, 100]} tick={{ fill: CHART.axisTick, fontSize: 12 }}
            axisLine={{ stroke: CHART.axisLine }} tickLine={false} tickFormatter={(v) => `${v}%`}
            label={{ value: `% ${label} (diurut dari termiskin terbanyak)`, position: "insideBottom", offset: -2, fill: CHART.axisTick, fontSize: 11 }} />
          <YAxis type="number" domain={[0, 100]} tick={{ fill: CHART.axisTick, fontSize: 12 }}
            axisLine={{ stroke: CHART.axisLine }} tickLine={false} width={44} tickFormatter={(v) => `${v}%`} />
          <RTooltip contentStyle={{ background: CHART.tooltipBg, border: `1px solid ${CHART.tooltipBorder}`, borderRadius: 8 }}
            formatter={(v: number, nm: string) => [`${v.toFixed(1)}%`, nm === "lorenz" ? "Kumulatif penduduk miskin" : "Jika merata"]}
            labelFormatter={(v) => `${Number(v).toFixed(0)}% ${label}`} />
          <Line type="monotone" dataKey="equal" name="equal" stroke={CHART.axisLine} strokeDasharray="4 4" strokeWidth={1.5} dot={false} />
          <Line type="monotone" dataKey="lorenz" name="lorenz" stroke={METRIC_COLOR.count} strokeWidth={2.5} dot={false} />
        </LineChart>
      </ResponsiveContainer>
      <div className="mt-2 text-xs text-ink-muted">
        Garis putus-putus = jika penduduk miskin tersebar merata. Makin melengkung garis biru, makin terkonsentrasi kemiskinan di sedikit {label}.
      </div>
    </Panel>
  );
}

// ── Progress leaderboard: fastest change over a window ─────────────────────
function LeaderboardPanel({
  primary, startYear, latestYear, firstYear, xwalk,
}: {
  primary: PovertyMetric; startYear: number; latestYear: number; firstYear: number; xwalk: Map<string, RegencyCrosswalk>;
}) {
  const [level, setLevel] = useState<Level>("regency");
  const [data, setData] = useState<{ id: string; name: string; from: number; to: number; change: number }[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    Promise.all([
      api.ranking(primary.variableId, { admin_level: level, year: String(startYear) }),
      api.ranking(primary.variableId, { admin_level: level, year: String(latestYear) }),
    ]).then(([a, b]) => {
      if (cancelled) return;
      const from = new Map(a.results.map((r) => [r.domain_id, r.value]));
      const rows = b.results
        .filter((r) => from.has(r.domain_id))
        .map((r) => ({
          id: r.domain_id,
          name: level === "province" ? r.domain_name : bpsRegionLabel(r.domain_name, r.domain_id),
          from: from.get(r.domain_id)!,
          to: r.value,
          change: r.value - from.get(r.domain_id)!,
        }));
      setData(rows);
    });
    return () => { cancelled = true; };
  }, [primary.variableId, level, startYear, latestYear]);

  const improved = data ? [...data].sort((a, b) => a.change - b.change).slice(0, 10) : [];
  const worsened = data ? [...data].sort((a, b) => b.change - a.change).slice(0, 10) : [];
  const nDown = data ? data.filter((d) => d.change < 0).length : 0;
  const maxMag = Math.max(1, ...improved.map((d) => -d.change), ...worsened.map((d) => d.change));

  const Bar = ({ d, good }: { d: { name: string; from: number; to: number; change: number }; good: boolean }) => (
    <div className="flex items-center gap-2">
      <span className="w-28 shrink-0 truncate text-xs text-ink-text" title={d.name}>{d.name}</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-ink-panel2">
        <div className="h-full rounded-full" style={{ width: `${(Math.abs(d.change) / maxMag) * 100}%`, background: good ? CHART.good : CHART.bad }} />
      </div>
      <span className="w-14 shrink-0 text-right text-xs tabular-nums" style={{ color: good ? CHART.good : CHART.bad }}>
        {d.change >= 0 ? "+" : ""}{d.change.toFixed(1)}
      </span>
      <span className="hidden w-24 shrink-0 text-right text-[11px] tabular-nums text-ink-muted sm:block">{d.from.toFixed(1)}→{d.to.toFixed(1)}%</span>
    </div>
  );

  return (
    <Panel>
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-ink-text">Perubahan {startYear}→{latestYear}</span>
        <div className="ml-auto">
          <LevelToggle level={level} onChange={setLevel} />
        </div>
      </div>
      <p className="mb-3 text-xs text-ink-muted">
        Perubahan poin persentase P0 selama {latestYear - startYear} tahun (nilai negatif = kemiskinan turun).
        {data && <> {nDown} dari {data.length} {level === "province" ? "provinsi" : "kab/kota"} membaik.</>}
      </p>
      {!data ? (
        <div className="flex h-40 items-center justify-center text-sm text-ink-muted">Memuat…</div>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div>
            <div className="mb-2 text-xs font-medium uppercase tracking-wide" style={{ color: CHART.good }}>Penurunan terbesar</div>
            <div className="space-y-1.5">{improved.map((d) => <Bar key={d.id} d={d} good />)}</div>
          </div>
          <div>
            <div className="mb-2 text-xs font-medium uppercase tracking-wide" style={{ color: CHART.bad }}>Naik / paling lambat</div>
            <div className="space-y-1.5">{worsened.map((d) => <Bar key={d.id} d={d} good={false} />)}</div>
          </div>
        </div>
      )}
    </Panel>
  );
}

// ── Cross-source correlation with Dukcapil (Kemendagri) ────────────────────
// Joins BPS P0 (regency) to a Dukcapil indicator via the BPS→Kemendagri
// regency crosswalk. Different sources & methodologies — a correlation lens,
// not a combined statistic.
function DukcapilCorrelationPanel({ regLatest, xwalk }: { regLatest: RegRow[]; xwalk: Map<string, RegencyCrosswalk> }) {
  const [indicators, setIndicators] = useState<{ field: string; label_id: string; unit: string; group: string }[]>([]);
  const [field, setField] = useState("pop_density");
  const [dk, setDk] = useState<{ values: Map<string, number>; unit: string; label: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    dukcapilApi.indicators().then((r) => {
      if (cancelled) return;
      const flat = r.groups.flatMap((g) => g.indicators.filter((i) => !i.is_string).map((i) => ({ field: i.field, label_id: i.label_id, unit: i.unit, group: g.group })));
      setIndicators(flat);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setDk(null);
    dukcapilApi.rank({ level: "regency", indicator: field, limit: "1000" }).then((r) => {
      if (cancelled) return;
      setDk({ values: new Map(r.results.map((x) => [x.domain_id, x.value])), unit: r.unit, label: r.indicator.label_id });
    });
    return () => { cancelled = true; };
  }, [field]);

  const points = useMemo(() => {
    if (!dk) return [];
    return regLatest
      .filter((r) => r.p0 != null)
      .map((r) => {
        const kem = xwalk.get(r.domain_id)?.kemendagri_code;
        const x = kem ? dk.values.get(kem) : undefined;
        return x == null ? null : { x, y: r.p0!, name: r.name, fill: groupColor(r.provCode) };
      })
      .filter((p): p is { x: number; y: number; name: string; fill: string } => p != null);
  }, [regLatest, dk, xwalk]);

  const r = useMemo(() => pearson(points.map((p) => p.x), points.map((p) => p.y)), [points]);
  const grouped = useMemo(() => {
    const g = new Map<string, { field: string; label_id: string; unit: string }[]>();
    for (const i of indicators) { const a = g.get(i.group) ?? []; a.push(i); g.set(i.group, a); }
    return [...g.entries()];
  }, [indicators]);

  return (
    <Panel>
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-ink-text">Kemiskinan vs data Dukcapil</span>
        <select value={field} onChange={(e) => setField(e.target.value)}
          className="ml-auto rounded-lg border border-ink-border bg-ink-panel2 px-2 py-1.5 text-sm text-ink-text outline-none focus:border-ink-accent/60">
          {grouped.map(([grp, inds]) => (
            <optgroup key={grp} label={grp}>
              {inds.map((i) => <option key={i.field} value={i.field}>{i.label_id}</option>)}
            </optgroup>
          ))}
        </select>
      </div>
      <div className="mb-1 text-xs text-ink-muted">
        Korelasi (r) = <span className={`font-semibold ${Math.abs(r) >= 0.5 ? "text-ink-text" : "text-ink-muted"}`}>{isNaN(r) ? "–" : r.toFixed(2)}</span>{" "}
        · {points.length} kab/kota · sumbu X: {dk?.label ?? "…"}{dk?.unit ? ` (${dk.unit})` : ""}, sumbu Y: P0 (%). Warna = provinsi.
      </div>
      <p className="mb-3 text-[11px] leading-relaxed text-ink-muted">
        Catatan: BPS (kemiskinan) dan Dukcapil (kependudukan) adalah dua sumber dengan metodologi & kode wilayah berbeda; digabungkan lewat crosswalk BPS→Kemendagri. Ini lensa korelasi, bukan angka gabungan.
      </p>
      <ResponsiveContainer width="100%" aspect={1.4} className="mx-auto max-w-[640px]">
        <ScatterChart margin={{ top: 8, right: 16, bottom: 24, left: 8 }}>
          <CartesianGrid stroke={CHART.grid} />
          <XAxis type="number" dataKey="x" name={dk?.label} tick={{ fill: CHART.axisTick, fontSize: 12 }}
            axisLine={{ stroke: CHART.axisLine }} tickLine={false}
            tickFormatter={(v) => (Math.abs(v) >= 1000 ? `${(v / 1000).toLocaleString("id-ID", { maximumFractionDigits: 1 })}k` : `${v}`)}
            label={{ value: dk?.label ?? "", position: "insideBottom", offset: -12, fill: CHART.axisTick, fontSize: 11 }} />
          <YAxis type="number" dataKey="y" name="P0" unit="%" tick={{ fill: CHART.axisTick, fontSize: 12 }}
            axisLine={{ stroke: CHART.axisLine }} tickLine={false} width={44} />
          <ZAxis range={[34, 34]} />
          <RTooltip cursor={{ strokeDasharray: "3 3" }}
            content={({ payload }) =>
              payload && payload.length ? (
                <div className="rounded-lg border border-ink-border bg-ink-panel px-3 py-2 text-xs shadow-panel">
                  <div className="font-medium text-ink-text">{payload[0].payload.name}</div>
                  <div className="mt-0.5 text-ink-muted">{dk?.label}: {payload[0].payload.x.toLocaleString("id-ID", { maximumFractionDigits: 2 })}{dk?.unit ? ` ${dk.unit}` : ""}</div>
                  <div className="text-ink-muted">P0: {payload[0].payload.y.toFixed(2)}%</div>
                </div>
              ) : null
            } />
          <Scatter data={points} fillOpacity={0.72}>
            {points.map((p, i) => <Cell key={i} fill={p.fill} />)}
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>
    </Panel>
  );
}

function pearson(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n < 2) return NaN;
  const mx = xs.reduce((a, v) => a + v, 0) / n;
  const my = ys.reduce((a, v) => a + v, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx, dy = ys[i] - my;
    sxy += dx * dy; sxx += dx * dx; syy += dy * dy;
  }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : NaN;
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

function PageBtn({ disabled, onClick, children }: { disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} disabled={disabled}
      className="grid h-7 w-7 place-items-center rounded-md border border-ink-border bg-ink-panel text-ink-text hover:border-ink-accent/60 disabled:opacity-40">
      {children}
    </button>
  );
}
