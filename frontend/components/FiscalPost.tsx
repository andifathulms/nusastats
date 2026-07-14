"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid, Cell, Line, LineChart, Scatter, ScatterChart, Tooltip as RTooltip, XAxis, YAxis, ZAxis, ResponsiveContainer,
} from "recharts";
import { CHART, djpkApi, formatRupiah, groupColor } from "@/lib/api";
import { type FiscalConfig, type FiscalRatio } from "@/lib/posts";
import { Panel } from "@/components/ui";
import { ChoroplethMap, type MapValue } from "@/components/ChoroplethMap";
import { Stat, PageBtn, PillToggle, pearson } from "@/components/sorotan-ui";

const PAGE = 10;
type Level = "province" | "regency";
type Cell = { value: number; rank: number };
type Row = {
  domain_id: string; name: string; kemendagri: string; provCode: string; provName: string;
  ratio: Record<string, Cell>; // akun -> ratio %
  abs: Record<string, number>; // pad / pendapatan_daerah / belanja_daerah / belanja_pegawai / belanja_modal (Rp)
};

const ABS_AKUNS = ["pad", "pendapatan_daerah", "belanja_daerah", "belanja_pegawai", "belanja_modal"];

export function FiscalPost({ config }: { config: FiscalConfig }) {
  const ratioByAkun = useMemo(() => Object.fromEntries(config.ratios.map((r) => [r.akun, r])) as Record<string, FiscalRatio>, [config.ratios]);
  const [level, setLevel] = useState<Level>("regency");
  const [rows, setRows] = useState<Row[]>([]);
  const [trend, setTrend] = useState<Map<string, { year: number; value: number }[]>>(new Map());
  const [natTrend, setNatTrend] = useState<{ year: number; value: number }[]>([]);
  const [akun, setAkun] = useState(config.primaryAkun);
  const [sel, setSel] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const y = String(config.latestYear);
    Promise.all([
      ...config.ratios.map((r) => djpkApi.rank({ level, akun: r.akun, year: y }).then((d) => ({ kind: "ratio" as const, akun: r.akun, d }))),
      ...ABS_AKUNS.map((a) => djpkApi.rank({ level, akun: a, year: y, measure: "realisasi" }).then((d) => ({ kind: "abs" as const, akun: a, d }))),
      djpkApi.rank({ level: "province", akun: config.primaryAkun, year: y }).then((d) => ({ kind: "prov" as const, akun: "", d })),
      ...config.years.map((yr) => djpkApi.rank({ level, akun: config.primaryAkun, year: String(yr) }).then((d) => ({ kind: "yr" as const, akun: String(yr), d }))),
    ]).then((res) => {
      if (cancelled) return;
      const provName = new Map<string, string>();
      const provRes = res.find((x) => x.kind === "prov");
      if (provRes) for (const r of provRes.d.results) if (r.kemendagri_code) provName.set(r.kemendagri_code, r.domain_name.replace(/^Prov(insi|\.)?\s+/i, ""));

      const by = new Map<string, Row>();
      const ensure = (domain_id: string, name: string, kem: string) =>
        by.get(domain_id) ?? (() => {
          const provCode = level === "province" ? kem : kem.slice(0, 2);
          const r: Row = { domain_id, name, kemendagri: kem, provCode, provName: provName.get(provCode) ?? provCode, ratio: {}, abs: {} };
          by.set(domain_id, r);
          return r;
        })();
      for (const x of res) {
        if (x.kind === "ratio") for (const d of x.d.results) ensure(d.domain_id, d.domain_name, d.kemendagri_code ?? "").ratio[x.akun] = { value: d.value, rank: d.rank };
        else if (x.kind === "abs") for (const d of x.d.results) { const r = by.get(d.domain_id); if (r) r.abs[x.akun] = d.value; }
      }
      const list = [...by.values()];
      setRows(list);
      setSel((cur) => (cur && by.has(cur) ? cur : list[0]?.domain_id ?? null));

      // Trend of the primary ratio across years (per region + national median).
      const tr = new Map<string, { year: number; value: number }[]>();
      const perYear = new Map<number, number[]>();
      for (const x of res) if (x.kind === "yr") {
        const yr = Number(x.akun);
        for (const d of x.d.results) {
          (tr.get(d.domain_id) ?? tr.set(d.domain_id, []).get(d.domain_id)!).push({ year: yr, value: d.value });
          (perYear.get(yr) ?? perYear.set(yr, []).get(yr)!).push(d.value);
        }
      }
      tr.forEach((arr) => arr.sort((a, b) => a.year - b.year));
      setTrend(tr);
      const nat = [...perYear.entries()].map(([year, vs]) => ({ year, value: vs.sort((a, b) => a - b)[Math.floor(vs.length / 2)] })).sort((a, b) => a.year - b.year);
      setNatTrend(nat);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [level, config]);

  const m = ratioByAkun[akun];
  const sorted = useMemo(() => [...rows].filter((r) => r.ratio[akun]).sort((a, b) => b.ratio[akun].value - a.ratio[akun].value), [rows, akun]);
  const filtered = useMemo(() => (q ? sorted.filter((r) => r.name.toLowerCase().includes(q.toLowerCase())) : sorted), [sorted, q]);
  const pageRows = filtered.slice(page * PAGE, page * PAGE + PAGE);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const maxVal = sorted[0]?.ratio[akun]?.value ?? 100;
  const selected = rows.find((r) => r.domain_id === sel) ?? rows[0];

  const kemAkun = "rasio_kemandirian";
  const natKem = natTrend[natTrend.length - 1]?.value;
  const mostIndep = useMemo(() => [...rows].filter((r) => r.ratio[kemAkun]).sort((a, b) => b.ratio[kemAkun].value - a.ratio[kemAkun].value)[0], [rows]);
  const salaryHeavy = useMemo(() => [...rows].filter((r) => r.ratio.rasio_belanja_pegawai).sort((a, b) => b.ratio.rasio_belanja_pegawai.value - a.ratio.rasio_belanja_pegawai.value)[0], [rows]);

  if (loading && !rows.length) return <div className="flex h-64 items-center justify-center text-sm text-ink-muted">Memuat…</div>;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label={`Kemandirian median ${config.latestYear}`} value={natKem != null ? `${natKem.toFixed(1)}%` : "–"} sub={`median ${level === "province" ? "provinsi" : "kab/kota"} · PAD ÷ pendapatan`} />
        <Stat label="Paling mandiri" value={mostIndep?.name ?? "–"} sub={mostIndep ? `${mostIndep.ratio[kemAkun].value.toFixed(1)}% dari PAD` : undefined} />
        <Stat label="Beban pegawai tertinggi" value={salaryHeavy?.name ?? "–"} sub={salaryHeavy ? `${salaryHeavy.ratio.rasio_belanja_pegawai.value.toFixed(1)}% belanja untuk gaji` : undefined} />
      </div>

      {/* Ratio chips */}
      <div className="rounded-xl border border-ink-border bg-ink-panel px-4 py-3">
        <div className="flex flex-wrap gap-2">
          {config.ratios.map((r) => (
            <button key={r.akun} onClick={() => { setAkun(r.akun); setPage(0); }}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${akun === r.akun ? "border-transparent text-white" : "border-ink-border text-ink-muted hover:text-ink-text"}`}
              style={akun === r.akun ? { background: r.color } : undefined}>
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: r.color }} />{r.short}
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
            const v = r.ratio[akun]?.value ?? 0;
            const on = r.domain_id === selected?.domain_id;
            return (
              <button key={r.domain_id} onClick={() => setSel(r.domain_id)}
                className={`flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors ${on ? "bg-ink-panel2 ring-1 ring-ink-accent/50" : "hover:bg-ink-panel2/60"}`}>
                <span className="w-6 shrink-0 text-right text-xs tabular-nums text-ink-muted">{rank}</span>
                <span className="w-40 shrink-0 truncate text-sm text-ink-text" title={r.name}>{r.name}</span>
                <span className="h-3 flex-1 overflow-hidden rounded-full bg-ink-panel2 ring-1 ring-ink-border/60">
                  <span className="block h-full rounded-full" style={{ width: `${maxVal ? Math.max(2, (v / maxVal) * 100) : 0}%`, background: m.color }} />
                </span>
                <span className="w-14 shrink-0 text-right text-sm tabular-nums text-ink-text">{v.toFixed(1)}%</span>
                <span className="hidden w-24 shrink-0 text-right text-xs tabular-nums text-ink-muted sm:block">{formatRupiah(r.abs.pendapatan_daerah)}</span>
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

      {selected && <Detail row={selected} ratios={config.ratios} total={rows.length} series={trend.get(selected.domain_id) ?? null} />}
      <ScatterPanel rows={rows} ratios={config.ratios} level={level} />
      <MapPanel rows={rows} ratios={config.ratios} akun={akun} level={level} />
      {natTrend.length > 1 && (
        <Panel>
          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-muted">Kemandirian fiskal (median) · {natTrend[0].year}–{natTrend[natTrend.length - 1].year}</div>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={natTrend} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
              <CartesianGrid stroke={CHART.grid} vertical={false} />
              <XAxis dataKey="year" tick={{ fill: CHART.axisTick, fontSize: 12 }} axisLine={{ stroke: CHART.axisLine }} tickLine={false} />
              <YAxis tick={{ fill: CHART.axisTick, fontSize: 12 }} axisLine={{ stroke: CHART.axisLine }} tickLine={false} width={40} tickFormatter={(v) => `${v}%`} />
              <RTooltip contentStyle={{ background: CHART.tooltipBg, border: `1px solid ${CHART.tooltipBorder}`, borderRadius: 8 }} formatter={(v: number) => [`${v.toFixed(1)}%`, "Kemandirian median"]} />
              <Line type="monotone" dataKey="value" name="Kemandirian" stroke="#15803D" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </Panel>
      )}
    </div>
  );
}

function Detail({ row, ratios, total, series }: { row: Row; ratios: FiscalRatio[]; total: number; series: { year: number; value: number }[] | null }) {
  const pad = row.abs.pad ?? 0, pend = row.abs.pendapatan_daerah ?? 0, bel = row.abs.belanja_daerah ?? 0;
  const peg = row.abs.belanja_pegawai ?? 0, mod = row.abs.belanja_modal ?? 0;
  const transfer = Math.max(0, pend - pad);
  const other = Math.max(0, bel - peg - mod);
  const revSeg = [{ l: "PAD", v: pad, c: "#15803D" }, { l: "Transfer pusat", v: transfer, c: "#94A3B8" }];
  const spSeg = [{ l: "Pegawai", v: peg, c: "#E0803A" }, { l: "Modal", v: mod, c: "#1E4585" }, { l: "Lainnya", v: other, c: "#94A3B8" }];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 pt-2">
        <div className="h-px flex-1 bg-ink-border" />
        <div className="text-xs font-medium uppercase tracking-wide text-ink-muted">Rincian · {row.name}</div>
        <div className="h-px flex-1 bg-ink-border" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {ratios.map((r) => {
          const c = row.ratio[r.akun];
          return (
            <Panel key={r.akun}>
              <div className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: r.color }} /><span className="truncate text-xs uppercase tracking-wide text-ink-muted" title={r.short}>{r.short}</span></div>
              <div className="mt-1 text-lg font-semibold text-ink-text">{c ? `${c.value.toFixed(1)}%` : "–"}</div>
              <div className="mt-0.5 text-xs text-ink-muted">{c ? `#${c.rank} dari ${total}` : "–"}</div>
            </Panel>
          );
        })}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <StackBar title={`Pendapatan · ${formatRupiah(pend)}`} segments={revSeg} total={pend} />
        <StackBar title={`Belanja · ${formatRupiah(bel)}`} segments={spSeg} total={bel} />
      </div>
      {series && series.length > 1 && (
        <Panel>
          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-muted">Kemandirian fiskal · {series[0].year}–{series[series.length - 1].year}</div>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={series} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
              <CartesianGrid stroke={CHART.grid} vertical={false} />
              <XAxis dataKey="year" tick={{ fill: CHART.axisTick, fontSize: 12 }} axisLine={{ stroke: CHART.axisLine }} tickLine={false} />
              <YAxis tick={{ fill: CHART.axisTick, fontSize: 12 }} axisLine={{ stroke: CHART.axisLine }} tickLine={false} width={40} tickFormatter={(v) => `${v}%`} />
              <RTooltip contentStyle={{ background: CHART.tooltipBg, border: `1px solid ${CHART.tooltipBorder}`, borderRadius: 8 }} formatter={(v: number) => [`${v.toFixed(1)}%`, "Kemandirian"]} />
              <Line type="monotone" dataKey="value" stroke="#15803D" strokeWidth={2} dot={{ r: 2 }} />
            </LineChart>
          </ResponsiveContainer>
        </Panel>
      )}
    </div>
  );
}

function StackBar({ title, segments, total }: { title: string; segments: { l: string; v: number; c: string }[]; total: number }) {
  return (
    <Panel>
      <div className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-muted">{title}</div>
      <div className="flex h-7 w-full overflow-hidden rounded-md ring-1 ring-ink-border">
        {segments.map((s) => (total && s.v > 0 ? <div key={s.l} title={`${s.l}: ${formatRupiah(s.v)} (${((s.v / total) * 100).toFixed(1)}%)`} style={{ width: `${(s.v / total) * 100}%`, background: s.c }} /> : null))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        {segments.map((s) => (
          <span key={s.l} className="inline-flex items-center gap-1.5 text-xs text-ink-muted">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.c }} />{s.l} <span className="tabular-nums text-ink-text">{total ? ((s.v / total) * 100).toFixed(0) : 0}%</span>
          </span>
        ))}
      </div>
    </Panel>
  );
}

function ScatterPanel({ rows, ratios, level }: { rows: Row[]; ratios: FiscalRatio[]; level: Level }) {
  const [xa, setXa] = useState(ratios[0].akun);
  const [ya, setYa] = useState(ratios[3]?.akun ?? ratios[1].akun);
  const [selProvs, setSelProvs] = useState<Set<string>>(new Set());
  const shortOf = (a: string) => ratios.find((r) => r.akun === a)?.short ?? a;
  const provs = useMemo(() => {
    const s = new Map<string, string>();
    rows.forEach((r) => s.set(r.provCode, r.provName));
    return [...s.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows]);
  const points = useMemo(() => rows.filter((r) => r.ratio[xa] && r.ratio[ya] && (!selProvs.size || selProvs.has(r.provCode)))
    .map((r) => ({ x: r.ratio[xa].value, y: r.ratio[ya].value, name: r.name, fill: groupColor(r.provCode) })), [rows, xa, ya, selProvs]);
  const r = useMemo(() => pearson(points.map((p) => p.x), points.map((p) => p.y)), [points]);
  const Sel = ({ v, on }: { v: string; on: (s: string) => void }) => (
    <select value={v} onChange={(e) => on(e.target.value)} className="rounded-lg border border-ink-border bg-ink-panel2 px-2 py-1.5 text-sm text-ink-text outline-none focus:border-ink-accent/60">
      {ratios.map((rr) => <option key={rr.akun} value={rr.akun}>{rr.short}</option>)}
    </select>
  );
  return (
    <Panel>
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-ink-text">Hubungan antar-rasio fiskal</span>
        <span className="ml-auto flex items-center gap-2 text-xs text-ink-muted"><Sel v={xa} on={setXa} /> vs <Sel v={ya} on={setYa} /></span>
      </div>
      <div className="mb-2 text-xs text-ink-muted">
        Korelasi (r) = <span className={`font-semibold ${Math.abs(r) >= 0.5 ? "text-ink-text" : "text-ink-muted"}`}>{isNaN(r) ? "–" : r.toFixed(2)}</span> · {points.length} {level === "province" ? "provinsi" : "kab/kota"} · warna = provinsi.
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
          <XAxis type="number" dataKey="x" name={shortOf(xa)} unit="%" tick={{ fill: CHART.axisTick, fontSize: 12 }} axisLine={{ stroke: CHART.axisLine }} tickLine={false}
            label={{ value: shortOf(xa), position: "insideBottom", offset: -12, fill: CHART.axisTick, fontSize: 11 }} />
          <YAxis type="number" dataKey="y" name={shortOf(ya)} unit="%" tick={{ fill: CHART.axisTick, fontSize: 12 }} axisLine={{ stroke: CHART.axisLine }} tickLine={false} width={44} />
          <ZAxis range={[30, 30]} />
          <RTooltip cursor={{ strokeDasharray: "3 3" }} content={({ payload }) => payload && payload.length ? (
            <div className="rounded-lg border border-ink-border bg-ink-panel px-3 py-2 text-xs shadow-panel">
              <div className="font-medium text-ink-text">{payload[0].payload.name}</div>
              <div className="mt-0.5 text-ink-muted">{shortOf(xa)}: {payload[0].payload.x.toFixed(1)}%</div>
              <div className="text-ink-muted">{shortOf(ya)}: {payload[0].payload.y.toFixed(1)}%</div>
            </div>
          ) : null} />
          <Scatter data={points} fillOpacity={0.72}>{points.map((p, i) => <Cell key={i} fill={p.fill} />)}</Scatter>
        </ScatterChart>
      </ResponsiveContainer>
    </Panel>
  );
}

function MapPanel({ rows, ratios, akun, level }: { rows: Row[]; ratios: FiscalRatio[]; akun: string; level: Level }) {
  const [a, setA] = useState(akun);
  useEffect(() => setA(akun), [akun]);
  const { values } = useMemo(() => {
    const map = new Map<string, MapValue>();
    for (const r of rows) {
      const c = r.ratio[a];
      if (!c || !r.kemendagri) continue;
      map.set(r.kemendagri, { value: Math.round(c.value * 10) / 10, name: r.name });
    }
    return { values: map };
  }, [rows, a]);
  const vals = [...values.values()].map((v) => v.value);
  const min = vals.length ? Math.min(...vals) : 0;
  const max = vals.length ? Math.max(...vals) : 100;
  return (
    <Panel>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-ink-text">Peta · {level === "province" ? "provinsi" : "kabupaten/kota"}</span>
        <select value={a} onChange={(e) => setA(e.target.value)} className="ml-auto rounded-lg border border-ink-border bg-ink-panel2 px-2 py-1.5 text-sm text-ink-text outline-none focus:border-ink-accent/60">
          {ratios.map((rr) => <option key={rr.akun} value={rr.akun}>{rr.short}</option>)}
        </select>
      </div>
      <ChoroplethMap key={level} values={values} min={min} max={max} unit="%" geojsonUrls={[level === "province" ? "/dukcapil-provinces.geojson" : "/dukcapil-regencies.geojson"]} />
    </Panel>
  );
}
