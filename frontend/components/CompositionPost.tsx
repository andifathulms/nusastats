"use client";

import { useEffect, useMemo, useState } from "react";
import { CartesianGrid, Cell, Scatter, ScatterChart, Tooltip as RTooltip, XAxis, YAxis, ZAxis, ResponsiveContainer } from "recharts";
import { api, bpsRegionLabel, CHART, groupColor } from "@/lib/api";
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
type RegionRow = { domain_id: string; name: string; total: number; byId: Record<string, number> };
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

export function CompositionPost({ config }: { config: CompositionConfig }) {
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [rows, setRows] = useState<RegionRow[]>([]);
  const [trend, setTrend] = useState<Trend | null>(null);
  const [provNames, setProvNames] = useState<Map<string, string>>(new Map());
  const [level, setLevel] = useState<"regency" | "province">("regency");
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
        api.regions({ admin_level: "province" }),
      ]);
      if (cancelled) return;
      setProvNames(new Map(provs.map((p) => [p.domain_id.slice(0, 2), p.domain_name])));

      if (ts) {
        const byRegion = new Map<string, { year: number; value: number }[]>();
        for (const d of ts.results) {
          if (d.year == null) continue;
          const arr = byRegion.get(d.domain_id) ?? [];
          arr.push({ year: d.year, value: d.value });
          byRegion.set(d.domain_id, arr);
        }
        byRegion.forEach((arr) => arr.sort((a, b) => a.year - b.year));
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
        .map(([domain_id, r]) => ({
          domain_id,
          name: bpsRegionLabel(r.name, domain_id),
          total: r.total || Object.values(r.byId).reduce((a, v) => a + v, 0),
          byId: r.byId,
        }))
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

  // Province view aggregates the loaded kabupaten data by 2-digit code prefix.
  const displayRows = useMemo(
    () => (level === "province" ? aggregateRows(rows, provNames) : rows),
    [level, rows, provNames]
  );
  const displayTrend = useMemo(
    () => (level === "province" && trend ? aggregateTrend(trend) : trend),
    [level, trend]
  );
  // Map is always province-level (only province geometry exists), independent
  // of the ranking's level toggle.
  const provinceRows = useMemo(() => aggregateRows(rows, provNames), [rows, provNames]);

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
              {displayRows.length} {level === "province" ? "provinsi" : "kabupaten/kota"}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-lg border border-ink-border/80 bg-ink-panel2/50 p-0.5">
              {(["regency", "province"] as const).map((lv) => (
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
                  {lv === "regency" ? "Kab/Kota" : "Provinsi"}
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
                {/* Bar length ∝ region total vs the #1 region; segments ∝ sectors.
                    A segment's width over the full track = value / maxTotal. */}
                <span className="flex h-4 flex-1 overflow-hidden rounded bg-ink-panel2 ring-1 ring-ink-border/70">
                  {sectors.map((s) => {
                    const v = r.byId[s.id] ?? 0;
                    const w = maxTotal ? (v / maxTotal) * 100 : 0;
                    if (w <= 0) return null;
                    return (
                      <span
                        key={s.id}
                        className="shrink-0"
                        style={{ width: `${w}%`, background: s.color }}
                        title={`${s.label}: ${pct(r.total ? (v / r.total) * 100 : 0)} · ${rp(v)}`}
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
          trendSeries={displayTrend?.byRegion.get(selected.domain_id) ?? null}
          trendRanks={displayTrend?.rankByRegion.get(selected.domain_id) ?? null}
          trendLabel={config.trend?.label}
          trendUnit={config.trend?.unit}
        />
      )}

      <MapPanel rows={provinceRows} sectors={sectors} groups={config.groups} />
      <CorrelationPanel rows={displayRows} sectors={sectors} groups={config.groups} />
    </div>
  );
}

function MapPanel({
  rows,
  sectors,
  groups,
}: {
  rows: RegionRow[];
  sectors: Sector[];
  groups?: { label: string; color: string; ids: string[] }[];
}) {
  const dims = useMemo(
    () => [
      ...(groups ?? []).map((g) => ({ key: `g:${g.label}`, label: g.label, ids: g.ids })),
      ...sectors.map((s) => ({ key: `s:${s.id}`, label: s.label, ids: [s.id] })),
    ],
    [groups, sectors]
  );
  const [dimKey, setDimKey] = useState("");
  const dim = dims.find((d) => d.key === dimKey) ?? dims[0];

  const values = useMemo(() => {
    const m = new Map<string, MapValue>();
    if (dim) {
      for (const r of rows) {
        const share = r.total ? (dim.ids.reduce((a, id) => a + (r.byId[id] ?? 0), 0) / r.total) * 100 : 0;
        m.set(r.domain_id, { value: Math.round(share * 10) / 10, name: r.name });
      }
    }
    return m;
  }, [rows, dim]);
  const vals = [...values.values()].map((v) => v.value);
  const min = vals.length ? Math.min(...vals) : 0;
  const max = vals.length ? Math.max(...vals) : 100;

  if (dims.length < 1) return null;

  return (
    <Panel>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-ink-text">Peta share sektor per provinsi</span>
        <select
          value={dim?.key ?? ""}
          onChange={(e) => setDimKey(e.target.value)}
          className="ml-auto rounded-lg border border-ink-border bg-ink-panel2 px-2 py-1.5 text-sm text-ink-text outline-none focus:border-ink-accent/60"
        >
          {dims.map((d) => (
            <option key={d.key} value={d.key}>{d.label}</option>
          ))}
        </select>
      </div>
      <ChoroplethMap values={values} min={min} max={max} unit="%" />
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
}: {
  rows: RegionRow[];
  sectors: Sector[];
  groups?: { label: string; color: string; ids: string[] }[];
}) {
  // Axis choices: the higher-level groups first, then the individual sectors.
  const dims = useMemo(
    () => [
      ...(groups ?? []).map((g) => ({ key: `g:${g.label}`, label: `${g.label} (%)`, ids: g.ids })),
      ...sectors.map((s) => ({ key: `s:${s.id}`, label: `${s.label} (%)`, ids: [s.id] })),
    ],
    [groups, sectors]
  );
  const [xKey, setXKey] = useState("");
  const [yKey, setYKey] = useState("");
  const xd = dims.find((d) => d.key === xKey) ?? dims[0];
  const yd = dims.find((d) => d.key === yKey) ?? dims[1] ?? dims[0];

  const share = (row: RegionRow, ids: string[]) =>
    row.total ? (ids.reduce((a, id) => a + (row.byId[id] ?? 0), 0) / row.total) * 100 : 0;

  const points = useMemo(
    () =>
      xd && yd
        ? rows.map((r) => ({ x: share(r, xd.ids), y: share(r, yd.ids), name: r.name, fill: groupColor(r.domain_id.slice(0, 2)) }))
        : [],
    [rows, xd, yd]
  );
  const r = useMemo(() => pearson(points.map((p) => p.x), points.map((p) => p.y)), [points]);

  if (dims.length < 2) return null;

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
        <span className="ml-auto flex items-center gap-2 text-xs text-ink-muted">
          <Select v={xd?.key ?? ""} on={setXKey} /> vs <Select v={yd?.key ?? ""} on={setYKey} />
        </span>
      </div>
      <div className="mb-2 text-xs text-ink-muted">
        Korelasi (r) ={" "}
        <span className={`font-semibold ${Math.abs(r) >= 0.5 ? "text-ink-text" : "text-ink-muted"}`}>
          {isNaN(r) ? "–" : r.toFixed(2)}
        </span>{" "}
        · {points.length} wilayah · tiap titik satu wilayah, warna = provinsi
      </div>
      <ResponsiveContainer width="100%" height={320}>
        <ScatterChart margin={{ top: 8, right: 16, bottom: 24, left: 8 }}>
          <CartesianGrid stroke={CHART.grid} />
          <XAxis
            type="number" dataKey="x" name={xd?.label} tick={{ fill: CHART.axisTick, fontSize: 12 }}
            axisLine={{ stroke: CHART.axisLine }} tickLine={false} unit="%"
            label={{ value: xd?.label, position: "insideBottom", offset: -12, fill: CHART.axisTick, fontSize: 12 }}
          />
          <YAxis
            type="number" dataKey="y" name={yd?.label} tick={{ fill: CHART.axisTick, fontSize: 12 }}
            axisLine={{ stroke: CHART.axisLine }} tickLine={false} width={48} unit="%"
          />
          <ZAxis range={[36, 36]} />
          <RTooltip
            cursor={{ strokeDasharray: "3 3" }}
            contentStyle={{ background: CHART.tooltipBg, border: `1px solid ${CHART.tooltipBorder}`, borderRadius: 8 }}
            formatter={(v: number, n: string) => [`${v.toFixed(1)}%`, n === "x" ? xd?.label : yd?.label]}
            labelFormatter={() => ""}
            content={({ payload }) =>
              payload && payload.length ? (
                <div className="rounded-lg border border-ink-border bg-ink-panel px-3 py-2 text-xs shadow-panel">
                  <div className="font-medium text-ink-text">{payload[0].payload.name}</div>
                  <div className="mt-0.5 text-ink-muted">{xd?.label}: {payload[0].payload.x.toFixed(1)}%</div>
                  <div className="text-ink-muted">{yd?.label}: {payload[0].payload.y.toFixed(1)}%</div>
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

// Aggregate kabupaten rows up to province by the 2-digit code prefix (province
// domain_id = <cc>00). Sums the grand total and every sector; re-sorts by total.
function aggregateRows(rows: RegionRow[], provNames: Map<string, string>): RegionRow[] {
  const g = new Map<string, RegionRow>();
  for (const r of rows) {
    const cc = r.domain_id.slice(0, 2);
    const cur = g.get(cc) ?? { domain_id: `${cc}00`, name: provNames.get(cc) ?? cc, total: 0, byId: {} };
    cur.total += r.total;
    for (const [k, v] of Object.entries(r.byId)) cur.byId[k] = (cur.byId[k] ?? 0) + v;
    g.set(cc, cur);
  }
  return [...g.values()].sort((a, b) => b.total - a.total);
}

// Aggregate the annual trend to province (sum per year), re-ranking provinces.
function aggregateTrend(trend: Trend): Trend {
  const byProv = new Map<string, Map<number, number>>();
  trend.byRegion.forEach((arr, dom) => {
    const cc = dom.slice(0, 2);
    const ym = byProv.get(cc) ?? new Map<number, number>();
    for (const { year, value } of arr) ym.set(year, (ym.get(year) ?? 0) + value);
    byProv.set(cc, ym);
  });
  const byRegion = new Map<string, { year: number; value: number }[]>();
  byProv.forEach((ym, cc) =>
    byRegion.set(`${cc}00`, [...ym.entries()].map(([year, value]) => ({ year, value })).sort((a, b) => a.year - b.year))
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
  trendSeries,
  trendRanks,
  trendLabel,
  trendUnit,
}: {
  row: RegionRow;
  sectors: Sector[];
  groups?: { label: string; color: string; ids: string[] }[];
  trendSeries?: { year: number; value: number }[] | null;
  trendRanks?: Record<number, number> | null;
  trendLabel?: string;
  trendUnit?: string;
}) {
  const parts = sectors
    .map((s) => ({ ...s, value: row.byId[s.id] ?? 0, share: row.total ? ((row.byId[s.id] ?? 0) / row.total) * 100 : 0 }))
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
            const share = row.total ? ((row.byId[s.id] ?? 0) / row.total) * 100 : 0;
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

      {trendSeries && trendSeries.length > 1 && (
        <TrendPanel series={trendSeries} ranks={trendRanks ?? {}} label={trendLabel} unit={trendUnit} />
      )}
    </div>
  );
}

function GroupPanel({ row, groups }: { row: RegionRow; groups: { label: string; color: string; ids: string[] }[] }) {
  const g = groups.map((grp) => {
    const value = grp.ids.reduce((a, id) => a + (row.byId[id] ?? 0), 0);
    return { ...grp, value, share: row.total ? (value / row.total) * 100 : 0 };
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
  const first = series[0];
  const last = series[series.length - 1];
  const growth = first.value ? (last.value / first.value - 1) * 100 : 0;
  const rankNow = ranks[last.year];
  const rankThen = ranks[first.year];
  const rankDelta = rankThen != null && rankNow != null ? rankThen - rankNow : null; // + = moved up
  const chartRows = series.map((s) => ({ year: s.year, pdrb: s.value }));
  const deltaText =
    rankDelta == null ? "–" : rankDelta === 0 ? "tetap" : rankDelta > 0 ? `naik ${rankDelta}` : `turun ${-rankDelta}`;

  return (
    <Panel>
      <div className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-muted">
        {label ?? "PDRB tahunan"} · {first.year}–{last.year}
      </div>
      <div className="mb-3 grid grid-cols-3 gap-3">
        <Stat label={`Pertumbuhan ${first.year}→${last.year}`} value={`${growth >= 0 ? "+" : ""}${growth.toLocaleString("id-ID", { maximumFractionDigits: 0 })}%`} sub="nominal (harga berlaku)" />
        <Stat label={`Peringkat ${last.year}`} value={rankNow != null ? `#${rankNow}` : "–"} sub="nasional" />
        <Stat label={`Peringkat sejak ${first.year}`} value={deltaText} sub={rankThen != null ? `dari #${rankThen}` : undefined} />
      </div>
      <SeriesChart rows={chartRows} entities={[{ key: "pdrb", label: label ?? "PDRB" }]} unit={unit} />
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
