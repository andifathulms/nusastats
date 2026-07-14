"use client";

import { useEffect, useMemo, useState } from "react";
import { dukcapilApi, titleCase } from "@/lib/api";
import { type DiversityConfig } from "@/lib/posts";
import { Panel } from "@/components/ui";
import { ChoroplethMap, type MapValue } from "@/components/ChoroplethMap";
import { PageBtn, PillToggle } from "@/components/sorotan-ui";

const PAGE = 12;
type Level = "province" | "regency";
type Row = { code: string; name: string; provName: string; by: Record<string, number>; total: number; diversity: number; rank: number };

export function DiversityPost({ config }: { config: DiversityConfig }) {
  const [level, setLevel] = useState<Level>("regency");
  const [rows, setRows] = useState<Row[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      ...config.religions.map((r) => dukcapilApi.rank({ level, indicator: r.field, limit: "1000" }).then((d) => ({ field: r.field, d }))),
      dukcapilApi.rank({ level, indicator: config.diversityField, limit: "1000" }).then((d) => ({ field: "__div", d })),
    ]).then((res) => {
      if (cancelled) return;
      const by = new Map<string, Row>();
      const ensure = (id: string, name: string, prov?: string) =>
        by.get(id) ?? (() => {
          const r: Row = { code: id, name: titleCase(name), provName: prov ? titleCase(prov) : level === "province" ? titleCase(name) : id.slice(0, 2), by: {}, total: 0, diversity: 0, rank: 0 };
          by.set(id, r);
          return r;
        })();
      for (const { field, d } of res)
        for (const x of d.results) {
          const r = ensure(x.domain_id, x.domain_name, x.nama_prop);
          if (field === "__div") { r.diversity = x.value; r.rank = x.rank; }
          else r.by[field] = x.value;
        }
      const list = [...by.values()];
      list.forEach((r) => { r.total = config.religions.reduce((a, rl) => a + (r.by[rl.field] ?? 0), 0); });
      setRows(list);
      setSel((cur) => (cur && by.has(cur) ? cur : list[0]?.code ?? null));
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [level, config]);

  const sorted = useMemo(() => [...rows].sort((a, b) => b.diversity - a.diversity), [rows]);
  const filtered = useMemo(() => (q ? sorted.filter((r) => r.name.toLowerCase().includes(q.toLowerCase())) : sorted), [sorted, q]);
  const pageRows = filtered.slice(page * PAGE, page * PAGE + PAGE);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const selected = rows.find((r) => r.code === sel) ?? rows[0];

  const national = useMemo(() => {
    const t: Record<string, number> = {};
    let sum = 0;
    rows.forEach((r) => config.religions.forEach((rl) => { t[rl.field] = (t[rl.field] ?? 0) + (r.by[rl.field] ?? 0); sum += r.by[rl.field] ?? 0; }));
    const dom = config.religions.map((rl) => ({ rl, share: sum ? (t[rl.field] / sum) * 100 : 0 })).sort((a, b) => b.share - a.share)[0];
    return { dom, sum };
  }, [rows, config.religions]);

  if (loading && !rows.length) return <div className="flex h-64 items-center justify-center text-sm text-ink-muted">Memuat…</div>;

  const shareOf = (r: Row, f: string) => (r.total ? ((r.by[f] ?? 0) / r.total) * 100 : 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="Paling beragam" value={sorted[0]?.name ?? "–"} sub={sorted[0] ? `indeks ${sorted[0].diversity.toFixed(1)}/100` : undefined} />
        <Stat label="Paling homogen" value={sorted[sorted.length - 1]?.name ?? "–"} sub={sorted.length ? `indeks ${sorted[sorted.length - 1].diversity.toFixed(1)}/100` : undefined} />
        <Stat label="Mayoritas nasional" value={national.dom ? national.dom.rl.label : "–"} sub={national.dom ? `${national.dom.share.toFixed(1)}% penduduk` : undefined} />
      </div>

      {/* Religion legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 rounded-xl border border-ink-border bg-ink-panel px-4 py-3">
        {config.religions.map((r) => (
          <span key={r.field} className="inline-flex items-center gap-1.5 text-xs text-ink-muted">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: r.color }} />{r.label}
          </span>
        ))}
      </div>

      {/* Ranking by diversity with composition bars */}
      <Panel>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm font-semibold text-ink-text">
            Peringkat keberagaman
            <span className="ml-2 text-xs font-normal text-ink-muted">{filtered.length} {level === "province" ? "provinsi" : "kabupaten/kota"} · indeks 0–100</span>
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
            const on = r.code === selected?.code;
            return (
              <button key={r.code} onClick={() => setSel(r.code)}
                className={`flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors ${on ? "bg-ink-panel2 ring-1 ring-ink-accent/50" : "hover:bg-ink-panel2/60"}`}>
                <span className="w-6 shrink-0 text-right text-xs tabular-nums text-ink-muted">{rank}</span>
                <span className="w-36 shrink-0 truncate text-sm text-ink-text" title={r.name}>{r.name}</span>
                <span className="flex h-4 flex-1 overflow-hidden rounded ring-1 ring-ink-border/60">
                  {config.religions.map((rl) => {
                    const w = shareOf(r, rl.field);
                    return w > 0 ? <span key={rl.field} style={{ width: `${w}%`, background: rl.color }} title={`${rl.label}: ${w.toFixed(1)}%`} /> : null;
                  })}
                </span>
                <span className="w-12 shrink-0 text-right text-sm tabular-nums text-ink-text">{r.diversity.toFixed(0)}</span>
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

      {selected && <Detail row={selected} config={config} total={rows.length} shareOf={shareOf} />}
      <MapPanel rows={rows} config={config} level={level} shareOf={shareOf} />
    </div>
  );
}

function Detail({ row, config, total, shareOf }: { row: Row; config: DiversityConfig; total: number; shareOf: (r: Row, f: string) => number }) {
  const parts = config.religions.map((rl) => ({ ...rl, share: shareOf(row, rl.field), count: row.by[rl.field] ?? 0 })).sort((a, b) => b.share - a.share);
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 pt-2">
        <div className="h-px flex-1 bg-ink-border" />
        <div className="text-xs font-medium uppercase tracking-wide text-ink-muted">Rincian · {row.name}</div>
        <div className="h-px flex-1 bg-ink-border" />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="Indeks keberagaman" value={`${row.diversity.toFixed(1)}/100`} sub={`#${row.rank} dari ${total}`} />
        <Stat label="Mayoritas" value={parts[0]?.label ?? "–"} sub={parts[0] ? `${parts[0].share.toFixed(1)}%` : undefined} />
        <Stat label="Total penduduk" value={row.total.toLocaleString("id-ID")} sub="dengan agama tercatat" />
      </div>
      <Panel>
        <div className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-muted">Komposisi agama</div>
        <div className="flex h-7 w-full overflow-hidden rounded-md ring-1 ring-ink-border">
          {parts.map((p) => (p.share > 0 ? <div key={p.field} title={`${p.label}: ${p.share.toFixed(1)}%`} style={{ width: `${p.share}%`, background: p.color }} /> : null))}
        </div>
        <div className="mt-3 space-y-1.5">
          {parts.filter((p) => p.share > 0).map((p) => (
            <div key={p.field} className="flex items-center gap-3">
              <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: p.color }} />
              <span className="w-28 shrink-0 truncate text-sm text-ink-text">{p.label}</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-ink-panel2"><div className="h-full rounded-full" style={{ width: `${p.share}%`, background: p.color }} /></div>
              <span className="w-14 shrink-0 text-right text-sm tabular-nums text-ink-text">{p.share.toFixed(1)}%</span>
              <span className="hidden w-24 shrink-0 text-right text-xs tabular-nums text-ink-muted sm:block">{p.count.toLocaleString("id-ID")}</span>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function MapPanel({ rows, config, level, shareOf }: { rows: Row[]; config: DiversityConfig; level: Level; shareOf: (r: Row, f: string) => number }) {
  const opts = [{ key: "__div", label: "Indeks keberagaman" }, ...config.religions.map((r) => ({ key: r.field, label: `% ${r.label}` }))];
  const [key, setKey] = useState("__div");
  const { values, unit } = useMemo(() => {
    const map = new Map<string, MapValue>();
    for (const r of rows) {
      const v = key === "__div" ? r.diversity : shareOf(r, key);
      map.set(r.code, { value: Math.round(v * 10) / 10, name: r.name });
    }
    return { values: map, unit: key === "__div" ? "" : "%" };
  }, [rows, key, shareOf]);
  const vals = [...values.values()].map((v) => v.value);
  const min = vals.length ? Math.min(...vals) : 0;
  const max = vals.length ? Math.max(...vals) : 100;
  return (
    <Panel>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-ink-text">Peta · {level === "province" ? "provinsi" : "kabupaten/kota"}</span>
        <select value={key} onChange={(e) => setKey(e.target.value)} className="ml-auto rounded-lg border border-ink-border bg-ink-panel2 px-2 py-1.5 text-sm text-ink-text outline-none focus:border-ink-accent/60">
          {opts.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
        </select>
      </div>
      <ChoroplethMap key={level} values={values} min={min} max={max} unit={unit} geojsonUrls={[level === "province" ? "/dukcapil-provinces.geojson" : "/dukcapil-regencies.geojson"]} />
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
