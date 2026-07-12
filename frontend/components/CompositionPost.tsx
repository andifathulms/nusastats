"use client";

import { useEffect, useMemo, useState } from "react";
import { CartesianGrid, Cell, Legend, Line, LineChart, Scatter, ScatterChart, Tooltip as RTooltip, XAxis, YAxis, ZAxis, ResponsiveContainer } from "recharts";
import { api, bpsRegionLabel, CHART, dukcapilApi, groupColor, type RegencyCrosswalk } from "@/lib/api";
import { type CompositionConfig } from "@/lib/posts";
import { Panel } from "@/components/ui";
import { SeriesChart } from "@/components/SeriesChart";
import { ChoroplethMap, type MapValue } from "@/components/ChoroplethMap";

// 17 distinct-but-harmonious hues, assigned per sector (turvar) so a colour
// means the same category in every region's bar.
const PALETTE = [
  "#2E5BDA", "#4E8CF0", "#37A98C", "#5FBF6A", "#9BCB4A", "#E0B93B", "#EE9A3A",
  "#E8683C", "#D9455E", "#C74B9E", "#8E5BD1", "#6C6FE0", "#3AA0C2", "#5AC4C9",
  "#94A3B8", "#7C8894", "#546074",
];
const PAGE = 10;

type Sector = { id: string; label: string; color: string };
// `total` = magnitude for ranking/size (latest FULL YEAR, harga konstan).
// `compTotal` = the composition (latest-quarter 17-sector) grand total, the
// denominator for sector shares. byId = per-sector values from that quarter.
type RegionRow = { domain_id: string; name: string; total: number; compTotal: number; byId: Record<string, number> };
type Trend = {
  byRegion: Map<string, { year: number; value: number }[]>;
  rankByRegion: Map<string, Record<number, number>>;
};

// PDRB is in Milyar Rupiah; show large sums as Triliun.
function rp(milyar: number): string {
  if (milyar >= 1000) return `Rp ${(milyar / 1000).toLocaleString("id-ID", { maximumFractionDigits: 2 })} T`;
  return `Rp ${milyar.toLocaleString("id-ID", { maximumFractionDigits: 1 })} M`;
}
const pct = (p: number) => `${p.toLocaleString("id-ID", { maximumFractionDigits: 1 })}%`;
const clean = (label: string) => label.replace(/^([A-Z](,[A-Z])*)\s+/, "");
// Correlation axis value: percent or Triliun Rupiah.
const fmtC = (v: number, unit: string) =>
  unit === "%" ? `${v.toFixed(1)}%` : `Rp ${v.toLocaleString("id-ID", { maximumFractionDigits: 2 })} T`;

export function CompositionPost({ config }: { config: CompositionConfig }) {
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [rows, setRows] = useState<RegionRow[]>([]);
  const [trend, setTrend] = useState<Trend | null>(null);
  const [xwalk, setXwalk] = useState<Map<string, RegencyCrosswalk>>(new Map());
  const [level, setLevel] = useState<"regency" | "province" | "region">("regency");
  const [sel, setSel] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      // Every region's full breakdown in one call (all turvars incl. the grand
      // total), via admin_level — no per-id URL, and totals/order derived here.
      // In parallel, the annual total series for the trend/ranking-movement view.
      const [s, ts, provs] = await Promise.all([
        api.series(config.variableId, {
          admin_level: config.adminLevel,
          ...(config.year ? { year: config.year } : {}),
        }),
        config.trend
          ? api.series(config.trend.variableId, { admin_level: config.adminLevel, turvar_id: config.trend.totalTurvarId })
          : Promise.resolve(null),
        dukcapilApi.regencyCrosswalk(),
      ]);
      if (cancelled) return;
      setXwalk(new Map(provs.results.map((x) => [x.bps_domain_id, x])));

      const latestTotal = new Map<string, number>(); // region -> latest full-year PDRB
      if (ts) {
        const byRegion = new Map<string, { year: number; value: number }[]>();
        for (const d of ts.results) {
          if (d.year == null) continue;
          const arr = byRegion.get(d.domain_id) ?? [];
          arr.push({ year: d.year, value: d.value });
          byRegion.set(d.domain_id, arr);
        }
        byRegion.forEach((arr) => arr.sort((a, b) => a.year - b.year));
        // Latest full-year total per region — the ranking magnitude.
        byRegion.forEach((arr, dom) => arr.length && latestTotal.set(dom, arr[arr.length - 1].value));
        // Rank each region within every year (by that year's total, desc).
        const rankByRegion = new Map<string, Record<number, number>>();
        const years = [...new Set(ts.results.map((d) => d.year).filter((y): y is number => y != null))];
        for (const y of years) {
          ts.results
            .filter((d) => d.year === y)
            .sort((a, b) => b.value - a.value)
            .forEach((d, i) => {
              const m = rankByRegion.get(d.domain_id) ?? {};
              m[y] = i + 1;
              rankByRegion.set(d.domain_id, m);
            });
        }
        setTrend({ byRegion, rankByRegion });
      }

      // Sectors (exclude the grand total), in stable id order -> fixed colour.
      const seen = new Map<string, string>();
      for (const d of s.results) if (d.turvar_id !== config.totalTurvarId) seen.set(d.turvar_id, d.turvar_label);
      const secs: Sector[] = [...seen.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([id, label], i) => ({ id, label: config.shortLabels?.[id] ?? clean(label), color: PALETTE[i % PALETTE.length] }));

      // Group points by region: name, grand total, and per-sector values.
      const byRegion = new Map<string, { name: string; total: number; byId: Record<string, number> }>();
      for (const d of s.results) {
        const r = byRegion.get(d.domain_id) ?? { name: d.domain_name, total: 0, byId: {} };
        if (d.turvar_id === config.totalTurvarId) r.total = d.value;
        else r.byId[d.turvar_id] = d.value;
        byRegion.set(d.domain_id, r);
      }
      const regionRows: RegionRow[] = [...byRegion.entries()]
        .map(([domain_id, r]) => {
          const compTotal = r.total || Object.values(r.byId).reduce((a, v) => a + v, 0);
          return {
            domain_id,
            name: bpsRegionLabel(r.name, domain_id),
            // Rank/size by the latest full-year total; fall back to the
            // composition quarter only if the annual series lacks the region.
            total: latestTotal.get(domain_id) ?? compTotal,
            compTotal,
            byId: r.byId,
          };
        })
        .sort((a, b) => b.total - a.total);

      setSectors(secs);
      setRows(regionRows);
      setSel((cur) => cur ?? regionRows[0]?.domain_id ?? null);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [config.variableId, config.adminLevel, config.totalTurvarId, config.year, config.shortLabels, config.trend]);

  // Aggregation keys: province (via crosswalk) or macro-region (province→region).
  const provKey = (id: string) => provOf(id, xwalk);
  const regionKey = (id: string) => regionOf(provOf(id, xwalk).code);
  const displayRows = useMemo(
    () => (level === "province" ? aggregateRows(rows, provKey) : level === "region" ? aggregateRows(rows, regionKey) : rows),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [level, rows, xwalk]
  );
  const displayTrend = useMemo(
    () =>
      !trend
        ? trend
        : level === "province"
        ? aggregateTrend(trend, (id) => provKey(id).code)
        : level === "region"
        ? aggregateTrend(trend, (id) => regionKey(id).code)
        : trend,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [level, trend, xwalk]
  );
  const provinceRows = useMemo(() => aggregateRows(rows, provKey), [rows, xwalk]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(
    () => (q ? displayRows.filter((r) => r.name.toLowerCase().includes(q.toLowerCase())) : displayRows),
    [displayRows, q]
  );
  const pageRows = filtered.slice(page * PAGE, page * PAGE + PAGE);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const selected = displayRows.find((r) => r.domain_id === sel) ?? displayRows[0];
  const maxTotal = displayRows[0]?.total ?? 1; // #1 (largest economy) sets full-bar scale

  if (loading) return <div className="flex h-64 items-center justify-center text-sm text-ink-muted">Memuat…</div>;

  return (
    <div className="space-y-4">
      {/* Legend — colour = sector, shared by every bar */}
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 rounded-xl border border-ink-border bg-ink-panel px-4 py-3">
        {sectors.map((s) => (
          <span key={s.id} className="inline-flex items-center gap-1.5 text-xs text-ink-muted">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
      </div>

      {/* Ranking with per-region composition bars */}
      <Panel>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm font-semibold text-ink-text">
            Peringkat & komposisi PDRB
            <span className="ml-2 text-xs font-normal text-ink-muted">
              {displayRows.length} {level === "province" ? "provinsi" : level === "region" ? "wilayah" : "kabupaten/kota"}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-lg border border-ink-border/80 bg-ink-panel2/50 p-0.5">
              {(["regency", "province", "region"] as const).map((lv) => (
                <button
                  key={lv}
                  onClick={() => {
                    setLevel(lv);
                    setPage(0);
                  }}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                    level === lv ? "bg-brand-gradient text-white" : "text-ink-muted hover:text-ink-text"
                  }`}
                >
                  {lv === "regency" ? "Kab/Kota" : lv === "province" ? "Provinsi" : "Region"}
                </button>
              ))}
            </div>
            <input
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(0);
              }}
              placeholder="Cari…"
              className="w-36 rounded-lg border border-ink-border bg-ink-panel2 px-2.5 py-1.5 text-sm text-ink-text outline-none focus:border-ink-accent/60"
            />
          </div>
        </div>

        <div className="space-y-1">
          {pageRows.map((r, i) => {
            const rank = filtered.indexOf(r) + 1;
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
                <span className="w-40 shrink-0 truncate text-sm text-ink-text" title={r.name}>
                  {r.name}
                </span>
                <span className="w-20 shrink-0 text-right text-xs tabular-nums text-ink-muted">{rp(r.total)}</span>
                {/* Bar length ∝ region's full-year PDRB vs #1; segments split it
                    by the (latest-quarter) sector shares. Width = share × total/max. */}
                <span className="flex h-4 flex-1 overflow-hidden rounded bg-ink-panel2 ring-1 ring-ink-border/70">
                  {sectors.map((s) => {
                    const share = r.compTotal ? (r.byId[s.id] ?? 0) / r.compTotal : 0;
                    const w = maxTotal ? share * (r.total / maxTotal) * 100 : 0;
                    if (w <= 0) return null;
                    return (
                      <span
                        key={s.id}
                        className="shrink-0"
                        style={{ width: `${w}%`, background: s.color }}
                        title={`${s.label}: ${pct(share * 100)} · ≈ ${rp(share * r.total)}`}
                      />
                    );
                  })}
                </span>
              </button>
            );
          })}
        </div>

        {/* Pagination */}
        <div className="mt-3 flex items-center justify-between text-xs text-ink-muted">
          <span>
            {filtered.length ? page * PAGE + 1 : 0}–{Math.min((page + 1) * PAGE, filtered.length)} dari {filtered.length}
          </span>
          <div className="flex items-center gap-1">
            <PageBtn disabled={page === 0} onClick={() => setPage((p) => p - 1)}>‹</PageBtn>
            <span className="px-1 tabular-nums">
              {page + 1}/{pages}
            </span>
            <PageBtn disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)}>›</PageBtn>
          </div>
        </div>
      </Panel>

      {/* Detail for the selected region */}
      {selected && (
        <Detail
          row={selected}
          sectors={sectors}
          groups={config.groups}
          history={config.history}
          trendSeries={displayTrend?.byRegion.get(selected.domain_id) ?? null}
          trendRanks={displayTrend?.rankByRegion.get(selected.domain_id) ?? null}
          trendLabel={config.trend?.label}
          trendUnit={config.trend?.unit}
        />
      )}

      <MapPanel rows={rows} provinceRows={provinceRows} sectors={sectors} groups={config.groups} xwalk={xwalk} />
      <CorrelationPanel rows={displayRows} sectors={sectors} groups={config.groups} xwalk={xwalk} />
    </div>
  );
}

function MapPanel({
  rows,
  provinceRows,
  sectors,
  groups,
  xwalk,
}: {
  rows: RegionRow[];
  provinceRows: RegionRow[];
  sectors: Sector[];
  groups?: { label: string; color: string; ids: string[] }[];
  xwalk: Map<string, RegencyCrosswalk>;
}) {
  // "PDRB (total)" first, then groups, then the 17 sectors. Empty ids = total.
  const dims = useMemo(
    () => [
      { key: "total", label: "PDRB (total)", ids: [] as string[] },
      ...(groups ?? []).map((g) => ({ key: `g:${g.label}`, label: g.label, ids: g.ids })),
      ...sectors.map((s) => ({ key: `s:${s.id}`, label: s.label, ids: [s.id] })),
    ],
    [groups, sectors]
  );
  const [dimKey, setDimKey] = useState("");
  const [mapLevel, setMapLevel] = useState<"province" | "regency">("province");
  const [metric, setMetric] = useState<"share" | "nominal">("share");
  const dim = dims.find((d) => d.key === dimKey) ?? dims[0];
  const isTotal = !dim || dim.ids.length === 0;
  const effMetric = isTotal ? "nominal" : metric; // total has no meaningful %

  // Province choropleth keys by the 2-digit Kemendagri code (dukcapil-provinces);
  // kabupaten keys by the Kemendagri regency code via the crosswalk
  // (dukcapil-regencies) — BPS's own codes don't match that geometry.
  const { values, geojsonUrls } = useMemo(() => {
    const m = new Map<string, MapValue>();
    // Share from the composition quarter; nominal = full-year total/estimate.
    const shareOf = (r: RegionRow) =>
      isTotal ? 100 : r.compTotal ? (dim.ids.reduce((a, id) => a + (r.byId[id] ?? 0), 0) / r.compTotal) * 100 : 0;
    const nominalOf = (r: RegionRow) => (isTotal ? r.total : (shareOf(r) / 100) * r.total); // Milyar
    // Colour by the chosen metric; the tooltip's `extra` shows the other one.
    const mv = (r: RegionRow): MapValue => {
      const nom = nominalOf(r);
      const shr = shareOf(r);
      return effMetric === "share"
        ? { value: Math.round(shr * 10) / 10, name: r.name, extra: `≈ ${rp(nom)}` }
        : { value: Math.round((nom / 1000) * 100) / 100, name: r.name, extra: isTotal ? undefined : `${shr.toLocaleString("id-ID", { maximumFractionDigits: 1 })}% dari PDRB` };
    };
    if (mapLevel === "province") {
      provinceRows.forEach((r) => m.set(r.domain_id, mv(r)));
      return { values: m, geojsonUrls: ["/dukcapil-provinces.geojson"] };
    }
    rows.forEach((r) => {
      const kem = xwalk.get(r.domain_id)?.kemendagri_code;
      if (kem) m.set(kem, mv(r));
    });
    return { values: m, geojsonUrls: ["/dukcapil-regencies.geojson"] };
  }, [mapLevel, effMetric, isTotal, provinceRows, rows, dim, xwalk]);
  const vals = [...values.values()].map((v) => v.value);
  const min = vals.length ? Math.min(...vals) : 0;
  const max = vals.length ? Math.max(...vals) : 100;
  const unit = effMetric === "share" ? "%" : "T";

  if (dims.length < 1) return null;

  return (
    <Panel>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-ink-text">
          Peta sektor · {mapLevel === "province" ? "provinsi" : "kabupaten/kota"}
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-ink-border/80 bg-ink-panel2/50 p-0.5">
            {(["share", "nominal"] as const).map((mt) => (
              <button
                key={mt}
                onClick={() => setMetric(mt)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  metric === mt ? "bg-brand-gradient text-white" : "text-ink-muted hover:text-ink-text"
                }`}
              >
                {mt === "share" ? "Persentase" : "Nominal"}
              </button>
            ))}
          </div>
          <div className="inline-flex rounded-lg border border-ink-border/80 bg-ink-panel2/50 p-0.5">
            {(["province", "regency"] as const).map((lv) => (
              <button
                key={lv}
                onClick={() => setMapLevel(lv)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  mapLevel === lv ? "bg-brand-gradient text-white" : "text-ink-muted hover:text-ink-text"
                }`}
              >
                {lv === "province" ? "Provinsi" : "Kab/Kota"}
              </button>
            ))}
          </div>
          <select
            value={dim?.key ?? ""}
            onChange={(e) => setDimKey(e.target.value)}
            className="rounded-lg border border-ink-border bg-ink-panel2 px-2 py-1.5 text-sm text-ink-text outline-none focus:border-ink-accent/60"
          >
            {dims.map((d) => (
              <option key={d.key} value={d.key}>{d.label}</option>
            ))}
          </select>
        </div>
      </div>
      <ChoroplethMap key={mapLevel} values={values} min={min} max={max} unit={unit} geojsonUrls={geojsonUrls} />
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

function CorrelationPanel({
  rows,
  sectors,
  groups,
  xwalk,
}: {
  rows: RegionRow[];
  sectors: Sector[];
  groups?: { label: string; color: string; ids: string[] }[];
  xwalk: Map<string, RegencyCrosswalk>;
}) {
  // Province of a row: itself if already a province row (2-digit id), else via
  // the crosswalk (38-province).
  const prov = (r: RegionRow) => (r.domain_id.length <= 2 ? { code: r.domain_id, name: r.name } : provOf(r.domain_id, xwalk));
  // Axis choices: the higher-level groups first, then the individual sectors.
  const dims = useMemo(
    () => [
      ...(groups ?? []).map((g) => ({ key: `g:${g.label}`, label: g.label, ids: g.ids })),
      ...sectors.map((s) => ({ key: `s:${s.id}`, label: s.label, ids: [s.id] })),
    ],
    [groups, sectors]
  );
  const [xKey, setXKey] = useState("");
  const [yKey, setYKey] = useState("");
  const [cMetric, setCMetric] = useState<"share" | "nominal">("share");
  const [selProvs, setSelProvs] = useState<Set<string>>(new Set());
  const xd = dims.find((d) => d.key === xKey) ?? dims[0];
  const yd = dims.find((d) => d.key === yKey) ?? dims[1] ?? dims[0];
  const unit = cMetric === "share" ? "%" : "T";

  // Share (% of PDRB) or nominal (full-year estimate, Triliun) of a sector set.
  const val = (row: RegionRow, ids: string[]) => {
    const share = row.compTotal ? (ids.reduce((a, id) => a + (row.byId[id] ?? 0), 0) / row.compTotal) : 0;
    return cMetric === "share" ? share * 100 : (share * row.total) / 1000;
  };

  // Provinces present among the rows, for the legend/filter.
  const provs = useMemo(() => {
    const set = new Map<string, string>();
    rows.forEach((r) => {
      const p = prov(r);
      set.set(p.code, p.name);
    });
    return [...set.entries()].sort((a, b) => a[1].localeCompare(b[1]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, xwalk]);

  const visibleRows = useMemo(
    () => (selProvs.size ? rows.filter((r) => selProvs.has(prov(r).code)) : rows),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, selProvs, xwalk]
  );
  const points = useMemo(
    () =>
      xd && yd
        ? visibleRows.map((r) => ({ x: val(r, xd.ids), y: val(r, yd.ids), name: r.name, fill: groupColor(prov(r).code) }))
        : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visibleRows, xd, yd, xwalk, cMetric]
  );
  const r = useMemo(() => pearson(points.map((p) => p.x), points.map((p) => p.y)), [points]);

  if (dims.length < 2) return null;
  const toggleProv = (code: string) =>
    setSelProvs((cur) => {
      const n = new Set(cur);
      n.has(code) ? n.delete(code) : n.add(code);
      return n;
    });

  const Select = ({ v, on }: { v: string; on: (s: string) => void }) => (
    <select
      value={v}
      onChange={(e) => on(e.target.value)}
      className="rounded-lg border border-ink-border bg-ink-panel2 px-2 py-1.5 text-sm text-ink-text outline-none focus:border-ink-accent/60"
    >
      {dims.map((d) => (
        <option key={d.key} value={d.key}>{d.label}</option>
      ))}
    </select>
  );

  return (
    <Panel>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-ink-text">Korelasi antar-sektor</span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-ink-border/80 bg-ink-panel2/50 p-0.5">
            {(["share", "nominal"] as const).map((mt) => (
              <button
                key={mt}
                onClick={() => setCMetric(mt)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  cMetric === mt ? "bg-brand-gradient text-white" : "text-ink-muted hover:text-ink-text"
                }`}
              >
                {mt === "share" ? "Persentase" : "Nominal"}
              </button>
            ))}
          </div>
          <span className="flex items-center gap-2 text-xs text-ink-muted">
            <Select v={xd?.key ?? ""} on={setXKey} /> vs <Select v={yd?.key ?? ""} on={setYKey} />
          </span>
        </div>
      </div>
      <div className="mb-2 text-xs text-ink-muted">
        Korelasi (r) ={" "}
        <span className={`font-semibold ${Math.abs(r) >= 0.5 ? "text-ink-text" : "text-ink-muted"}`}>
          {isNaN(r) ? "–" : r.toFixed(2)}
        </span>{" "}
        · {points.length} wilayah · tiap titik satu wilayah, warna = provinsi
      </div>

      {/* Province legend + filter — click to isolate provinces */}
      <div className="mb-3 flex flex-wrap gap-x-3 gap-y-1">
        {selProvs.size > 0 && (
          <button onClick={() => setSelProvs(new Set())} className="text-xs text-ink-accent hover:underline">
            Semua provinsi
          </button>
        )}
        {provs.map(([code, name]) => {
          const on = selProvs.size === 0 || selProvs.has(code);
          return (
            <button
              key={code}
              onClick={() => toggleProv(code)}
              className={`inline-flex items-center gap-1.5 text-xs transition-opacity ${on ? "opacity-100" : "opacity-30"}`}
              title={name}
            >
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: groupColor(code) }} />
              <span className="text-ink-muted">{name}</span>
            </button>
          );
        })}
      </div>

      {/* Square so x and y read on the same scale */}
      <ResponsiveContainer width="100%" aspect={1} className="mx-auto max-w-[560px]">
        <ScatterChart margin={{ top: 8, right: 16, bottom: 24, left: 8 }}>
          <CartesianGrid stroke={CHART.grid} />
          <XAxis
            type="number" dataKey="x" name={xd?.label} tick={{ fill: CHART.axisTick, fontSize: 12 }}
            axisLine={{ stroke: CHART.axisLine }} tickLine={false} unit={unit}
            label={{ value: `${xd?.label} (${unit})`, position: "insideBottom", offset: -12, fill: CHART.axisTick, fontSize: 12 }}
          />
          <YAxis
            type="number" dataKey="y" name={yd?.label} tick={{ fill: CHART.axisTick, fontSize: 12 }}
            axisLine={{ stroke: CHART.axisLine }} tickLine={false} width={48} unit={unit}
          />
          <ZAxis range={[36, 36]} />
          <RTooltip
            cursor={{ strokeDasharray: "3 3" }}
            content={({ payload }) =>
              payload && payload.length ? (
                <div className="rounded-lg border border-ink-border bg-ink-panel px-3 py-2 text-xs shadow-panel">
                  <div className="font-medium text-ink-text">{payload[0].payload.name}</div>
                  <div className="mt-0.5 text-ink-muted">{xd?.label}: {fmtC(payload[0].payload.x, unit)}</div>
                  <div className="text-ink-muted">{yd?.label}: {fmtC(payload[0].payload.y, unit)}</div>
                </div>
              ) : null
            }
          />
          <Scatter data={points} fillOpacity={0.75}>
            {points.map((p, i) => (
              <Cell key={i} fill={p.fill} />
            ))}
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>
    </Panel>
  );
}

// Province code + name for a BPS regency, via the Kemendagri crosswalk (modern
// 38-province structure), falling back to the BPS 2-digit prefix.
function provOf(domainId: string, xwalk: Map<string, RegencyCrosswalk>) {
  const cw = xwalk.get(domainId);
  return { code: cw?.prov_code ?? domainId.slice(0, 2), name: cw?.prov_name ?? domainId.slice(0, 2) };
}

// Macro-regions (kelompok pulau), keyed by 2-digit province code.
const MACRO_REGIONS: [string, string[]][] = [
  ["Sumatera", ["11", "12", "13", "14", "15", "16", "17", "18", "19", "21"]],
  ["Jawa", ["31", "32", "33", "34", "35", "36"]],
  ["Kepulauan Sunda Kecil", ["51", "52", "53"]], // Bali, NTB, NTT
  ["Kalimantan", ["61", "62", "63", "64", "65"]],
  ["Sulawesi", ["71", "72", "73", "74", "75", "76"]],
  ["Maluku dan Papua", ["81", "82", "91", "92", "93", "94", "95", "96"]],
];
const REGION_BY_PROV = new Map<string, { code: string; name: string }>();
MACRO_REGIONS.forEach(([name, ps]) => ps.forEach((p) => REGION_BY_PROV.set(p, { code: `reg:${name}`, name })));
function regionOf(provCode: string) {
  return REGION_BY_PROV.get(provCode) ?? { code: "reg:Lainnya", name: "Lainnya" };
}

// Aggregate rows by a key function (region_id -> {code, name}); sums total +
// compTotal + every sector, re-sorted by total.
function aggregateRows(rows: RegionRow[], keyOf: (id: string) => { code: string; name: string }): RegionRow[] {
  const g = new Map<string, RegionRow>();
  for (const r of rows) {
    const k = keyOf(r.domain_id);
    const cur = g.get(k.code) ?? { domain_id: k.code, name: k.name, total: 0, compTotal: 0, byId: {} };
    cur.total += r.total;
    cur.compTotal += r.compTotal;
    for (const [id, v] of Object.entries(r.byId)) cur.byId[id] = (cur.byId[id] ?? 0) + v;
    g.set(k.code, cur);
  }
  return [...g.values()].sort((a, b) => b.total - a.total);
}

// Aggregate the annual trend by a key function (sum per year), re-ranking.
function aggregateTrend(trend: Trend, keyOf: (id: string) => string): Trend {
  const byProv = new Map<string, Map<number, number>>();
  trend.byRegion.forEach((arr, dom) => {
    const cc = keyOf(dom);
    const ym = byProv.get(cc) ?? new Map<number, number>();
    for (const { year, value } of arr) ym.set(year, (ym.get(year) ?? 0) + value);
    byProv.set(cc, ym);
  });
  const byRegion = new Map<string, { year: number; value: number }[]>();
  byProv.forEach((ym, cc) =>
    byRegion.set(cc, [...ym.entries()].map(([year, value]) => ({ year, value })).sort((a, b) => a.year - b.year))
  );
  const years = new Set<number>();
  byRegion.forEach((arr) => arr.forEach((x) => years.add(x.year)));
  const rankByRegion = new Map<string, Record<number, number>>();
  for (const y of years) {
    [...byRegion.entries()]
      .map(([id, arr]) => ({ id, v: arr.find((x) => x.year === y)?.value ?? 0 }))
      .sort((a, b) => b.v - a.v)
      .forEach((x, i) => {
        const m = rankByRegion.get(x.id) ?? {};
        m[y] = i + 1;
        rankByRegion.set(x.id, m);
      });
  }
  return { byRegion, rankByRegion };
}

function Detail({
  row,
  sectors,
  groups,
  history,
  trendSeries,
  trendRanks,
  trendLabel,
  trendUnit,
}: {
  row: RegionRow;
  sectors: Sector[];
  groups?: { label: string; color: string; ids: string[] }[];
  history?: { variableId: string; totalTurvarId: string; unit: string; label: string; partialLastYear?: boolean };
  trendSeries?: { year: number; value: number }[] | null;
  trendRanks?: Record<number, number> | null;
  trendLabel?: string;
  trendUnit?: string;
}) {
  const isProvince = row.domain_id.length <= 2; // province rows are 2-digit
  // Shares from the composition quarter (compTotal); nominal is the full-year
  // estimate = share × full-year total.
  const parts = sectors
    .map((s) => {
      const share = row.compTotal ? ((row.byId[s.id] ?? 0) / row.compTotal) * 100 : 0;
      return { ...s, share, value: (share / 100) * row.total };
    })
    .sort((a, b) => b.value - a.value);
  const top3 = parts.slice(0, 3).reduce((a, p) => a + p.share, 0);
  const maxPart = parts[0]?.value || 1; // top sector = full bar, rest relative to it

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 pt-2">
        <div className="h-px flex-1 bg-ink-border" />
        <div className="text-xs font-medium uppercase tracking-wide text-ink-muted">Rincian · {row.name}</div>
        <div className="h-px flex-1 bg-ink-border" />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="Total PDRB" value={rp(row.total)} sub={row.name} />
        <Stat label="Sektor dominan" value={parts[0]?.label ?? "–"} sub={parts[0] ? pct(parts[0].share) + " dari PDRB" : undefined} />
        <Stat label="3 sektor teratas" value={pct(top3)} sub="konsentrasi ekonomi" />
      </div>

      {groups && groups.length > 0 && <GroupPanel row={row} groups={groups} />}

      <Panel>
        <div className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-muted">Komposisi PDRB · 17 kategori</div>
        <div className="flex h-7 w-full overflow-hidden rounded-md ring-1 ring-ink-border">
          {sectors.map((s) => {
            const share = row.compTotal ? ((row.byId[s.id] ?? 0) / row.compTotal) * 100 : 0;
            if (share <= 0) return null;
            return <div key={s.id} title={`${s.label}: ${pct(share)}`} style={{ width: `${share}%`, background: s.color }} />;
          })}
        </div>
      </Panel>

      <Panel>
        <div className="mb-3 text-xs font-medium uppercase tracking-wide text-ink-muted">Kategori lapangan usaha</div>
        <div className="space-y-1.5">
          {parts.map((p) => (
            <div key={p.id} className="flex items-center gap-3">
              <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: p.color }} />
              <span className="w-44 shrink-0 truncate text-sm text-ink-text" title={p.label}>{p.label}</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-ink-panel2">
                <div className="h-full rounded-full" style={{ width: `${(p.value / maxPart) * 100}%`, background: p.color }} />
              </div>
              <span className="w-14 shrink-0 text-right text-sm tabular-nums text-ink-text">{pct(p.share)}</span>
              <span className="hidden w-24 shrink-0 text-right text-xs tabular-nums text-ink-muted sm:block">{rp(p.value)}</span>
            </div>
          ))}
        </div>
      </Panel>

      {/* Province: native 17-sector history w/ Total↔Komponen toggle (incl. 2026).
          Kabupaten: total-only trend (no kab sector history exists at BPS). */}
      {isProvince && history ? (
        <HistoryPanel provCode={row.domain_id} sectors={sectors} cfg={history} ranks={trendRanks ?? {}} />
      ) : (
        trendSeries && trendSeries.length > 1 && (
          <TrendPanel series={trendSeries} ranks={trendRanks ?? {}} label={trendLabel} unit={trendUnit} />
        )
      )}
    </div>
  );
}

function HistoryPanel({
  provCode,
  sectors,
  cfg,
  ranks,
}: {
  provCode: string;
  sectors: Sector[];
  cfg: { variableId: string; totalTurvarId: string; unit: string; label: string; partialLastYear?: boolean };
  ranks: Record<number, number>;
}) {
  const [rows, setRows] = useState<Record<string, number>[] | null>(null);
  const [mode, setMode] = useState<"total" | "components" | "rank">("total");

  useEffect(() => {
    let cancelled = false;
    setRows(null);
    api.series(cfg.variableId, { vervar_id: provCode }).then((s) => {
      if (cancelled) return;
      const byYear = new Map<number, Record<string, number>>();
      for (const d of s.results) {
        if (d.year == null) continue;
        const y = byYear.get(d.year) ?? { year: d.year };
        y[d.turvar_id] = d.value;
        byYear.set(d.year, y);
      }
      const ordered = [...byYear.values()].sort((a, b) => a.year - b.year);
      // Drop the partial current year (BPS reports it as one quarter).
      setRows(cfg.partialLastYear ? ordered.slice(0, -1) : ordered);
    });
    return () => {
      cancelled = true;
    };
  }, [provCode, cfg.variableId]);

  if (!rows) return <Panel><div className="flex h-40 items-center justify-center text-sm text-ink-muted">Memuat…</div></Panel>;
  const first = rows[0], last = rows[rows.length - 1];
  const endRow = last; // partial year already dropped
  const growth = first?.[cfg.totalTurvarId] ? (last[cfg.totalTurvarId] / first[cfg.totalTurvarId] - 1) * 100 : 0;

  return (
    <Panel>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs font-medium uppercase tracking-wide text-ink-muted">
          {cfg.label} · {first?.year}–{endRow?.year}
        </div>
        <div className="inline-flex rounded-lg border border-ink-border/80 bg-ink-panel2/50 p-0.5">
          {(["total", "components", "rank"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                mode === m ? "bg-brand-gradient text-white" : "text-ink-muted hover:text-ink-text"
              }`}
            >
              {m === "total" ? "Total" : m === "components" ? "Per sektor" : "Peringkat"}
            </button>
          ))}
        </div>
      </div>
      {mode === "rank" ? (
        <RankChart rows={rows.map((r) => ({ year: r.year, rank: ranks[r.year] })).filter((r) => r.rank != null)} />
      ) : (
        <ResponsiveContainer width="100%" height={mode === "components" ? 380 : 300}>
          <LineChart data={rows} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
            <CartesianGrid stroke={CHART.grid} vertical={false} />
            <XAxis dataKey="year" tick={{ fill: CHART.axisTick, fontSize: 12 }} axisLine={{ stroke: CHART.axisLine }} tickLine={false} />
            <YAxis
              tick={{ fill: CHART.axisTick, fontSize: 12 }} axisLine={{ stroke: CHART.axisLine }} tickLine={false} width={56}
              tickFormatter={(v) => (Math.abs(v) >= 1000 ? `${(v / 1000).toLocaleString("id-ID")}k` : `${v}`)}
            />
            <RTooltip
              contentStyle={{ background: CHART.tooltipBg, border: `1px solid ${CHART.tooltipBorder}`, borderRadius: 8 }}
              formatter={(v: number, n: string) => [`${v?.toLocaleString?.("id-ID") ?? v} M`, n]}
            />
            {mode === "components" && <Legend wrapperStyle={{ fontSize: 11 }} />}
            {mode === "total" ? (
              <Line type="monotone" dataKey={cfg.totalTurvarId} name="PDRB" stroke={CHART.accent} strokeWidth={2} dot={false} />
            ) : (
              sectors.map((s) => (
                <Line key={s.id} type="monotone" dataKey={s.id} name={s.label} stroke={s.color} strokeWidth={1.6} dot={false} />
              ))
            )}
          </LineChart>
        </ResponsiveContainer>
      )}
      <div className="mt-2 text-xs text-ink-muted">
        Pertumbuhan {first?.year}→{endRow?.year}: <span className="font-semibold text-ink-text">{growth >= 0 ? "+" : ""}{growth.toLocaleString("id-ID", { maximumFractionDigits: 0 })}%</span>
        {ranks[endRow?.year] != null && <> · Peringkat {endRow?.year}: #{ranks[endRow?.year]} nasional</>}
      </div>
    </Panel>
  );
}

function GroupPanel({ row, groups }: { row: RegionRow; groups: { label: string; color: string; ids: string[] }[] }) {
  const g = groups.map((grp) => {
    const abs = grp.ids.reduce((a, id) => a + (row.byId[id] ?? 0), 0);
    const share = row.compTotal ? (abs / row.compTotal) * 100 : 0;
    return { ...grp, value: (share / 100) * row.total, share };
  });
  const lead = [...g].sort((a, b) => b.value - a.value)[0];
  return (
    <Panel>
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-ink-muted">Kelompok sektor</span>
        <span className="text-xs text-ink-muted">
          Dominan: <span className="font-medium text-ink-text">{lead?.label}</span> ({pct(lead?.share ?? 0)})
        </span>
      </div>
      <div className="flex h-7 w-full overflow-hidden rounded-md ring-1 ring-ink-border">
        {g.map((grp) =>
          grp.share > 0 ? (
            <div key={grp.label} title={`${grp.label}: ${pct(grp.share)} · ${rp(grp.value)}`} style={{ width: `${grp.share}%`, background: grp.color }} />
          ) : null
        )}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1">
        {g.map((grp) => (
          <span key={grp.label} className="inline-flex items-center gap-1.5 text-xs text-ink-muted">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: grp.color }} />
            {grp.label} <span className="tabular-nums text-ink-text">{pct(grp.share)}</span>
          </span>
        ))}
      </div>
    </Panel>
  );
}

// Rank-over-time line — Y axis reversed so #1 sits at the top.
function RankChart({ rows }: { rows: { year: number; rank: number }[] }) {
  if (rows.length < 2) return <div className="flex h-[280px] items-center justify-center text-sm text-ink-muted">Data peringkat tidak cukup.</div>;
  // Zoom the axis to THIS region's own rank range (+ padding) so its movement is
  // visible — not [1..maxRank], which would pin a #339 line to the bottom.
  const rr = rows.map((r) => r.rank);
  const minR = Math.min(...rr), maxR = Math.max(...rr);
  // Fractional padding (no clamp to 1) so even a flat #1 sits centred, not on
  // the top edge. Integer ticks only, so no "#0.4" shows.
  const pad = Math.max(0.6, (maxR - minR) * 0.3);
  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={rows} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
        <CartesianGrid stroke={CHART.grid} vertical={false} />
        <XAxis dataKey="year" tick={{ fill: CHART.axisTick, fontSize: 12 }} axisLine={{ stroke: CHART.axisLine }} tickLine={false} />
        <YAxis
          reversed domain={[minR - pad, maxR + pad]} allowDecimals={false} width={40}
          tick={{ fill: CHART.axisTick, fontSize: 12 }} axisLine={{ stroke: CHART.axisLine }} tickLine={false}
          tickFormatter={(v) => `#${v}`}
        />
        <RTooltip
          contentStyle={{ background: CHART.tooltipBg, border: `1px solid ${CHART.tooltipBorder}`, borderRadius: 8 }}
          formatter={(v: number) => [`#${v}`, "Peringkat nasional"]}
        />
        <Line type="monotone" dataKey="rank" name="Peringkat" stroke={CHART.accent} strokeWidth={2} dot={{ r: 2 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}

function TrendPanel({
  series,
  ranks,
  label,
  unit,
}: {
  series: { year: number; value: number }[];
  ranks: Record<number, number>;
  label?: string;
  unit?: string;
}) {
  const [mode, setMode] = useState<"pdrb" | "rank">("pdrb");
  const first = series[0];
  const last = series[series.length - 1];
  const growth = first.value ? (last.value / first.value - 1) * 100 : 0;
  const rankNow = ranks[last.year];
  const rankThen = ranks[first.year];
  const rankDelta = rankThen != null && rankNow != null ? rankThen - rankNow : null; // + = moved up
  const chartRows = series.map((s) => ({ year: s.year, pdrb: s.value }));
  const rankRows = series.map((s) => ({ year: s.year, rank: ranks[s.year] })).filter((r) => r.rank != null) as { year: number; rank: number }[];
  const deltaText =
    rankDelta == null ? "–" : rankDelta === 0 ? "tetap" : rankDelta > 0 ? `naik ${rankDelta}` : `turun ${-rankDelta}`;

  return (
    <Panel>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs font-medium uppercase tracking-wide text-ink-muted">
          {label ?? "PDRB tahunan"} · {first.year}–{last.year}
        </div>
        <div className="inline-flex rounded-lg border border-ink-border/80 bg-ink-panel2/50 p-0.5">
          {(["pdrb", "rank"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                mode === m ? "bg-brand-gradient text-white" : "text-ink-muted hover:text-ink-text"
              }`}
            >
              {m === "pdrb" ? "PDRB" : "Peringkat"}
            </button>
          ))}
        </div>
      </div>
      <div className="mb-3 grid grid-cols-3 gap-3">
        <Stat label={`Pertumbuhan ${first.year}→${last.year}`} value={`${growth >= 0 ? "+" : ""}${growth.toLocaleString("id-ID", { maximumFractionDigits: 0 })}%`} sub="riil (harga konstan)" />
        <Stat label={`Peringkat ${last.year}`} value={rankNow != null ? `#${rankNow}` : "–"} sub="nasional" />
        <Stat label={`Peringkat sejak ${first.year}`} value={deltaText} sub={rankThen != null ? `dari #${rankThen}` : undefined} />
      </div>
      {mode === "pdrb" ? (
        <SeriesChart rows={chartRows} entities={[{ key: "pdrb", label: label ?? "PDRB" }]} unit={unit} />
      ) : (
        <RankChart rows={rankRows} />
      )}
    </Panel>
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

function PageBtn({ disabled, onClick, children }: { disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="grid h-7 w-7 place-items-center rounded-md border border-ink-border bg-ink-panel text-ink-text hover:border-ink-accent/60 disabled:opacity-40"
    >
      {children}
    </button>
  );
}
