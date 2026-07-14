"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid, Cell, Legend, Line, LineChart, Scatter, ScatterChart, Tooltip as RTooltip, XAxis, YAxis, ZAxis, ResponsiveContainer,
} from "recharts";
import { api, CHART, groupColor, titleCase } from "@/lib/api";
import { type InequalityConfig } from "@/lib/posts";
import { Panel } from "@/components/ui";
import { ChoroplethMap, type MapValue } from "@/components/ChoroplethMap";
import { Stat, PageBtn, PillToggle, pearson } from "@/components/sorotan-ui";

const PAGE = 12;
type Daerah = "total" | "urban" | "rural";
type Row = { domain_id: string; name: string; gini: Record<Daerah, number | undefined>; cmp: Record<string, number> };
const DAERAH_COLOR: Record<Daerah, string> = { total: "#1E4585", urban: "#C0392B", rural: "#15803D" };
const DAERAH_LABEL: Record<Daerah, string> = { total: "Total", urban: "Perkotaan", rural: "Perdesaan" };

export function GiniPost({ config }: { config: InequalityConfig }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [natTrend, setNatTrend] = useState<{ year: number; value: number }[]>([]);
  const [provTrend, setProvTrend] = useState<Map<string, { year: number; value: number }[]>>(new Map());
  const [daerah, setDaerah] = useState<Daerah>("total");
  const [cmpKey, setCmpKey] = useState(config.compare[0]?.key ?? "");
  const [sel, setSel] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const y = String(config.latestYear);
    const T = config.turvars;
    Promise.all([
      api.ranking(config.variableId, { admin_level: "province", year: y, turvar_id: T.total }).then((d) => ({ k: "total", d })),
      api.ranking(config.variableId, { admin_level: "province", year: y, turvar_id: T.urban }).then((d) => ({ k: "urban", d })),
      api.ranking(config.variableId, { admin_level: "province", year: y, turvar_id: T.rural }).then((d) => ({ k: "rural", d })),
      ...config.compare.map((c) => api.ranking(c.variableId, { admin_level: "province", year: y }).then((d) => ({ k: `cmp:${c.key}`, d }))),
      // total-Gini series for the trend (per province + national mean)
      api.series(config.variableId, { admin_level: "province", turvar_id: T.total }).then((d) => ({ k: "series", d })),
    ]).then((res) => {
      if (cancelled) return;
      const by = new Map<string, Row>();
      const ensure = (id: string, name: string) => by.get(id) ?? (() => { const r: Row = { domain_id: id, name: fixName(name), gini: { total: undefined, urban: undefined, rural: undefined }, cmp: {} }; by.set(id, r); return r; })();
      for (const { k, d } of res) {
        if (k === "series") continue;
        for (const x of (d as { results: { domain_id: string; domain_name: string; value: number }[] }).results) {
          const r = ensure(x.domain_id, x.domain_name);
          if (k === "total" || k === "urban" || k === "rural") r.gini[k as Daerah] = x.value;
          else if (k.startsWith("cmp:")) r.cmp[k.slice(4)] = x.value;
        }
      }
      const list = [...by.values()];
      setRows(list);
      setSel((cur) => (cur && by.has(cur) ? cur : list[0]?.domain_id ?? null));

      const series = (res.find((x) => x.k === "series")!.d as { results: { domain_id: string; domain_name: string; year: number | null; value: number }[] }).results;
      const perProv = new Map<string, { year: number; value: number }[]>();
      const natByYear = new Map<number, number[]>();
      const tmp = new Map<string, Map<number, number>>();
      for (const d of series) {
        if (d.year == null) continue;
        (tmp.get(d.domain_id) ?? tmp.set(d.domain_id, new Map()).get(d.domain_id)!).set(d.year, d.value);
        (natByYear.get(d.year) ?? natByYear.set(d.year, []).get(d.year)!).push(d.value);
      }
      tmp.forEach((m, dom) => perProv.set(dom, [...m.entries()].map(([year, value]) => ({ year, value })).sort((a, b) => a.year - b.year)));
      setProvTrend(perProv);
      setNatTrend([...natByYear.entries()].map(([year, vs]) => ({ year, value: vs.reduce((a, v) => a + v, 0) / vs.length })).sort((a, b) => a.year - b.year));
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [config]);

  const sorted = useMemo(() => [...rows].filter((r) => r.gini[daerah] != null).sort((a, b) => (b.gini[daerah] ?? 0) - (a.gini[daerah] ?? 0)), [rows, daerah]);
  const filtered = useMemo(() => (q ? sorted.filter((r) => r.name.toLowerCase().includes(q.toLowerCase())) : sorted), [sorted, q]);
  const pageRows = filtered.slice(page * PAGE, page * PAGE + PAGE);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const maxVal = sorted[0]?.gini[daerah] ?? 0.5;
  const selected = rows.find((r) => r.domain_id === sel) ?? rows[0];
  const natNow = natTrend[natTrend.length - 1]?.value;

  if (loading && !rows.length) return <div className="flex h-64 items-center justify-center text-sm text-ink-muted">Memuat…</div>;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label={`Gini nasional (rata-rata provinsi) ${config.latestYear}`} value={natNow != null ? natNow.toFixed(3) : "–"} sub="0 = merata, 1 = paling timpang" />
        <Stat label="Paling timpang" value={sorted[0]?.name ?? "–"} sub={sorted[0] ? `Gini ${sorted[0].gini[daerah]!.toFixed(3)} (${DAERAH_LABEL[daerah]})` : undefined} />
        <Stat label="Paling merata" value={sorted[sorted.length - 1]?.name ?? "–"} sub={sorted.length ? `Gini ${sorted[sorted.length - 1].gini[daerah]!.toFixed(3)}` : undefined} />
      </div>

      <div className="rounded-xl border border-ink-border bg-ink-panel px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-ink-muted">Wilayah:</span>
          <PillToggle opts={[["total", "Total"], ["urban", "Perkotaan"], ["rural", "Perdesaan"]]} value={daerah} onChange={(v) => { setDaerah(v as Daerah); setPage(0); }} />
        </div>
        <p className="mt-2 text-xs leading-relaxed text-ink-muted">
          Gini Ratio mengukur ketimpangan pengeluaran: 0 = semua orang sama, mendekati 1 = sangat timpang. Ketimpangan berbeda dari kemiskinan — daerah bisa timpang tapi tidak miskin (banyak orang kaya + banyak miskin), atau merata dalam kemiskinan.
        </p>
      </div>

      <Panel>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm font-semibold text-ink-text">Peringkat ketimpangan · {DAERAH_LABEL[daerah]}
            <span className="ml-2 text-xs font-normal text-ink-muted">{filtered.length} provinsi · #1 = paling timpang</span>
          </div>
          <input value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} placeholder="Cari…" className="w-36 rounded-lg border border-ink-border bg-ink-panel2 px-2.5 py-1.5 text-sm text-ink-text outline-none focus:border-ink-accent/60" />
        </div>
        <div className="space-y-1">
          {pageRows.map((r) => {
            const rank = filtered.indexOf(r) + 1;
            const v = r.gini[daerah] ?? 0;
            const on = r.domain_id === selected?.domain_id;
            return (
              <button key={r.domain_id} onClick={() => setSel(r.domain_id)}
                className={`flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors ${on ? "bg-ink-panel2 ring-1 ring-ink-accent/50" : "hover:bg-ink-panel2/60"}`}>
                <span className="w-6 shrink-0 text-right text-xs tabular-nums text-ink-muted">{rank}</span>
                <span className="w-40 shrink-0 truncate text-sm text-ink-text" title={r.name}>{r.name}</span>
                <span className="h-3 flex-1 overflow-hidden rounded-full bg-ink-panel2 ring-1 ring-ink-border/60">
                  <span className="block h-full rounded-full" style={{ width: `${maxVal ? (v / maxVal) * 100 : 0}%`, background: DAERAH_COLOR[daerah] }} />
                </span>
                <span className="w-14 shrink-0 text-right text-sm tabular-nums text-ink-text">{v.toFixed(3)}</span>
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

      {selected && <Detail row={selected} series={provTrend.get(selected.domain_id) ?? null} natTrend={natTrend} config={config} />}

      {/* Gini vs poverty/IPM — inequality ≠ poverty */}
      <ScatterPanel rows={rows} compare={config.compare} cmpKey={cmpKey} setCmpKey={setCmpKey} />
      <MapPanel rows={rows} daerah={daerah} />
    </div>
  );
}

function fixName(n: string) {
  return titleCase(n).replace(/\bDki\b/, "DKI").replace(/\bDi\b/, "DI");
}

function Detail({ row, series, natTrend, config }: { row: Row; series: { year: number; value: number }[] | null; natTrend: { year: number; value: number }[]; config: InequalityConfig }) {
  const merged = useMemo(() => {
    if (!series) return [];
    const nat = new Map(natTrend.map((n) => [n.year, n.value]));
    return series.map((s) => ({ year: s.year, prov: s.value, nat: nat.get(s.year) }));
  }, [series, natTrend]);
  const first = series?.[0], last = series?.[series.length - 1];
  const change = first && last ? last.value - first.value : 0;
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 pt-2">
        <div className="h-px flex-1 bg-ink-border" />
        <div className="text-xs font-medium uppercase tracking-wide text-ink-muted">Rincian · {row.name}</div>
        <div className="h-px flex-1 bg-ink-border" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Gini · Total" value={row.gini.total != null ? row.gini.total.toFixed(3) : "–"} />
        <Stat label="Gini · Perkotaan" value={row.gini.urban != null ? row.gini.urban.toFixed(3) : "–"} sub="biasanya lebih timpang" />
        <Stat label="Gini · Perdesaan" value={row.gini.rural != null ? row.gini.rural.toFixed(3) : "–"} />
        {config.compare.map((c) => (
          <Stat key={c.key} label={c.short} value={row.cmp[c.key] != null ? `${row.cmp[c.key].toFixed(c.decimals)}${c.unit === "%" ? "%" : ""}` : "–"} />
        ))}
      </div>
      {merged.length > 1 && (
        <Panel>
          <div className="mb-2 flex items-center justify-between">
            <div className="text-xs font-medium uppercase tracking-wide text-ink-muted">Gini (total) · {first?.year}–{last?.year}</div>
            <div className="text-xs text-ink-muted">Perubahan: <span className="font-semibold text-ink-text">{change >= 0 ? "+" : ""}{change.toFixed(3)}</span> {change <= 0 ? "(makin merata)" : "(makin timpang)"}</div>
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={merged} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
              <CartesianGrid stroke={CHART.grid} vertical={false} />
              <XAxis dataKey="year" tick={{ fill: CHART.axisTick, fontSize: 12 }} axisLine={{ stroke: CHART.axisLine }} tickLine={false} />
              <YAxis domain={["auto", "auto"]} tick={{ fill: CHART.axisTick, fontSize: 12 }} axisLine={{ stroke: CHART.axisLine }} tickLine={false} width={44} tickFormatter={(v) => v.toFixed(2)} />
              <RTooltip contentStyle={{ background: CHART.tooltipBg, border: `1px solid ${CHART.tooltipBorder}`, borderRadius: 8 }} formatter={(v: number, n: string) => [v?.toFixed(3), n === "prov" ? row.name : "Nasional (rata-rata)"]} />
              <Legend wrapperStyle={{ fontSize: 11 }} formatter={(v) => (v === "prov" ? row.name : "Nasional")} />
              <Line type="monotone" dataKey="prov" stroke={CHART.accent} strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="nat" stroke="#94A3B8" strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </Panel>
      )}
    </div>
  );
}

function ScatterPanel({ rows, compare, cmpKey, setCmpKey }: { rows: Row[]; compare: InequalityConfig["compare"]; cmpKey: string; setCmpKey: (s: string) => void }) {
  const c = compare.find((x) => x.key === cmpKey) ?? compare[0];
  const points = useMemo(() => rows.filter((r) => r.gini.total != null && r.cmp[c.key] != null)
    .map((r) => ({ x: r.gini.total!, y: r.cmp[c.key], name: r.name, fill: groupColor(r.domain_id) })), [rows, c]);
  const r = useMemo(() => pearson(points.map((p) => p.x), points.map((p) => p.y)), [points]);
  return (
    <Panel>
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-ink-text">Ketimpangan vs {c.short}</span>
        <select value={c.key} onChange={(e) => setCmpKey(e.target.value)} className="ml-auto rounded-lg border border-ink-border bg-ink-panel2 px-2 py-1.5 text-sm text-ink-text outline-none focus:border-ink-accent/60">
          {compare.map((x) => <option key={x.key} value={x.key}>{x.short}</option>)}
        </select>
      </div>
      <div className="mb-3 text-xs text-ink-muted">
        Korelasi (r) = <span className={`font-semibold ${Math.abs(r) >= 0.5 ? "text-ink-text" : "text-ink-muted"}`}>{isNaN(r) ? "–" : r.toFixed(2)}</span>{" "}
        · {points.length} provinsi · sumbu X: Gini (total), Y: {c.label}. Korelasi lemah menegaskan ketimpangan bukan hal yang sama dengan kemiskinan.
      </div>
      <ResponsiveContainer width="100%" aspect={1.4} className="mx-auto max-w-[600px]">
        <ScatterChart margin={{ top: 8, right: 16, bottom: 24, left: 8 }}>
          <CartesianGrid stroke={CHART.grid} />
          <XAxis type="number" dataKey="x" name="Gini" domain={["auto", "auto"]} tick={{ fill: CHART.axisTick, fontSize: 12 }} axisLine={{ stroke: CHART.axisLine }} tickLine={false}
            tickFormatter={(v) => v.toFixed(2)} label={{ value: "Gini (total)", position: "insideBottom", offset: -12, fill: CHART.axisTick, fontSize: 11 }} />
          <YAxis type="number" dataKey="y" name={c.short} unit={c.unit === "%" ? "%" : ""} tick={{ fill: CHART.axisTick, fontSize: 12 }} axisLine={{ stroke: CHART.axisLine }} tickLine={false} width={44} />
          <ZAxis range={[36, 36]} />
          <RTooltip cursor={{ strokeDasharray: "3 3" }} content={({ payload }) => payload && payload.length ? (
            <div className="rounded-lg border border-ink-border bg-ink-panel px-3 py-2 text-xs shadow-panel">
              <div className="font-medium text-ink-text">{payload[0].payload.name}</div>
              <div className="mt-0.5 text-ink-muted">Gini: {payload[0].payload.x.toFixed(3)}</div>
              <div className="text-ink-muted">{c.short}: {payload[0].payload.y?.toFixed(c.decimals)}{c.unit === "%" ? "%" : ""}</div>
            </div>
          ) : null} />
          <Scatter data={points} fillOpacity={0.75}>{points.map((p, i) => <Cell key={i} fill={p.fill} />)}</Scatter>
        </ScatterChart>
      </ResponsiveContainer>
    </Panel>
  );
}

function MapPanel({ rows, daerah }: { rows: Row[]; daerah: Daerah }) {
  const values = useMemo(() => {
    const map = new Map<string, MapValue>();
    for (const r of rows) { const v = r.gini[daerah]; if (v != null) map.set(r.domain_id.slice(0, 2), { value: Math.round(v * 1000) / 1000, name: r.name }); }
    return map;
  }, [rows, daerah]);
  const vals = [...values.values()].map((v) => v.value);
  const min = vals.length ? Math.min(...vals) : 0;
  const max = vals.length ? Math.max(...vals) : 0.5;
  return (
    <Panel>
      <div className="mb-3 text-sm font-semibold text-ink-text">Peta ketimpangan · {DAERAH_LABEL[daerah]} · provinsi</div>
      <ChoroplethMap values={values} min={min} max={max} geojsonUrls={["/dukcapil-provinces.geojson"]} />
    </Panel>
  );
}
