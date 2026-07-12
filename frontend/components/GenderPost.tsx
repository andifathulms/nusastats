"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid, Cell, ReferenceLine, Scatter, ScatterChart, Tooltip as RTooltip, XAxis, YAxis, ZAxis, ResponsiveContainer,
} from "recharts";
import { api, bpsRegionLabel, CHART, dukcapilApi, groupColor, type RegencyCrosswalk } from "@/lib/api";
import { type GenderConfig, type GenderMetric } from "@/lib/posts";
import { Panel } from "@/components/ui";
import { ChoroplethMap, type MapValue } from "@/components/ChoroplethMap";
import { Stat, PageBtn, PillToggle, pearson } from "@/components/sorotan-ui";

const PAGE = 10;
const MALE_T = "211", FEMALE_T = "212";
const MALE = "#1E4585", FEMALE = "#C74B9E"; // blue vs magenta
type Level = "province" | "regency";
type Pair = { male: number; female: number; gap: number }; // gap = female − male
type Row = { domain_id: string; name: string; provCode: string; provName: string; by: Record<string, Pair> };

const isMoney = (m: GenderMetric) => m.unit.includes("Rupiah");
function fmt(m: GenderMetric, v: number): string {
  if (isMoney(m)) return `Rp ${(v / 1000).toLocaleString("id-ID", { maximumFractionDigits: 1 })} jt`;
  return `${v.toLocaleString("id-ID", { minimumFractionDigits: m.decimals, maximumFractionDigits: m.decimals })}${m.unit === "Tahun" ? " th" : ""}`;
}
const fmtGap = (m: GenderMetric, g: number) => `${g >= 0 ? "+" : "−"}${fmt(m, Math.abs(g))}`;

export function GenderPost({ config }: { config: GenderConfig }) {
  const metricByKey = useMemo(() => Object.fromEntries(config.metrics.map((m) => [m.key, m])) as Record<string, GenderMetric>, [config.metrics]);
  const [level, setLevel] = useState<Level>("regency");
  const [rows, setRows] = useState<Row[]>([]);
  const [national, setNational] = useState<Record<string, Pair>>({});
  const [xwalk, setXwalk] = useState<Map<string, RegencyCrosswalk>>(new Map());
  const [metric, setMetric] = useState(config.primaryKey);
  const [sortMode, setSortMode] = useState<"gap" | "female" | "male">("gap");
  const [sel, setSel] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);

  // National L/P per metric (headline) + crosswalk, once.
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      ...config.metrics.map((m) =>
        Promise.all([
          api.series(m.variableId, { admin_level: "national", turvar_id: MALE_T }),
          api.series(m.variableId, { admin_level: "national", turvar_id: FEMALE_T }),
        ]).then(([l, p]) => ({ key: m.key, male: l.results.at(-1)?.value, female: p.results.at(-1)?.value }))
      ),
      dukcapilApi.regencyCrosswalk().then((cw) => cw),
    ]).then((res) => {
      if (cancelled) return;
      const cw = res.pop() as Awaited<ReturnType<typeof dukcapilApi.regencyCrosswalk>>;
      setXwalk(new Map(cw.results.map((x) => [x.bps_domain_id, x])));
      const nat: Record<string, Pair> = {};
      for (const r of res as { key: string; male?: number; female?: number }[])
        if (r.male != null && r.female != null) nat[r.key] = { male: r.male, female: r.female, gap: r.female - r.male };
      setNational(nat);
    });
    return () => { cancelled = true; };
  }, [config.metrics]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all(config.metrics.map((m) =>
      Promise.all([
        api.ranking(m.variableId, { admin_level: level, year: String(config.latestYear), turvar_id: MALE_T }),
        api.ranking(m.variableId, { admin_level: level, year: String(config.latestYear), turvar_id: FEMALE_T }),
      ]).then(([male, female]) => ({ key: m.key, male, female }))
    )).then((results) => {
      if (cancelled) return;
      const by = new Map<string, Row>();
      const ensure = (domain_id: string, name: string) =>
        by.get(domain_id) ?? (() => {
          const isProv = level === "province";
          const provCode = isProv ? domain_id.slice(0, 2) : xwalk.get(domain_id)?.prov_code ?? domain_id.slice(0, 2);
          const provName = isProv ? name : xwalk.get(domain_id)?.prov_name ?? provCode;
          const r: Row = { domain_id, name: isProv ? name : bpsRegionLabel(name, domain_id), provCode, provName, by: {} };
          by.set(domain_id, r);
          return r;
        })();
      for (const { key, male, female } of results) {
        const fem = new Map(female.results.map((d) => [d.domain_id, d.value]));
        for (const d of male.results) {
          const f = fem.get(d.domain_id);
          if (f == null) continue;
          ensure(d.domain_id, d.domain_name).by[key] = { male: d.value, female: f, gap: f - d.value };
        }
      }
      const list = [...by.values()];
      setRows(list);
      setSel((cur) => (cur && by.has(cur) ? cur : list[0]?.domain_id ?? null));
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [level, config.metrics, config.latestYear, xwalk]);

  const m = metricByKey[metric];
  const keyval = (r: Row) => { const p = r.by[metric]; if (!p) return -Infinity; return sortMode === "gap" ? p.gap : sortMode === "female" ? p.female : p.male; };
  const sorted = useMemo(() => [...rows].filter((r) => r.by[metric]).sort((a, b) => keyval(b) - keyval(a)), [rows, metric, sortMode]);
  const filtered = useMemo(() => (q ? sorted.filter((r) => r.name.toLowerCase().includes(q.toLowerCase())) : sorted), [sorted, q]);
  const pageRows = filtered.slice(page * PAGE, page * PAGE + PAGE);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const maxAbsGap = useMemo(() => Math.max(0.001, ...rows.map((r) => Math.abs(r.by[metric]?.gap ?? 0))), [rows, metric]);
  const selected = rows.find((r) => r.domain_id === sel) ?? rows[0];

  const nFemaleAhead = useMemo(() => rows.filter((r) => (r.by[metric]?.gap ?? 0) > 0).length, [rows, metric]);

  if (loading && !rows.length) return <div className="flex h-64 items-center justify-center text-sm text-ink-muted">Memuat…</div>;

  return (
    <div className="space-y-4">
      {/* National parity headline */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {config.metrics.map((mm) => {
          const p = national[mm.key];
          return (
            <Panel key={mm.key}>
              <div className="truncate text-xs uppercase tracking-wide text-ink-muted" title={mm.label}>{mm.short} · nasional</div>
              {p ? (
                <>
                  <div className="mt-1 flex items-baseline gap-2 text-sm">
                    <span className="tabular-nums" style={{ color: MALE }}>♂ {fmt(mm, p.male)}</span>
                    <span className="tabular-nums" style={{ color: FEMALE }}>♀ {fmt(mm, p.female)}</span>
                  </div>
                  <div className="mt-0.5 text-xs" style={{ color: p.gap >= 0 ? FEMALE : MALE }}>
                    {p.gap >= 0 ? "unggul perempuan" : "unggul laki-laki"} {fmtGap(mm, p.gap)}
                  </div>
                </>
              ) : <div className="mt-1 text-sm text-ink-muted">–</div>}
            </Panel>
          );
        })}
      </div>

      {/* Metric chips */}
      <div className="rounded-xl border border-ink-border bg-ink-panel px-4 py-3">
        <div className="flex flex-wrap gap-2">
          {config.metrics.map((mm) => (
            <button key={mm.key} onClick={() => { setMetric(mm.key); setPage(0); }}
              className={`inline-flex items-center rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${metric === mm.key ? "border-transparent bg-brand-gradient text-white" : "border-ink-border text-ink-muted hover:text-ink-text"}`}>
              {mm.short}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs leading-relaxed text-ink-muted">{m.desc}</p>
      </div>

      {/* Ranking with diverging gap bars */}
      <Panel>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm font-semibold text-ink-text">
            Selisih gender · {m.label}
            <span className="ml-2 text-xs font-normal text-ink-muted">{nFemaleAhead}/{sorted.length} {level === "province" ? "provinsi" : "kab/kota"} unggul perempuan</span>
          </div>
          <div className="flex items-center gap-2">
            <PillToggle opts={[["gap", "Selisih"], ["female", "Perempuan"], ["male", "Laki-laki"]]} value={sortMode} onChange={(v) => { setSortMode(v as typeof sortMode); setPage(0); }} />
            <PillToggle opts={[["regency", "Kab/Kota"], ["province", "Provinsi"]]} value={level} onChange={(lv) => { setLevel(lv as Level); setPage(0); }} />
            <input value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} placeholder="Cari…"
              className="w-32 rounded-lg border border-ink-border bg-ink-panel2 px-2.5 py-1.5 text-sm text-ink-text outline-none focus:border-ink-accent/60" />
          </div>
        </div>
        <div className="mb-2 flex items-center justify-center gap-6 text-xs text-ink-muted">
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: MALE }} />Unggul laki-laki</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: FEMALE }} />Unggul perempuan</span>
        </div>
        <div className="space-y-1">
          {pageRows.map((r) => {
            const p = r.by[metric]!;
            const rank = filtered.indexOf(r) + 1;
            const on = r.domain_id === selected?.domain_id;
            const w = (Math.abs(p.gap) / maxAbsGap) * 50; // half-track max
            return (
              <button key={r.domain_id} onClick={() => setSel(r.domain_id)}
                className={`flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors ${on ? "bg-ink-panel2 ring-1 ring-ink-accent/50" : "hover:bg-ink-panel2/60"}`}>
                <span className="w-6 shrink-0 text-right text-xs tabular-nums text-ink-muted">{rank}</span>
                <span className="w-36 shrink-0 truncate text-sm text-ink-text" title={r.name}>{r.name}</span>
                {/* Diverging bar centered at 0 */}
                <span className="relative h-4 flex-1">
                  <span className="absolute inset-y-0 left-1/2 w-px bg-ink-border" />
                  <span className="absolute inset-y-0.5 rounded"
                    style={p.gap >= 0
                      ? { left: "50%", width: `${w}%`, background: FEMALE }
                      : { right: "50%", width: `${w}%`, background: MALE }} />
                </span>
                <span className="w-16 shrink-0 text-right text-xs tabular-nums" style={{ color: p.gap >= 0 ? FEMALE : MALE }} title="selisih (P − L)">{fmtGap(m, p.gap)}</span>
                <span className="hidden w-32 shrink-0 text-right text-xs tabular-nums text-ink-muted sm:block">♂{fmt(m, p.male)} · ♀{fmt(m, p.female)}</span>
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

      {selected && <Detail row={selected} metrics={config.metrics} />}
      <ParityScatter rows={rows} metrics={config.metrics} level={level} />
      <MapPanel rows={rows} metrics={config.metrics} metricKey={metric} level={level} xwalk={xwalk} />
    </div>
  );
}

function Detail({ row, metrics }: { row: Row; metrics: GenderMetric[] }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 pt-2">
        <div className="h-px flex-1 bg-ink-border" />
        <div className="text-xs font-medium uppercase tracking-wide text-ink-muted">Rincian · {row.name}</div>
        <div className="h-px flex-1 bg-ink-border" />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {metrics.map((m) => {
          const p = row.by[m.key];
          if (!p) return <Panel key={m.key}><div className="text-xs uppercase tracking-wide text-ink-muted">{m.short}</div><div className="mt-1 text-sm text-ink-muted">–</div></Panel>;
          const max = Math.max(p.male, p.female) || 1;
          return (
            <Panel key={m.key}>
              <div className="truncate text-xs uppercase tracking-wide text-ink-muted" title={m.label}>{m.short}</div>
              <div className="mt-2 space-y-1.5">
                {[["♂ Laki-laki", p.male, MALE], ["♀ Perempuan", p.female, FEMALE]].map(([lbl, v, c]) => (
                  <div key={lbl as string} className="flex items-center gap-2">
                    <span className="w-20 shrink-0 text-xs" style={{ color: c as string }}>{lbl}</span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-ink-panel2">
                      <div className="h-full rounded-full" style={{ width: `${((v as number) / max) * 100}%`, background: c as string }} />
                    </div>
                    <span className="w-20 shrink-0 text-right text-xs tabular-nums text-ink-text">{fmt(m, v as number)}</span>
                  </div>
                ))}
              </div>
              <div className="mt-2 text-xs" style={{ color: p.gap >= 0 ? FEMALE : MALE }}>
                Selisih {fmtGap(m, p.gap)} {p.gap >= 0 ? "(unggul perempuan)" : "(unggul laki-laki)"}
              </div>
            </Panel>
          );
        })}
      </div>
    </div>
  );
}

// Signature viz: male (x) vs female (y) with a 45° parity line. Points above the
// line = female advantage; below = male advantage.
function ParityScatter({ rows, metrics, level }: { rows: Row[]; metrics: GenderMetric[]; level: Level }) {
  const [key, setKey] = useState(metrics[0].key);
  const [selProvs, setSelProvs] = useState<Set<string>>(new Set());
  const m = metrics.find((x) => x.key === key)!;
  const div = isMoney(m) ? 1000 : 1; // money → juta for axis readability

  const provs = useMemo(() => {
    const s = new Map<string, string>();
    rows.forEach((r) => s.set(r.provCode, r.provName));
    return [...s.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows]);

  const points = useMemo(() => rows.filter((r) => r.by[key] && (!selProvs.size || selProvs.has(r.provCode)))
    .map((r) => ({ x: r.by[key]!.male / div, y: r.by[key]!.female / div, name: r.name, fill: groupColor(r.provCode) })), [rows, key, selProvs, div]);
  const r = useMemo(() => pearson(points.map((p) => p.x), points.map((p) => p.y)), [points]);
  const lo = points.length ? Math.min(...points.flatMap((p) => [p.x, p.y])) : 0;
  const hi = points.length ? Math.max(...points.flatMap((p) => [p.x, p.y])) : 1;
  const unit = isMoney(m) ? "jt" : m.unit === "Tahun" ? "th" : "";
  const fmtAx = (v: number) => `${v.toLocaleString("id-ID", { maximumFractionDigits: 1 })}${unit ? ` ${unit}` : ""}`;

  return (
    <Panel>
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-ink-text">Laki-laki vs Perempuan</span>
        <select value={key} onChange={(e) => setKey(e.target.value)} className="ml-auto rounded-lg border border-ink-border bg-ink-panel2 px-2 py-1.5 text-sm text-ink-text outline-none focus:border-ink-accent/60">
          {metrics.map((mm) => <option key={mm.key} value={mm.key}>{mm.short}</option>)}
        </select>
      </div>
      <div className="mb-2 text-xs text-ink-muted">
        Korelasi (r) = <span className={`font-semibold ${Math.abs(r) >= 0.5 ? "text-ink-text" : "text-ink-muted"}`}>{isNaN(r) ? "–" : r.toFixed(2)}</span>{" "}
        · {points.length} {level === "province" ? "provinsi" : "kab/kota"} · titik di <span style={{ color: FEMALE }}>atas garis</span> = unggul perempuan, di <span style={{ color: MALE }}>bawah</span> = unggul laki-laki.
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
      <ResponsiveContainer width="100%" aspect={1} className="mx-auto max-w-[560px]">
        <ScatterChart margin={{ top: 8, right: 16, bottom: 24, left: 8 }}>
          <CartesianGrid stroke={CHART.grid} />
          <XAxis type="number" dataKey="x" name={`${m.short} ♂`} domain={[lo, hi]} tick={{ fill: CHART.axisTick, fontSize: 12 }} axisLine={{ stroke: CHART.axisLine }} tickLine={false}
            label={{ value: `Laki-laki${unit ? ` (${unit})` : ""}`, position: "insideBottom", offset: -12, fill: CHART.axisTick, fontSize: 11 }} />
          <YAxis type="number" dataKey="y" name={`${m.short} ♀`} domain={[lo, hi]} tick={{ fill: CHART.axisTick, fontSize: 12 }} axisLine={{ stroke: CHART.axisLine }} tickLine={false} width={48}
            label={{ value: `Perempuan${unit ? ` (${unit})` : ""}`, angle: -90, position: "insideLeft", fill: CHART.axisTick, fontSize: 11 }} />
          <ZAxis range={[30, 30]} />
          <ReferenceLine segment={[{ x: lo, y: lo }, { x: hi, y: hi }]} stroke={CHART.axisLine} strokeDasharray="4 4" />
          <RTooltip cursor={{ strokeDasharray: "3 3" }} content={({ payload }) => payload && payload.length ? (
            <div className="rounded-lg border border-ink-border bg-ink-panel px-3 py-2 text-xs shadow-panel">
              <div className="font-medium text-ink-text">{payload[0].payload.name}</div>
              <div className="mt-0.5" style={{ color: MALE }}>♂ {fmtAx(payload[0].payload.x)}</div>
              <div style={{ color: FEMALE }}>♀ {fmtAx(payload[0].payload.y)}</div>
            </div>
          ) : null} />
          <Scatter data={points} fillOpacity={0.72}>{points.map((p, i) => <Cell key={i} fill={p.fill} />)}</Scatter>
        </ScatterChart>
      </ResponsiveContainer>
    </Panel>
  );
}

function MapPanel({ rows, metrics, metricKey, level, xwalk }: { rows: Row[]; metrics: GenderMetric[]; metricKey: string; level: Level; xwalk: Map<string, RegencyCrosswalk> }) {
  const [key, setKey] = useState(metricKey);
  useEffect(() => setKey(metricKey), [metricKey]);
  const m = metrics.find((x) => x.key === key)!;
  const { values, geojsonUrls } = useMemo(() => {
    const map = new Map<string, MapValue>();
    const isProv = level === "province";
    for (const r of rows) {
      const p = r.by[key];
      if (!p) continue;
      const gk = isProv ? r.domain_id.slice(0, 2) : xwalk.get(r.domain_id)?.kemendagri_code;
      if (!gk) continue;
      const g = isMoney(m) ? p.gap / 1000 : p.gap;
      map.set(gk, { value: Math.round(g * 100) / 100, name: r.name });
    }
    return { values: map, geojsonUrls: [isProv ? "/dukcapil-provinces.geojson" : "/dukcapil-regencies.geojson"] };
  }, [rows, key, level, xwalk, m]);
  const vals = [...values.values()].map((v) => v.value);
  const min = vals.length ? Math.min(...vals) : 0;
  const max = vals.length ? Math.max(...vals) : 1;

  return (
    <Panel>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-ink-text">Peta selisih (P − L) · {level === "province" ? "provinsi" : "kabupaten/kota"}</span>
        <select value={key} onChange={(e) => setKey(e.target.value)} className="ml-auto rounded-lg border border-ink-border bg-ink-panel2 px-2 py-1.5 text-sm text-ink-text outline-none focus:border-ink-accent/60">
          {metrics.map((mm) => <option key={mm.key} value={mm.key}>{mm.short}</option>)}
        </select>
      </div>
      <ChoroplethMap key={level} values={values} min={min} max={max} unit={isMoney(m) ? "jt" : m.unit === "Tahun" ? "th" : ""} geojsonUrls={geojsonUrls} />
    </Panel>
  );
}
