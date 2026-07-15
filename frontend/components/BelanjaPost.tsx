"use client";

import { useEffect, useMemo, useState } from "react";
import { djpkApi, formatRupiah } from "@/lib/api";
import { type SpendingConfig } from "@/lib/posts";
import { Panel } from "@/components/ui";
import { ChoroplethMap, type MapValue } from "@/components/ChoroplethMap";
import { PageBtn, PillToggle } from "@/components/sorotan-ui";

const PAGE = 12;
type Level = "province" | "regency";
type Row = { code: string; kemendagri: string; name: string; by: Record<string, number>; total: number };

export function BelanjaPost({ config }: { config: SpendingConfig }) {
  const [level, setLevel] = useState<Level>("regency");
  const [rows, setRows] = useState<Row[]>([]);
  const [sortAkun, setSortAkun] = useState("__total"); // __total or a component akun (by share)
  const [sel, setSel] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const y = String(config.latestYear);
    Promise.all([
      ...config.components.map((c) => djpkApi.rank({ level, akun: c.akun, year: y, measure: "realisasi" }).then((d) => ({ akun: c.akun, d }))),
      djpkApi.rank({ level, akun: config.totalAkun, year: y, measure: "realisasi" }).then((d) => ({ akun: "__total", d })),
    ]).then((res) => {
      if (cancelled) return;
      const by = new Map<string, Row>();
      const ensure = (id: string, name: string, kem: string) => by.get(id) ?? (() => { const r: Row = { code: id, kemendagri: kem, name, by: {}, total: 0 }; by.set(id, r); return r; })();
      for (const { akun, d } of res)
        for (const x of d.results) {
          const r = ensure(x.domain_id, x.domain_name, x.kemendagri_code ?? "");
          if (akun === "__total") r.total = x.value;
          else r.by[akun] = x.value;
        }
      // Use the summed components as the composition denominator (== belanja).
      const list = [...by.values()];
      list.forEach((r) => { const s = config.components.reduce((a, c) => a + (r.by[c.akun] ?? 0), 0); if (!r.total) r.total = s; });
      setRows(list);
      setSel((cur) => (cur && by.has(cur) ? cur : list[0]?.code ?? null));
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [level, config]);

  const shareOf = (r: Row, akun: string) => (r.total ? ((r.by[akun] ?? 0) / r.total) * 100 : 0);
  const sorted = useMemo(() => [...rows].sort((a, b) => (sortAkun === "__total" ? b.total - a.total : shareOf(b, sortAkun) - shareOf(a, sortAkun))), [rows, sortAkun]);
  const filtered = useMemo(() => (q ? sorted.filter((r) => r.name.toLowerCase().includes(q.toLowerCase())) : sorted), [sorted, q]);
  const pageRows = filtered.slice(page * PAGE, page * PAGE + PAGE);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const selected = rows.find((r) => r.code === sel) ?? rows[0];

  const national = useMemo(() => {
    const t: Record<string, number> = {};
    let sum = 0;
    rows.forEach((r) => config.components.forEach((c) => { t[c.akun] = (t[c.akun] ?? 0) + (r.by[c.akun] ?? 0); sum += r.by[c.akun] ?? 0; }));
    const parts = config.components.map((c) => ({ c, share: sum ? (t[c.akun] / sum) * 100 : 0 })).sort((a, b) => b.share - a.share);
    return { parts, sum };
  }, [rows, config.components]);

  if (loading && !rows.length) return <div className="flex h-64 items-center justify-center text-sm text-ink-muted">Memuat…</div>;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="Total belanja nasional" value={formatRupiah(national.sum)} sub={`${config.latestYear} · ${level === "province" ? "provinsi" : "kab/kota"}`} />
        <Stat label="Komponen terbesar" value={national.parts[0]?.c.short ?? "–"} sub={national.parts[0] ? `${national.parts[0].share.toFixed(1)}% belanja` : undefined} />
        <Stat label="Belanja modal (pembangunan)" value={`${(national.parts.find((p) => p.c.akun === "belanja_modal")?.share ?? 0).toFixed(1)}%`} sub="sisanya untuk operasi & transfer" />
      </div>

      {/* Component legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 rounded-xl border border-ink-border bg-ink-panel px-4 py-3">
        {config.components.map((c) => (
          <span key={c.akun} className="inline-flex items-center gap-1.5 text-xs text-ink-muted">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: c.color }} />{c.short}
          </span>
        ))}
      </div>

      {/* Ranking with composition bars */}
      <Panel>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm font-semibold text-ink-text">Struktur belanja
            <span className="ml-2 text-xs font-normal text-ink-muted">{filtered.length} {level === "province" ? "provinsi" : "kabupaten/kota"}</span>
          </div>
          <div className="flex items-center gap-2">
            <select value={sortAkun} onChange={(e) => { setSortAkun(e.target.value); setPage(0); }} className="rounded-lg border border-ink-border bg-ink-panel2 px-2 py-1.5 text-sm text-ink-text outline-none focus:border-ink-accent/60">
              <option value="__total">Urut: total belanja</option>
              {config.components.map((c) => <option key={c.akun} value={c.akun}>Urut: % {c.short}</option>)}
            </select>
            <PillToggle opts={[["regency", "Kab/Kota"], ["province", "Provinsi"]]} value={level} onChange={(lv) => { setLevel(lv as Level); setPage(0); }} />
            <input value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} placeholder="Cari…" className="w-32 rounded-lg border border-ink-border bg-ink-panel2 px-2.5 py-1.5 text-sm text-ink-text outline-none focus:border-ink-accent/60" />
          </div>
        </div>
        <div className="space-y-1">
          {pageRows.map((r) => {
            const rank = filtered.indexOf(r) + 1;
            const on = r.code === selected?.code;
            const hl = sortAkun !== "__total" ? shareOf(r, sortAkun) : null;
            return (
              <button key={r.code} onClick={() => setSel(r.code)}
                className={`flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors ${on ? "bg-ink-panel2 ring-1 ring-ink-accent/50" : "hover:bg-ink-panel2/60"}`}>
                <span className="w-6 shrink-0 text-right text-xs tabular-nums text-ink-muted">{rank}</span>
                <span className="w-36 shrink-0 truncate text-sm text-ink-text" title={r.name}>{r.name}</span>
                <span className="w-20 shrink-0 text-right text-xs tabular-nums text-ink-muted">{formatRupiah(r.total)}</span>
                <span className="flex h-4 flex-1 overflow-hidden rounded ring-1 ring-ink-border/60">
                  {config.components.map((c) => { const w = shareOf(r, c.akun); return w > 0 ? <span key={c.akun} style={{ width: `${w}%`, background: c.color }} title={`${c.short}: ${w.toFixed(1)}%`} /> : null; })}
                </span>
                {hl != null && <span className="w-12 shrink-0 text-right text-sm tabular-nums text-ink-text">{hl.toFixed(0)}%</span>}
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

      {selected && <Detail row={selected} config={config} shareOf={shareOf} />}
      <MapPanel rows={rows} config={config} level={level} shareOf={shareOf} />
    </div>
  );
}

function Detail({ row, config, shareOf }: { row: Row; config: SpendingConfig; shareOf: (r: Row, a: string) => number }) {
  const parts = config.components.map((c) => ({ ...c, share: shareOf(row, c.akun), val: row.by[c.akun] ?? 0 })).sort((a, b) => b.share - a.share);
  const groups = config.groups.map((g) => ({ ...g, share: g.akuns.reduce((a, ak) => a + shareOf(row, ak), 0) }));
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 pt-2">
        <div className="h-px flex-1 bg-ink-border" />
        <div className="text-xs font-medium uppercase tracking-wide text-ink-muted">Rincian · {row.name}</div>
        <div className="h-px flex-1 bg-ink-border" />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="Total belanja" value={formatRupiah(row.total)} />
        <Stat label="Komponen dominan" value={parts[0]?.short ?? "–"} sub={parts[0] ? `${parts[0].share.toFixed(1)}%` : undefined} />
        <Stat label="Belanja modal" value={`${shareOf(row, "belanja_modal").toFixed(1)}%`} sub={formatRupiah(row.by["belanja_modal"] ?? 0)} />
      </div>
      <Panel>
        <div className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-muted">Kelompok belanja</div>
        <div className="flex h-7 w-full overflow-hidden rounded-md ring-1 ring-ink-border">
          {groups.map((g) => (g.share > 0 ? <div key={g.label} title={`${g.label}: ${g.share.toFixed(1)}%`} style={{ width: `${g.share}%`, background: g.color }} /> : null))}
        </div>
        <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1">
          {groups.map((g) => (
            <span key={g.label} className="inline-flex items-center gap-1.5 text-xs text-ink-muted"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: g.color }} />{g.label} <span className="tabular-nums text-ink-text">{g.share.toFixed(0)}%</span></span>
          ))}
        </div>
      </Panel>
      <Panel>
        <div className="mb-3 text-xs font-medium uppercase tracking-wide text-ink-muted">Komponen belanja</div>
        <div className="space-y-1.5">
          {parts.filter((p) => p.share > 0.05).map((p) => (
            <div key={p.akun} className="flex items-center gap-3">
              <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: p.color }} />
              <span className="w-40 shrink-0 truncate text-sm text-ink-text" title={p.label}>{p.label}</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-ink-panel2"><div className="h-full rounded-full" style={{ width: `${p.share}%`, background: p.color }} /></div>
              <span className="w-14 shrink-0 text-right text-sm tabular-nums text-ink-text">{p.share.toFixed(1)}%</span>
              <span className="hidden w-24 shrink-0 text-right text-xs tabular-nums text-ink-muted sm:block">{formatRupiah(p.val)}</span>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function MapPanel({ rows, config, level, shareOf }: { rows: Row[]; config: SpendingConfig; level: Level; shareOf: (r: Row, a: string) => number }) {
  const [akun, setAkun] = useState("belanja_modal");
  const values = useMemo(() => {
    const map = new Map<string, MapValue>();
    for (const r of rows) { if (!r.kemendagri) continue; map.set(r.kemendagri, { value: Math.round(shareOf(r, akun) * 10) / 10, name: r.name }); }
    return map;
  }, [rows, akun, shareOf]);
  const vals = [...values.values()].map((v) => v.value);
  const min = vals.length ? Math.min(...vals) : 0;
  const max = vals.length ? Math.max(...vals) : 100;
  return (
    <Panel>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-ink-text">Peta · % {config.components.find((c) => c.akun === akun)?.short} · {level === "province" ? "provinsi" : "kabupaten/kota"}</span>
        <select value={akun} onChange={(e) => setAkun(e.target.value)} className="ml-auto rounded-lg border border-ink-border bg-ink-panel2 px-2 py-1.5 text-sm text-ink-text outline-none focus:border-ink-accent/60">
          {config.components.map((c) => <option key={c.akun} value={c.akun}>% {c.short}</option>)}
        </select>
      </div>
      <ChoroplethMap key={level} values={values} min={min} max={max} unit="%" geojsonUrls={[level === "province" ? "/dukcapil-provinces.geojson" : "/dukcapil-regencies.geojson"]} />
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
