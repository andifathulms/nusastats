"use client";

import { useEffect, useMemo, useState } from "react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis } from "recharts";
import { api, bpsRegionLabel, CHART, dukcapilApi, type RegencyCrosswalk } from "@/lib/api";
import { type ExpenditureConfig } from "@/lib/posts";
import { Panel } from "@/components/ui";

const PAGE = 10;

type Comp = { id: string; label: string; color: string };
type Row = { domain_id: string; name: string; total: number; byId: Record<string, number> };

function rp(milyar: number): string {
  const s = milyar < 0 ? "-" : "";
  const a = Math.abs(milyar);
  if (a >= 1000) return `${s}Rp ${(a / 1000).toLocaleString("id-ID", { maximumFractionDigits: 2 })} T`;
  return `${s}Rp ${a.toLocaleString("id-ID", { maximumFractionDigits: 1 })} M`;
}
const pct = (p: number) => `${p.toLocaleString("id-ID", { maximumFractionDigits: 1 })}%`;

// Macro-regions (shared shape with the composition post), keyed by 2-digit code.
const MACRO_REGIONS: [string, string[]][] = [
  ["Sumatera", ["11", "12", "13", "14", "15", "16", "17", "18", "19", "21"]],
  ["Jawa", ["31", "32", "33", "34", "35", "36"]],
  ["Kepulauan Sunda Kecil", ["51", "52", "53"]],
  ["Kalimantan", ["61", "62", "63", "64", "65"]],
  ["Sulawesi", ["71", "72", "73", "74", "75", "76"]],
  ["Maluku dan Papua", ["81", "82", "91", "92", "93", "94", "95", "96"]],
];
const REGION_BY_PROV = new Map<string, { code: string; name: string }>();
MACRO_REGIONS.forEach(([name, ps]) => ps.forEach((p) => REGION_BY_PROV.set(p, { code: `reg:${name}`, name })));

export function ExpenditurePost({ config }: { config: ExpenditureConfig }) {
  const comps = config.components;
  const [rows, setRows] = useState<Row[]>([]);
  const [totalsByYear, setTotalsByYear] = useState<Map<string, { year: number; value: number }[]>>(new Map());
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
      const [comp, totals, cw] = await Promise.all([
        api.series(config.variableId, { admin_level: "regency", year_min: config.year, year_max: config.year }),
        api.series(config.variableId, { admin_level: "regency", turvar_id: config.totalTurvarId }),
        dukcapilApi.regencyCrosswalk(),
      ]);
      if (cancelled) return;
      setXwalk(new Map(cw.results.map((x) => [x.bps_domain_id, x])));

      // Composition (latest full year) per region.
      const byRegion = new Map<string, { name: string; total: number; byId: Record<string, number> }>();
      for (const d of comp.results) {
        const r = byRegion.get(d.domain_id) ?? { name: d.domain_name, total: 0, byId: {} };
        if (d.turvar_id === config.totalTurvarId) r.total = d.value;
        else r.byId[d.turvar_id] = d.value;
        byRegion.set(d.domain_id, r);
      }
      setRows(
        [...byRegion.entries()]
          .map(([domain_id, r]) => ({ domain_id, name: bpsRegionLabel(r.name, domain_id), total: r.total, byId: r.byId }))
          .sort((a, b) => b.total - a.total)
      );

      // Total over years (rank movement + trend line), by region.
      const tby = new Map<string, { year: number; value: number }[]>();
      for (const d of totals.results) {
        if (d.year == null) continue;
        const arr = tby.get(d.domain_id) ?? [];
        arr.push({ year: d.year, value: d.value });
        tby.set(d.domain_id, arr);
      }
      tby.forEach((arr) => arr.sort((a, b) => a.year - b.year));
      setTotalsByYear(tby);
      setSel((cur) => cur ?? null);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [config.variableId, config.totalTurvarId, config.year]);

  const provOf = (id: string) => {
    const c = xwalk.get(id);
    return { code: c?.prov_code ?? id.slice(0, 2), name: c?.prov_name ?? id.slice(0, 2) };
  };
  const keyOf = (id: string) =>
    level === "province" ? provOf(id) : level === "region" ? REGION_BY_PROV.get(provOf(id).code) ?? { code: "reg:Lainnya", name: "Lainnya" } : { code: id, name: "" };

  // Aggregate rows + kab membership + totals-over-years for the current level.
  const { displayRows, membersOf, trendOf, ranksOf } = useMemo(() => {
    if (level === "regency") {
      // ranks per year across all kab
      const ranks = ranksFromTotals(totalsByYear, (id) => id);
      return {
        displayRows: rows,
        membersOf: (id: string) => [id],
        trendOf: (id: string) => totalsByYear.get(id) ?? [],
        ranksOf: (id: string) => ranks.get(id) ?? {},
      };
    }
    const g = new Map<string, Row>();
    const members = new Map<string, string[]>();
    for (const r of rows) {
      const k = keyOf(r.domain_id);
      const cur = g.get(k.code) ?? { domain_id: k.code, name: k.name, total: 0, byId: {} };
      cur.total += r.total;
      for (const [id, v] of Object.entries(r.byId)) cur.byId[id] = (cur.byId[id] ?? 0) + v;
      g.set(k.code, cur);
      members.set(k.code, [...(members.get(k.code) ?? []), r.domain_id]);
    }
    // aggregate totals-over-years by key
    const aggTotals = new Map<string, { year: number; value: number }[]>();
    totalsByYear.forEach((arr, dom) => {
      const code = keyOf(dom).code;
      const ym = new Map<number, number>(aggTotals.get(code)?.map((x) => [x.year, x.value]));
      for (const { year, value } of arr) ym.set(year, (ym.get(year) ?? 0) + value);
      aggTotals.set(code, [...ym.entries()].map(([year, value]) => ({ year, value })).sort((a, b) => a.year - b.year));
    });
    const ranks = ranksFromTotals(aggTotals, (id) => id);
    return {
      displayRows: [...g.values()].sort((a, b) => b.total - a.total),
      membersOf: (id: string) => members.get(id) ?? [],
      trendOf: (id: string) => aggTotals.get(id) ?? [],
      ranksOf: (id: string) => ranks.get(id) ?? {},
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, totalsByYear, level, xwalk]);

  const filtered = useMemo(() => (q ? displayRows.filter((r) => r.name.toLowerCase().includes(q.toLowerCase())) : displayRows), [displayRows, q]);
  const pageRows = filtered.slice(page * PAGE, page * PAGE + PAGE);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const selected = displayRows.find((r) => r.domain_id === sel) ?? displayRows[0];
  const maxTotal = displayRows[0]?.total ?? 1;

  if (loading) return <div className="flex h-64 items-center justify-center text-sm text-ink-muted">Memuat…</div>;

  return (
    <div className="space-y-4">
      {/* Ranking by total PDRB */}
      <Panel>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm font-semibold text-ink-text">
            Peringkat PDRB (pengeluaran)
            <span className="ml-2 text-xs font-normal text-ink-muted">
              {displayRows.length} {level === "province" ? "provinsi" : level === "region" ? "wilayah" : "kabupaten/kota"} · {config.year}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-lg border border-ink-border/80 bg-ink-panel2/50 p-0.5">
              {(["regency", "province", "region"] as const).map((lv) => (
                <button key={lv} onClick={() => { setLevel(lv); setPage(0); }} className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${level === lv ? "bg-brand-gradient text-white" : "text-ink-muted hover:text-ink-text"}`}>
                  {lv === "regency" ? "Kab/Kota" : lv === "province" ? "Provinsi" : "Region"}
                </button>
              ))}
            </div>
            <input value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} placeholder="Cari…" className="w-36 rounded-lg border border-ink-border bg-ink-panel2 px-2.5 py-1.5 text-sm text-ink-text outline-none focus:border-ink-accent/60" />
          </div>
        </div>
        <div className="space-y-1">
          {pageRows.map((r) => {
            const rank = filtered.indexOf(r) + 1;
            const on = r.domain_id === selected?.domain_id;
            return (
              <button key={r.domain_id} onClick={() => setSel(r.domain_id)} className={`flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors ${on ? "bg-ink-panel2 ring-1 ring-ink-accent/50" : "hover:bg-ink-panel2/60"}`}>
                <span className="w-6 shrink-0 text-right text-xs tabular-nums text-ink-muted">{rank}</span>
                <span className="w-44 shrink-0 truncate text-sm text-ink-text" title={r.name}>{r.name}</span>
                <span className="w-20 shrink-0 text-right text-xs tabular-nums text-ink-muted">{rp(r.total)}</span>
                <span className="flex h-4 flex-1 overflow-hidden rounded bg-ink-panel2 ring-1 ring-ink-border/70">
                  <span className="h-full rounded bg-ink-accent/80" style={{ width: `${(r.total / maxTotal) * 100}%` }} />
                </span>
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
        <Detail
          row={selected}
          comps={comps}
          groups={config.groups}
          year={config.year}
          variableId={config.variableId}
          totalTurvarId={config.totalTurvarId}
          members={membersOf(selected.domain_id)}
          trend={trendOf(selected.domain_id)}
          ranks={ranksOf(selected.domain_id)}
        />
      )}
    </div>
  );
}

// Rank each region within every year by its total, desc.
function ranksFromTotals(totals: Map<string, { year: number; value: number }[]>, keyOf: (id: string) => string) {
  const byYear = new Map<number, { id: string; v: number }[]>();
  totals.forEach((arr, dom) => {
    const id = keyOf(dom);
    for (const { year, value } of arr) byYear.set(year, [...(byYear.get(year) ?? []), { id, v: value }]);
  });
  const out = new Map<string, Record<number, number>>();
  byYear.forEach((list, year) => {
    list.sort((a, b) => b.v - a.v).forEach((x, i) => {
      const m = out.get(x.id) ?? {};
      m[year] = i + 1;
      out.set(x.id, m);
    });
  });
  return out;
}

function Detail({
  row,
  comps,
  groups,
  year,
  variableId,
  totalTurvarId,
  members,
  trend,
  ranks,
}: {
  row: Row;
  comps: Comp[];
  groups: { label: string; color: string; ids: string[] }[];
  year: string;
  variableId: string;
  totalTurvarId: string;
  members: string[];
  trend: { year: number; value: number }[];
  ranks: Record<number, number>;
}) {
  const parts = comps.map((c) => {
    const value = row.byId[c.id] ?? 0;
    return { ...c, value, share: row.total ? (value / row.total) * 100 : 0 };
  });
  const maxAbs = Math.max(1, ...parts.map((p) => Math.abs(p.share)));
  const netExport = parts.find((p) => p.id === "1549");
  const konsumsi = groups.find((g) => g.label === "Konsumsi");
  const konsShare = konsumsi ? konsumsi.ids.reduce((a, id) => a + (row.byId[id] ?? 0), 0) / (row.total || 1) * 100 : 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 pt-2">
        <div className="h-px flex-1 bg-ink-border" />
        <div className="text-xs font-medium uppercase tracking-wide text-ink-muted">Rincian · {row.name}</div>
        <div className="h-px flex-1 bg-ink-border" />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label={`Total PDRB (${year})`} value={rp(row.total)} sub={row.name} />
        <Stat label="Konsumsi" value={pct(konsShare)} sub="dari PDRB" />
        <Stat
          label="Net Ekspor"
          value={netExport ? pct(netExport.share) : "–"}
          sub={netExport ? (netExport.value >= 0 ? "surplus" : "defisit (net importir)") : undefined}
        />
      </div>

      {/* Diverging component bars — Net Ekspor can go negative (left, red). */}
      <Panel>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-ink-muted">Komponen pengeluaran (% dari PDRB)</span>
          <span className="flex flex-wrap gap-x-3 gap-y-1">
            {comps.map((c) => (
              <span key={c.id} className="inline-flex items-center gap-1.5 text-[11px] text-ink-muted">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ background: c.color }} />
                {c.label}
              </span>
            ))}
          </span>
        </div>
        <div className="space-y-2">
          {parts.map((p) => (
            <div key={p.id} className="flex items-center gap-3">
              <span className="w-40 shrink-0 truncate text-sm text-ink-text" title={p.label}>{p.label}</span>
              <div className="flex h-3 flex-1 items-center">
                <div className="flex h-full w-1/2 justify-end">
                  {p.share < 0 && <div className="h-full rounded-l" style={{ width: `${(Math.abs(p.share) / maxAbs) * 100}%`, background: "#D9455E" }} title={pct(p.share)} />}
                </div>
                <div className="h-4 w-px bg-ink-border" />
                <div className="h-full w-1/2">
                  {p.share >= 0 && <div className="h-full rounded-r" style={{ width: `${(p.share / maxAbs) * 100}%`, background: p.color }} title={pct(p.share)} />}
                </div>
              </div>
              <span className={`w-16 shrink-0 text-right text-sm tabular-nums ${p.share < 0 ? "text-rose-600" : "text-ink-text"}`}>{pct(p.share)}</span>
              <span className="hidden w-24 shrink-0 text-right text-xs tabular-nums text-ink-muted sm:block">{rp(p.value)}</span>
            </div>
          ))}
        </div>
      </Panel>

      {/* 3-group summary */}
      <Panel>
        <div className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-muted">Kelompok</div>
        <div className="flex flex-wrap gap-x-6 gap-y-1.5">
          {groups.map((g) => {
            const v = g.ids.reduce((a, id) => a + (row.byId[id] ?? 0), 0);
            const shr = row.total ? (v / row.total) * 100 : 0;
            return (
              <span key={g.label} className="inline-flex items-center gap-1.5 text-xs text-ink-muted">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ background: g.color }} />
                {g.label} <span className={`tabular-nums ${shr < 0 ? "text-rose-600" : "text-ink-text"}`}>{pct(shr)}</span>
                <span className="text-ink-muted/70">({rp(v)})</span>
              </span>
            );
          })}
        </div>
      </Panel>

      {/* History */}
      <HistoryPanel members={members} comps={comps} variableId={variableId} totalTurvarId={totalTurvarId} trend={trend} ranks={ranks} />
    </div>
  );
}

function HistoryPanel({
  members,
  comps,
  variableId,
  totalTurvarId,
  trend,
  ranks,
}: {
  members: string[];
  comps: Comp[];
  variableId: string;
  totalTurvarId: string;
  trend: { year: number; value: number }[];
  ranks: Record<number, number>;
}) {
  const [compRows, setCompRows] = useState<Record<string, number>[] | null>(null);
  const [mode, setMode] = useState<"total" | "components" | "rank">("total");
  const canComponents = members.length > 0 && members.length <= 45; // avoid huge region fetches
  const key = members.join(",");

  useEffect(() => {
    if (!canComponents) return;
    let cancelled = false;
    setCompRows(null);
    Promise.all(members.map((m) => api.series(variableId, { domain_id: m }))).then((res) => {
      if (cancelled) return;
      const byYear = new Map<number, Record<string, number>>();
      for (const s of res)
        for (const d of s.results) {
          if (d.year == null) continue;
          const y = byYear.get(d.year) ?? { year: d.year };
          y[d.turvar_id] = (y[d.turvar_id] ?? 0) + d.value;
          byYear.set(d.year, y);
        }
      setCompRows([...byYear.values()].sort((a, b) => a.year - b.year));
    });
    return () => { cancelled = true; };
  }, [key, canComponents, variableId]);

  const totalRows = trend.map((t) => ({ year: t.year, total: t.value }));
  const rankRows = trend.map((t) => ({ year: t.year, rank: ranks[t.year] })).filter((r) => r.rank != null) as { year: number; rank: number }[];
  const first = trend[0], last = trend[trend.length - 1];
  const growth = first?.value ? (last.value / first.value - 1) * 100 : 0;

  return (
    <Panel>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs font-medium uppercase tracking-wide text-ink-muted">
          PDRB pengeluaran (harga konstan 2010) · {first?.year}–{last?.year}
        </div>
        <div className="inline-flex rounded-lg border border-ink-border/80 bg-ink-panel2/50 p-0.5">
          {(["total", "components", "rank"] as const).map((m) => {
            const disabled = m === "components" && !canComponents;
            return (
              <button key={m} disabled={disabled} onClick={() => setMode(m)} className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-40 ${mode === m ? "bg-brand-gradient text-white" : "text-ink-muted hover:text-ink-text"}`}>
                {m === "total" ? "Total" : m === "components" ? "Komponen" : "Peringkat"}
              </button>
            );
          })}
        </div>
      </div>
      {mode === "rank" ? (
        <RankChart rows={rankRows} />
      ) : mode === "components" ? (
        !compRows ? (
          <div className="flex h-[300px] items-center justify-center text-sm text-ink-muted">Memuat…</div>
        ) : (
          <ResponsiveContainer width="100%" height={360}>
            <LineChart data={compRows} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
              <CartesianGrid stroke={CHART.grid} vertical={false} />
              <XAxis dataKey="year" tick={{ fill: CHART.axisTick, fontSize: 12 }} axisLine={{ stroke: CHART.axisLine }} tickLine={false} />
              <YAxis tick={{ fill: CHART.axisTick, fontSize: 12 }} axisLine={{ stroke: CHART.axisLine }} tickLine={false} width={56} tickFormatter={(v) => (Math.abs(v) >= 1000 ? `${(v / 1000).toLocaleString("id-ID")}k` : `${v}`)} />
              <RTooltip contentStyle={{ background: CHART.tooltipBg, border: `1px solid ${CHART.tooltipBorder}`, borderRadius: 8 }} formatter={(v: number, n: string) => [`${v?.toLocaleString?.("id-ID") ?? v} M`, n]} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {comps.map((c) => (
                <Line key={c.id} type="monotone" dataKey={c.id} name={c.label} stroke={c.color} strokeWidth={1.6} dot={false} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )
      ) : (
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={totalRows} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
            <CartesianGrid stroke={CHART.grid} vertical={false} />
            <XAxis dataKey="year" tick={{ fill: CHART.axisTick, fontSize: 12 }} axisLine={{ stroke: CHART.axisLine }} tickLine={false} />
            <YAxis tick={{ fill: CHART.axisTick, fontSize: 12 }} axisLine={{ stroke: CHART.axisLine }} tickLine={false} width={56} tickFormatter={(v) => (Math.abs(v) >= 1000 ? `${(v / 1000).toLocaleString("id-ID")}k` : `${v}`)} />
            <RTooltip contentStyle={{ background: CHART.tooltipBg, border: `1px solid ${CHART.tooltipBorder}`, borderRadius: 8 }} formatter={(v: number) => [`${v?.toLocaleString?.("id-ID") ?? v} M`, "PDRB"]} />
            <Line type="monotone" dataKey="total" name="PDRB" stroke={CHART.accent} strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      )}
      <div className="mt-2 text-xs text-ink-muted">
        Pertumbuhan {first?.year}→{last?.year}: <span className="font-semibold text-ink-text">{growth >= 0 ? "+" : ""}{growth.toLocaleString("id-ID", { maximumFractionDigits: 0 })}%</span> riil
        {ranks[last?.year] != null && <> · Peringkat {last?.year}: #{ranks[last?.year]} nasional</>}
      </div>
    </Panel>
  );
}

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
        <RTooltip contentStyle={{ background: CHART.tooltipBg, border: `1px solid ${CHART.tooltipBorder}`, borderRadius: 8 }} formatter={(v: number) => [`#${v}`, "Peringkat nasional"]} />
        <Line type="monotone" dataKey="rank" name="Peringkat" stroke={CHART.accent} strokeWidth={2} dot={{ r: 2 }} />
      </LineChart>
    </ResponsiveContainer>
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
    <button onClick={onClick} disabled={disabled} className="grid h-7 w-7 place-items-center rounded-md border border-ink-border bg-ink-panel text-ink-text hover:border-ink-accent/60 disabled:opacity-40">
      {children}
    </button>
  );
}
