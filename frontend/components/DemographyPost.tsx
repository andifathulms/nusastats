"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid, Cell, Scatter, ScatterChart, Tooltip as RTooltip, XAxis, YAxis, ZAxis, ResponsiveContainer,
} from "recharts";
import { CHART, dukcapilApi, groupColor, titleCase, type DukcapilRankRow } from "@/lib/api";
import { type DemographyConfig, type DemographyMetric } from "@/lib/posts";
import { Panel } from "@/components/ui";
import { ChoroplethMap, type MapValue } from "@/components/ChoroplethMap";
import { Stat, PageBtn, PillToggle, pearson } from "@/components/sorotan-ui";

const PAGE = 10;
type Level = "province" | "regency";
type Cell = { value: number; rank: number };
type Row = { code: string; name: string; provCode: string; provName: string; by: Record<string, Cell> };

// The 16 five-year age bands (Dukcapil fields), grouped by life stage. Children
// 0–14, productive 15–64, elderly 65+ — the demographic-dividend arithmetic.
const AGE_BANDS: { field: string; label: string; stage: "children" | "productive" | "elderly" }[] = [
  { field: "u0", label: "0–4", stage: "children" }, { field: "u5", label: "5–9", stage: "children" }, { field: "u10", label: "10–14", stage: "children" },
  { field: "u15", label: "15–19", stage: "productive" }, { field: "u20", label: "20–24", stage: "productive" }, { field: "u25", label: "25–29", stage: "productive" },
  { field: "u30", label: "30–34", stage: "productive" }, { field: "u35", label: "35–39", stage: "productive" }, { field: "u40", label: "40–44", stage: "productive" },
  { field: "u45", label: "45–49", stage: "productive" }, { field: "u50", label: "50–54", stage: "productive" }, { field: "u55", label: "55–59", stage: "productive" },
  { field: "u60", label: "60–64", stage: "productive" }, { field: "u65", label: "65–69", stage: "elderly" }, { field: "u70", label: "70–74", stage: "elderly" },
  { field: "u75", label: "75+", stage: "elderly" },
];
const STAGE_COLOR = { children: "#E0803A", productive: "#1E4585", elderly: "#7C3AED" };
const STAGE_LABEL = { children: "Anak (0–14)", productive: "Produktif (15–64)", elderly: "Lansia (65+)" };

const fmtVal = (m: DemographyMetric, v: number | undefined) =>
  v == null ? "–" : `${v.toLocaleString("id-ID", { minimumFractionDigits: m.decimals, maximumFractionDigits: m.decimals })}${m.unit === "%" ? "%" : m.unit ? ` ${m.unit}` : ""}`;
const provOf = (row: DukcapilRankRow, level: Level) =>
  level === "province" ? { code: row.domain_id, name: titleCase(row.domain_name) } : { code: row.domain_id.slice(0, 2), name: row.nama_prop ? titleCase(row.nama_prop) : row.domain_id.slice(0, 2) };

export function DemographyPost({ config }: { config: DemographyConfig }) {
  const metricByField = useMemo(() => Object.fromEntries(config.metrics.map((m) => [m.field, m])) as Record<string, DemographyMetric>, [config.metrics]);
  const [level, setLevel] = useState<Level>("province");
  const [rows, setRows] = useState<Row[]>([]);
  const [field, setField] = useState(config.primaryField);
  const [sel, setSel] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all(config.metrics.map((m) => dukcapilApi.rank({ level, indicator: m.field, limit: "1000" }).then((r) => ({ field: m.field, r }))))
      .then((results) => {
        if (cancelled) return;
        const by = new Map<string, Row>();
        for (const { field: f, r } of results) {
          for (const d of r.results) {
            const cur = by.get(d.domain_id) ?? (() => {
              const p = provOf(d, level);
              return { code: d.domain_id, name: titleCase(d.domain_name), provCode: p.code, provName: p.name, by: {} as Record<string, Cell> };
            })();
            cur.by[f] = { value: d.value, rank: d.rank };
            by.set(d.domain_id, cur);
          }
        }
        const list = [...by.values()];
        setRows(list);
        setSel((cur) => (cur && by.has(cur) ? cur : list[0]?.code ?? null));
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [level, config.metrics]);

  const m = metricByField[field];
  const sorted = useMemo(() => [...rows].sort((a, b) => (b.by[field]?.value ?? -Infinity) - (a.by[field]?.value ?? -Infinity)), [rows, field]);
  const filtered = useMemo(() => (q ? sorted.filter((r) => r.name.toLowerCase().includes(q.toLowerCase())) : sorted), [sorted, q]);
  const pageRows = filtered.slice(page * PAGE, page * PAGE + PAGE);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const vals = sorted.map((r) => r.by[field]?.value).filter((v): v is number => v != null);
  const maxVal = vals.length ? Math.max(...vals) : 1;
  const minVal = vals.length ? Math.min(...vals) : 0;
  const floor = Math.max(0, minVal - (maxVal - minVal) * 0.15);
  const span = maxVal - floor || 1;
  const selected = rows.find((r) => r.code === sel) ?? rows[0];

  const youngest = useMemo(() => [...rows].filter((r) => r.by.median_age).sort((a, b) => a.by.median_age.value - b.by.median_age.value)[0], [rows]);
  const oldest = useMemo(() => [...rows].filter((r) => r.by.median_age).sort((a, b) => b.by.median_age.value - a.by.median_age.value)[0], [rows]);

  if (loading && !rows.length) return <div className="flex h-64 items-center justify-center text-sm text-ink-muted">Memuat…</div>;

  return (
    <div className="space-y-4">
      {config.ageProfile !== false ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Stat label="Termuda (usia median)" value={youngest ? youngest.name : "–"} sub={youngest ? `${youngest.by.median_age.value.toFixed(1)} th` : undefined} />
          <Stat label="Tertua (usia median)" value={oldest ? oldest.name : "–"} sub={oldest ? `${oldest.by.median_age.value.toFixed(1)} th` : undefined} />
          <Stat label={`Beban tanggungan terendah`} value={lowest(rows, "dependency_ratio")?.name ?? "–"} sub={lowest(rows, "dependency_ratio") ? `rasio ${lowest(rows, "dependency_ratio")!.by.dependency_ratio.value.toFixed(1)}` : undefined} />
        </div>
      ) : (
        (() => {
          const pm = metricByField[config.primaryField];
          const bys = [...rows].filter((r) => r.by[config.primaryField]).sort((a, b) => b.by[config.primaryField].value - a.by[config.primaryField].value);
          const med = bys.length ? bys[Math.floor(bys.length / 2)].by[config.primaryField].value : 0;
          return (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Stat label={`${pm.short} tertinggi`} value={bys[0]?.name ?? "–"} sub={bys[0] ? fmtVal(pm, bys[0].by[config.primaryField].value) : undefined} />
              <Stat label={`${pm.short} terendah`} value={bys[bys.length - 1]?.name ?? "–"} sub={bys.length ? fmtVal(pm, bys[bys.length - 1].by[config.primaryField].value) : undefined} />
              <Stat label={`${pm.short} median`} value={fmtVal(pm, med)} sub={`${level === "province" ? "provinsi" : "kab/kota"}`} />
            </div>
          );
        })()
      )}

      {/* Metric chips */}
      <div className="rounded-xl border border-ink-border bg-ink-panel px-4 py-3">
        <div className="flex flex-wrap gap-2">
          {config.metrics.map((mm) => (
            <button key={mm.field} onClick={() => { setField(mm.field); setPage(0); }}
              className={`inline-flex items-center rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${field === mm.field ? "border-transparent bg-brand-gradient text-white" : "border-ink-border text-ink-muted hover:text-ink-text"}`}>
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
            <PillToggle opts={[["province", "Provinsi"], ["regency", "Kab/Kota"]]} value={level} onChange={(lv) => { setLevel(lv as Level); setPage(0); }} />
            <input value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} placeholder="Cari…"
              className="w-36 rounded-lg border border-ink-border bg-ink-panel2 px-2.5 py-1.5 text-sm text-ink-text outline-none focus:border-ink-accent/60" />
          </div>
        </div>
        <div className="space-y-1">
          {pageRows.map((r) => {
            const rank = filtered.indexOf(r) + 1;
            const v = r.by[field]?.value;
            const on = r.code === selected?.code;
            return (
              <button key={r.code} onClick={() => setSel(r.code)}
                className={`flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors ${on ? "bg-ink-panel2 ring-1 ring-ink-accent/50" : "hover:bg-ink-panel2/60"}`}>
                <span className="w-6 shrink-0 text-right text-xs tabular-nums text-ink-muted">{rank}</span>
                <span className="w-40 shrink-0 truncate text-sm text-ink-text" title={r.name}>{r.name}</span>
                <span className="h-3 flex-1 overflow-hidden rounded-full bg-ink-panel2 ring-1 ring-ink-border/60">
                  <span className="block h-full rounded-full" style={{ width: `${v != null ? Math.max(2, ((v - floor) / span) * 100) : 0}%`, background: CHART.accent }} />
                </span>
                <span className="w-20 shrink-0 text-right text-sm tabular-nums text-ink-text">{fmtVal(m, v)}</span>
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

      {selected && <Detail row={selected} metrics={config.metrics} level={level} totalRegions={rows.length} ageProfile={config.ageProfile !== false} />}
      <ScatterPanel rows={rows} metrics={config.metrics} xField={config.scatterX} yField={config.scatterY} level={level} />
      <MapPanel rows={rows} metrics={config.metrics} field={field} level={level} />
    </div>
  );
}

function lowest(rows: Row[], f: string) {
  return [...rows].filter((r) => r.by[f]).sort((a, b) => a.by[f].value - b.by[f].value)[0];
}

function Detail({ row, metrics, level, totalRegions, ageProfile }: { row: Row; metrics: DemographyMetric[]; level: Level; totalRegions: number; ageProfile: boolean }) {
  const [bands, setBands] = useState<Record<string, number> | null>(null);
  useEffect(() => {
    if (!ageProfile) return;
    let cancelled = false;
    setBands(null);
    dukcapilApi.regionDetail(row.code).then((d) => {
      if (cancelled) return;
      const m: Record<string, number> = {};
      for (const g of d.groups) for (const i of g.indicators) if (i.field.startsWith("u")) m[i.field] = i.value;
      setBands(m);
    });
    return () => { cancelled = true; };
  }, [row.code, ageProfile]);

  const total = bands ? AGE_BANDS.reduce((a, b) => a + (bands[b.field] ?? 0), 0) : 0;
  const stageShare = (stage: string) => (bands && total ? (AGE_BANDS.filter((b) => b.stage === stage).reduce((a, b) => a + (bands[b.field] ?? 0), 0) / total) * 100 : 0);
  const maxBand = bands ? Math.max(...AGE_BANDS.map((b) => bands[b.field] ?? 0)) : 1;
  const pct = (c?: Cell) => (c && totalRegions > 1 ? ((totalRegions - c.rank) / (totalRegions - 1)) * 100 : null);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 pt-2">
        <div className="h-px flex-1 bg-ink-border" />
        <div className="text-xs font-medium uppercase tracking-wide text-ink-muted">Rincian · {row.name}</div>
        <div className="h-px flex-1 bg-ink-border" />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {metrics.slice(0, ageProfile ? 4 : 8).map((mm) => {
          const c = row.by[mm.field];
          const p = pct(c);
          return (
            <Panel key={mm.field}>
              <div className="truncate text-xs uppercase tracking-wide text-ink-muted" title={mm.short}>{mm.short}</div>
              <div className="mt-1 text-lg font-semibold text-ink-text">{fmtVal(mm, c?.value)}</div>
              <div className="mt-0.5 text-xs text-ink-muted">{c ? `#${c.rank} dari ${totalRegions}${p != null ? ` · p${p.toFixed(0)}` : ""}` : "–"}</div>
            </Panel>
          );
        })}
      </div>

      {/* Age-structure profile (only for the age-focused post) */}
      {ageProfile && (
      <Panel>
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-ink-muted">Struktur usia · {row.name}</span>
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {(["children", "productive", "elderly"] as const).map((s) => (
              <span key={s} className="inline-flex items-center gap-1.5 text-xs text-ink-muted">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ background: STAGE_COLOR[s] }} />
                {STAGE_LABEL[s]} <span className="tabular-nums text-ink-text">{stageShare(s).toFixed(1)}%</span>
              </span>
            ))}
          </div>
        </div>
        {!bands ? (
          <div className="flex h-40 items-center justify-center text-sm text-ink-muted">Memuat…</div>
        ) : (
          <div className="space-y-1 pt-1">
            {AGE_BANDS.map((b) => {
              const v = bands[b.field] ?? 0;
              const share = total ? (v / total) * 100 : 0;
              return (
                <div key={b.field} className="flex items-center gap-2">
                  <span className="w-12 shrink-0 text-right text-xs tabular-nums text-ink-muted">{b.label}</span>
                  <div className="h-3 flex-1 overflow-hidden rounded bg-ink-panel2">
                    <div className="h-full rounded" style={{ width: `${(v / maxBand) * 100}%`, background: STAGE_COLOR[b.stage] }} title={`${b.label}: ${share.toFixed(1)}%`} />
                  </div>
                  <span className="w-12 shrink-0 text-right text-xs tabular-nums text-ink-text">{share.toFixed(1)}%</span>
                </div>
              );
            })}
          </div>
        )}
      </Panel>
      )}
    </div>
  );
}

function ScatterPanel({ rows, metrics, xField, yField, level }: { rows: Row[]; metrics: DemographyMetric[]; xField: string; yField: string; level: Level }) {
  const [xf, setXf] = useState(xField);
  const [yf, setYf] = useState(yField);
  const [selProvs, setSelProvs] = useState<Set<string>>(new Set());
  const byField = Object.fromEntries(metrics.map((m) => [m.field, m])) as Record<string, DemographyMetric>;
  const xm = byField[xf], ym = byField[yf];

  const provs = useMemo(() => {
    const set = new Map<string, string>();
    rows.forEach((r) => set.set(r.provCode, r.provName));
    return [...set.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows]);

  const points = useMemo(() => rows.filter((r) => r.by[xf] && r.by[yf] && (!selProvs.size || selProvs.has(r.provCode)))
    .map((r) => ({ x: r.by[xf].value, y: r.by[yf].value, name: r.name, fill: groupColor(r.provCode) })), [rows, xf, yf, selProvs]);
  const r = useMemo(() => pearson(points.map((p) => p.x), points.map((p) => p.y)), [points]);

  const Sel = ({ v, on }: { v: string; on: (s: string) => void }) => (
    <select value={v} onChange={(e) => on(e.target.value)} className="rounded-lg border border-ink-border bg-ink-panel2 px-2 py-1.5 text-sm text-ink-text outline-none focus:border-ink-accent/60">
      {metrics.map((mm) => <option key={mm.field} value={mm.field}>{mm.short}</option>)}
    </select>
  );

  return (
    <Panel>
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-ink-text">Hubungan antar-indikator</span>
        <span className="ml-auto flex items-center gap-2 text-xs text-ink-muted"><Sel v={xf} on={setXf} /> vs <Sel v={yf} on={setYf} /></span>
      </div>
      <div className="mb-2 text-xs text-ink-muted">
        Korelasi (r) = <span className={`font-semibold ${Math.abs(r) >= 0.5 ? "text-ink-text" : "text-ink-muted"}`}>{isNaN(r) ? "–" : r.toFixed(2)}</span>{" "}
        · {points.length} {level === "province" ? "provinsi" : "kab/kota"} · warna = provinsi.
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
          <XAxis type="number" dataKey="x" name={xm?.short} tick={{ fill: CHART.axisTick, fontSize: 12 }} axisLine={{ stroke: CHART.axisLine }} tickLine={false}
            label={{ value: xm?.short, position: "insideBottom", offset: -12, fill: CHART.axisTick, fontSize: 11 }} />
          <YAxis type="number" dataKey="y" name={ym?.short} tick={{ fill: CHART.axisTick, fontSize: 12 }} axisLine={{ stroke: CHART.axisLine }} tickLine={false} width={48} />
          <ZAxis range={[34, 34]} />
          <RTooltip cursor={{ strokeDasharray: "3 3" }} content={({ payload }) => payload && payload.length ? (
            <div className="rounded-lg border border-ink-border bg-ink-panel px-3 py-2 text-xs shadow-panel">
              <div className="font-medium text-ink-text">{payload[0].payload.name}</div>
              <div className="mt-0.5 text-ink-muted">{xm?.short}: {fmtVal(xm, payload[0].payload.x)}</div>
              <div className="text-ink-muted">{ym?.short}: {fmtVal(ym, payload[0].payload.y)}</div>
            </div>
          ) : null} />
          <Scatter data={points} fillOpacity={0.72}>{points.map((p, i) => <Cell key={i} fill={p.fill} />)}</Scatter>
        </ScatterChart>
      </ResponsiveContainer>
    </Panel>
  );
}

function MapPanel({ rows, metrics, field, level }: { rows: Row[]; metrics: DemographyMetric[]; field: string; level: Level }) {
  const [f, setF] = useState(field);
  useEffect(() => setF(field), [field]);
  const m = metrics.find((mm) => mm.field === f)!;
  const { values, geojsonUrls } = useMemo(() => {
    const map = new Map<string, MapValue>();
    for (const r of rows) {
      const c = r.by[f];
      if (!c) continue;
      map.set(r.code, { value: Math.round(c.value * 100) / 100, name: r.name });
    }
    return { values: map, geojsonUrls: [level === "province" ? "/dukcapil-provinces.geojson" : "/dukcapil-regencies.geojson"] };
  }, [rows, f, level]);
  const vals = [...values.values()].map((v) => v.value);
  const min = vals.length ? Math.min(...vals) : 0;
  const max = vals.length ? Math.max(...vals) : 1;

  return (
    <Panel>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-ink-text">Peta · {level === "province" ? "provinsi" : "kabupaten/kota"}</span>
        <select value={f} onChange={(e) => setF(e.target.value)} className="ml-auto rounded-lg border border-ink-border bg-ink-panel2 px-2 py-1.5 text-sm text-ink-text outline-none focus:border-ink-accent/60">
          {metrics.map((mm) => <option key={mm.field} value={mm.field}>{mm.short}</option>)}
        </select>
      </div>
      <ChoroplethMap key={level} values={values} min={min} max={max} unit={m.unit === "%" ? "%" : m.unit} geojsonUrls={geojsonUrls} />
    </Panel>
  );
}
