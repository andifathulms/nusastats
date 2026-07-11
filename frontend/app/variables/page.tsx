"use client";

import { useEffect, useState } from "react";
import { api, formatNumber, type Paginated, type Summary, type VariableRow } from "@/lib/api";
import { Badge, Panel, VariableLink } from "@/components/ui";

const LEVELS = [
  { v: "", label: "Semua tingkat" },
  { v: "national", label: "Nasional" },
  { v: "province", label: "Provinsi" },
  { v: "regency", label: "Kabupaten/Kota" },
];

export default function VariablesPage() {
  const [keyword, setKeyword] = useState("");
  const [debounced, setDebounced] = useState("");
  const [category, setCategory] = useState("");
  const [adminLevel, setAdminLevel] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Paginated<VariableRow> | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.summary().then((s: Summary) => setCategories(s.by_category.map((c) => c.category)));
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebounced(keyword);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [keyword]);

  // Reset to page 1 when a filter changes.
  useEffect(() => setPage(1), [category, adminLevel]);

  useEffect(() => {
    setLoading(true);
    const params: Record<string, string> = { page: String(page) };
    if (debounced) params.keyword = debounced;
    if (category) params.category = category;
    if (adminLevel) params.admin_level = adminLevel;
    api
      .variables(params)
      .then(setData)
      .finally(() => setLoading(false));
  }, [debounced, category, adminLevel, page]);

  const pageSize = 50;
  const totalPages = data ? Math.max(1, Math.ceil(data.count / pageSize)) : 1;
  const selectClass =
    "rounded-lg border border-ink-border bg-ink-panel px-3 py-2.5 text-sm text-ink-text transition-colors focus:border-ink-accent focus:outline-none focus:ring-2 focus:ring-ink-accent/15";

  return (
    <div className="space-y-6">
      <header className="border-b border-ink-border pb-5">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-ink-accent">
          <span className="h-1.5 w-1.5 rounded-full bg-ink-accent" />
          Badan Pusat Statistik
        </div>
        <h1 className="mt-2 font-display text-3xl font-medium tracking-tight text-ink-text sm:text-4xl">Variabel</h1>
        <p className="mt-2 text-sm text-ink-muted">
          {data ? (
            <>
              <span className="font-medium text-ink-text">{formatNumber(data.count)}</span> indikator
            </>
          ) : (
            "Memuat…"
          )}
          {(category || adminLevel) && " yang cocok dengan saringan Anda"} — klik salah satu untuk melihat grafik deret waktunya.
        </p>
      </header>

      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="Cari (mis. harapan hidup, kemiskinan, inflasi)…"
          className="flex-1 rounded-lg border border-ink-border bg-ink-panel px-4 py-2.5 text-sm text-ink-text transition-colors placeholder:text-ink-faint focus:border-ink-accent focus:outline-none focus:ring-2 focus:ring-ink-accent/15"
        />
        <select value={category} onChange={(e) => setCategory(e.target.value)} className={selectClass}>
          <option value="">Semua kategori</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select value={adminLevel} onChange={(e) => setAdminLevel(e.target.value)} className={selectClass}>
          {LEVELS.map((l) => (
            <option key={l.v} value={l.v}>
              {l.label}
            </option>
          ))}
        </select>
      </div>

      <Panel className="overflow-hidden p-0">
        <div className="overflow-x-auto scroll-thin">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink-border bg-ink-panel2/50 text-left text-[11px] uppercase tracking-wider text-ink-muted">
                <th className="px-5 py-3 font-semibold">Indikator</th>
                <th className="px-5 py-3 font-semibold">Kategori</th>
                <th className="px-5 py-3 font-semibold">Tingkat</th>
                <th className="px-5 py-3 text-right font-semibold">Tahun</th>
                <th className="px-5 py-3 text-right font-semibold">Titik data</th>
              </tr>
            </thead>
            <tbody>
              {data?.results.map((v) => (
                <tr key={v.id} className="border-b border-ink-border/50 transition-colors last:border-0 hover:bg-ink-accent/[0.04]">
                  <td className="px-5 py-3">
                    <VariableLink variableId={v.variable_id}>{v.name}</VariableLink>
                    {v.unit && <span className="ml-2 text-xs text-ink-faint">({v.unit})</span>}
                  </td>
                  <td className="px-5 py-3">
                    <Badge>{v.subject_category}</Badge>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex gap-1">
                      {(v.admin_levels ?? []).map((l) => (
                        <span
                          key={l}
                          title={l}
                          className="grid h-5 w-5 place-items-center rounded border border-ink-border bg-ink-panel2 text-[10px] font-semibold text-ink-muted"
                        >
                          {l[0].toUpperCase()}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums text-ink-muted">
                    {v.year_min && v.year_max ? `${v.year_min}–${v.year_max}` : "–"}
                  </td>
                  <td className="px-5 py-3 text-right font-medium tabular-nums text-ink-text">
                    {formatNumber(v.data_point_count)}
                  </td>
                </tr>
              ))}
              {data && data.results.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-ink-muted">
                    Tidak ada indikator yang cocok dengan saringan Anda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="flex items-center justify-between text-sm text-ink-muted">
        <span>{loading ? "Memuat…" : `Halaman ${page} dari ${formatNumber(totalPages)}`}</span>
        <div className="flex gap-2">
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="rounded-lg border border-ink-border px-3 py-1.5 disabled:opacity-40 hover:bg-ink-panel2"
          >
            ← Sebelumnya
          </button>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="rounded-lg border border-ink-border px-3 py-1.5 disabled:opacity-40 hover:bg-ink-panel2"
          >
            Berikutnya →
          </button>
        </div>
      </div>
    </div>
  );
}
