"use client";

import { useEffect, useMemo, useState } from "react";
import { CartesianGrid, Cell, Scatter, ScatterChart, Tooltip as RTooltip, XAxis, YAxis, ZAxis, ResponsiveContainer } from "recharts";
import { api, CHART, djpkApi, dukcapilApi, groupColor, titleCase } from "@/lib/api";
import { type CrossDevConfig } from "@/lib/posts";
import { Panel } from "@/components/ui";
import { ChoroplethMap, type MapValue } from "@/components/ChoroplethMap";
import { Stat, PageBtn, PillToggle, pearson } from "@/components/sorotan-ui";

const PAGE = 12;
type Level = "province" | "regency";
type YKey = "ipm" | "p0";
type Row = { key: string; name: string; provCode: string; provName: string; kemandirian: number; ipm?: number; p0?: number };

export function CrossDevPost({ config }: { config: CrossDevConfig }) {
  const [level, setLevel] = useState<Level>("regency");
  const [rows, setRows] = useState<Row[]>([]);
  const [yKey, setYKey] = useState<YKey>("ipm");
  const [selProvs, setSelProvs] = useState<Set<string>>(new Set());
  const [sel, setSel] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const y = String(config.latestYear);
    Promise.all([
      djpkApi.rank({ level, akun: config.djpkAkun, year: y }),
      api.ranking(config.ipmVar, { admin_level: level, year: y }),
      api.ranking(config.povertyVar, { admin_level: level, year: y }),
      level === "regency" ? dukcapilApi.regencyCrosswalk() : Promise.resolve(null),
      djpkApi.rank({ level: "province", akun: config.djpkAkun, year: y }), // 2-digit -> prov name
    ]).then(([kemR, ipmR, p0R, cw, provR]) => {
      if (cancelled) return;
      const provName = new Map<string, string>();
      for (const p of provR.results) if (p.kemendagri_code) provName.set(p.kemendagri_code, titleCase(p.domain_name.replace(/^Prov(insi|\.)?\s+/i, "")));

      // key everything by kemendagri code. BPS rows join via crosswalk (regency)
      // or their 2-digit prefix (province).
      const kem = new Map<string, { name: string; value: number }>();
      for (const x of kemR.results) if (x.kemendagri_code) kem.set(x.kemendagri_code, { name: titleCase(x.domain_name.replace(/^Prov(insi|\.)?\s+/i, "")), value: x.value });
      const bps2kem = new Map<string, string>();
      if (cw) for (const c of cw.results) bps2kem.set(c.bps_domain_id, c.kemendagri_code);
      const toKem = (bpsId: string) => (level === "province" ? bpsId.slice(0, 2) : bps2kem.get(bpsId));

      const ipmBy = new Map<string, number>(); ipmR.results.forEach((x) => ipmBy.set(x.domain_id, x.value));
      const p0By = new Map<string, number>(); p0R.results.forEach((x) => p0By.set(x.domain_id, x.value));

      const by = new Map<string, Row>();
      // iterate BPS IPM rows (they define the joinable universe)
      for (const [bpsId, ipm] of ipmBy) {
        const kd = toKem(bpsId);
        if (!kd || !kem.has(kd)) continue;
        by.set(kd, {
          key: kd,
          name: kem.get(kd)!.name,
          provCode: kd.slice(0, 2),
          provName: provName.get(kd.slice(0, 2)) ?? kd.slice(0, 2),
          kemandirian: kem.get(kd)!.value,
          ipm,
          p0: p0By.get(bpsId),
        });
      }
      const list = [...by.values()];
      setRows(list);
      setSel((cur) => (cur && by.has(cur) ? cur : list[0]?.key ?? null));
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [level, config]);

  const yGet = (r: Row) => (yKey === "ipm" ? r.ipm : r.p0);
  const yLabel = yKey === "ipm" ? "IPM" : "Kemiskinan (P0)";
  const sorted = useMemo(() => [...rows].sort((a, b) => b.kemandirian - a.kemandirian), [rows]);
  const filtered = useMemo(() => (q ? sorted.filter((r) => r.name.toLowerCase().includes(q.toLowerCase())) : sorted), [sorted, q]);
  const pageRows = filtered.slice(page * PAGE, page * PAGE + PAGE);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const selected = rows.find((r) => r.key === sel) ?? rows[0];

  const provs = useMemo(() => { const s = new Map<string, string>(); rows.forEach((r) => s.set(r.provCode, r.provName)); return [...s.entries()].sort((a, b) => a[1].localeCompare(b[1])); }, [rows]);
  const points = useMemo(() => rows.filter((r) => yGet(r) != null && (!selProvs.size || selProvs.has(r.provCode))).map((r) => ({ x: r.kemandirian, y: yGet(r)!, name: r.name, fill: groupColor(r.provCode) })), [rows, yKey, selProvs]);
  const r = useMemo(() => pearson(points.map((p) => p.x), points.map((p) => p.y)), [points]);

  if (loading && !rows.length) return <div className="flex h-64 items-center justify-center text-sm text-ink-muted">Memuat…</div>;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label={`Korelasi kemandirian ↔ ${yKey === "ipm" ? "IPM" : "kemiskinan"}`} value={isNaN(r) ? "–" : r.toFixed(2)} sub={r >= 0.5 ? "hubungan positif kuat" : r <= -0.3 ? "hubungan negatif" : "hubungan lemah"} />
        <Stat label="Paling mandiri & maju" value={sorted[0]?.name ?? "–"} sub={sorted[0] ? `kemandirian ${sorted[0].kemandirian.toFixed(0)}% · IPM ${sorted[0].ipm?.toFixed(1) ?? "–"}` : undefined} />
        <Stat label="Wilayah tergabung" value={`${rows.length}`} sub={`${level === "province" ? "provinsi" : "kab/kota"} (DJPK ∩ BPS)`} />
      </div>

      {/* Scatter — the centrepiece */}
      <Panel>
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-ink-text">Kemandirian fiskal vs Pembangunan</span>
          <div className="ml-auto flex items-center gap-2">
            <PillToggle opts={[["ipm", "vs IPM"], ["p0", "vs Kemiskinan"]]} value={yKey} onChange={(v) => setYKey(v as YKey)} />
            <PillToggle opts={[["regency", "Kab/Kota"], ["province", "Provinsi"]]} value={level} onChange={(lv) => { setLevel(lv as Level); setPage(0); }} />
          </div>
        </div>
        <div className="mb-3 text-xs text-ink-muted">
          Korelasi (r) = <span className={`font-semibold ${Math.abs(r) >= 0.5 ? "text-ink-text" : "text-ink-muted"}`}>{isNaN(r) ? "–" : r.toFixed(2)}</span>{" "}
          · {points.length} {level === "province" ? "provinsi" : "kab/kota"} · X: kemandirian fiskal (%), Y: {yLabel}. Warna = provinsi.{" "}
          {yKey === "ipm" ? "Positif & cukup kuat: daerah yang membiayai dirinya sendiri cenderung lebih maju — tapi tidak selalu (lihat pencilan)." : "Negatif: makin mandiri fiskal, cenderung makin rendah kemiskinannya."}
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
        <ResponsiveContainer width="100%" aspect={1.4} className="mx-auto max-w-[660px]">
          <ScatterChart margin={{ top: 8, right: 16, bottom: 24, left: 8 }}>
            <CartesianGrid stroke={CHART.grid} />
            <XAxis type="number" dataKey="x" name="Kemandirian" unit="%" tick={{ fill: CHART.axisTick, fontSize: 12 }} axisLine={{ stroke: CHART.axisLine }} tickLine={false} label={{ value: "Kemandirian fiskal (%)", position: "insideBottom", offset: -12, fill: CHART.axisTick, fontSize: 11 }} />
            <YAxis type="number" dataKey="y" name={yLabel} unit={yKey === "p0" ? "%" : ""} tick={{ fill: CHART.axisTick, fontSize: 12 }} axisLine={{ stroke: CHART.axisLine }} tickLine={false} width={44} />
            <ZAxis range={[30, 30]} />
            <RTooltip cursor={{ strokeDasharray: "3 3" }} content={({ payload }) => payload && payload.length ? (
              <div className="rounded-lg border border-ink-border bg-ink-panel px-3 py-2 text-xs shadow-panel"><div className="font-medium text-ink-text">{payload[0].payload.name}</div><div className="mt-0.5 text-ink-muted">Kemandirian: {payload[0].payload.x.toFixed(1)}%</div><div className="text-ink-muted">{yLabel}: {payload[0].payload.y.toFixed(2)}{yKey === "p0" ? "%" : ""}</div></div>
            ) : null} />
            <Scatter data={points} fillOpacity={0.72}>{points.map((p, i) => <Cell key={i} fill={p.fill} />)}</Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </Panel>

      {/* Ranking by kemandirian with IPM + P0 columns */}
      <Panel>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm font-semibold text-ink-text">Peringkat kemandirian fiskal<span className="ml-2 text-xs font-normal text-ink-muted">{filtered.length} {level === "province" ? "provinsi" : "kab/kota"}</span></div>
          <input value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} placeholder="Cari…" className="w-36 rounded-lg border border-ink-border bg-ink-panel2 px-2.5 py-1.5 text-sm text-ink-text outline-none focus:border-ink-accent/60" />
        </div>
        <div className="mb-1 flex items-center gap-3 px-2 text-[11px] uppercase tracking-wide text-ink-muted">
          <span className="w-6" /><span className="w-40">Wilayah</span><span className="flex-1">Kemandirian</span><span className="w-14 text-right">IPM</span><span className="w-14 text-right">P0</span>
        </div>
        <div className="space-y-1">
          {pageRows.map((r0) => {
            const rank = filtered.indexOf(r0) + 1;
            const on = r0.key === selected?.key;
            return (
              <button key={r0.key} onClick={() => setSel(r0.key)} className={`flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors ${on ? "bg-ink-panel2 ring-1 ring-ink-accent/50" : "hover:bg-ink-panel2/60"}`}>
                <span className="w-6 shrink-0 text-right text-xs tabular-nums text-ink-muted">{rank}</span>
                <span className="w-40 shrink-0 truncate text-sm text-ink-text" title={r0.name}>{r0.name}</span>
                <span className="flex h-3 flex-1 items-center gap-2">
                  <span className="h-3 flex-1 overflow-hidden rounded-full bg-ink-panel2 ring-1 ring-ink-border/60"><span className="block h-full rounded-full" style={{ width: `${Math.min(100, r0.kemandirian)}%`, background: "#15803D" }} /></span>
                  <span className="w-10 shrink-0 text-right text-xs tabular-nums text-ink-text">{r0.kemandirian.toFixed(0)}%</span>
                </span>
                <span className="w-14 shrink-0 text-right text-sm tabular-nums text-ink-text">{r0.ipm?.toFixed(1) ?? "–"}</span>
                <span className="w-14 shrink-0 text-right text-sm tabular-nums text-ink-muted">{r0.p0?.toFixed(1) ?? "–"}%</span>
              </button>
            );
          })}
        </div>
        <div className="mt-3 flex items-center justify-between text-xs text-ink-muted">
          <span>{filtered.length ? page * PAGE + 1 : 0}–{Math.min((page + 1) * PAGE, filtered.length)} dari {filtered.length}</span>
          <div className="flex items-center gap-1"><PageBtn disabled={page === 0} onClick={() => setPage((p) => p - 1)}>‹</PageBtn><span className="px-1 tabular-nums">{page + 1}/{pages}</span><PageBtn disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)}>›</PageBtn></div>
        </div>
      </Panel>

      <MapPanel rows={rows} level={level} yKey={yKey} />
    </div>
  );
}

function MapPanel({ rows, level, yKey }: { rows: Row[]; level: Level; yKey: YKey }) {
  const [what, setWhat] = useState<"kemandirian" | YKey>("kemandirian");
  const { values, unit } = useMemo(() => {
    const map = new Map<string, MapValue>();
    for (const r of rows) {
      const v = what === "kemandirian" ? r.kemandirian : what === "ipm" ? r.ipm : r.p0;
      if (v == null) continue;
      const gk = level === "province" ? r.provCode : r.key;
      map.set(gk, { value: Math.round(v * 10) / 10, name: r.name });
    }
    return { values: map, unit: what === "ipm" ? "" : "%" };
  }, [rows, what, level]);
  const vals = [...values.values()].map((v) => v.value);
  const min = vals.length ? Math.min(...vals) : 0;
  const max = vals.length ? Math.max(...vals) : 100;
  const opts = [["kemandirian", "Kemandirian %"], ["ipm", "IPM"], ["p0", "Kemiskinan %"]] as const;
  return (
    <Panel>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-ink-text">Peta · {level === "province" ? "provinsi" : "kabupaten/kota"}</span>
        <select value={what} onChange={(e) => setWhat(e.target.value as typeof what)} className="ml-auto rounded-lg border border-ink-border bg-ink-panel2 px-2 py-1.5 text-sm text-ink-text outline-none focus:border-ink-accent/60">
          {opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>
      <ChoroplethMap key={level} values={values} min={min} max={max} unit={unit} geojsonUrls={[level === "province" ? "/dukcapil-provinces.geojson" : "/dukcapil-regencies.geojson"]} />
    </Panel>
  );
}
