"use client";

import { useEffect, useState } from "react";
import { api, formatNumber, type Paginated, type Summary, type VariableRow } from "@/lib/api";
import { Badge, Panel, VariableLink } from "@/components/ui";

const LEVELS = [
  { v: "", label: "All levels" },
  { v: "national", label: "National" },
  { v: "province", label: "Province" },
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
    "rounded-lg border border-ink-border bg-ink-panel px-3 py-2.5 text-sm text-ink-text focus:border-ink-accent focus:outline-none";

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-ink-text">Variables</h1>
        <p className="mt-1 text-sm text-ink-muted">
          {data ? `${formatNumber(data.count)} indicators` : "Loading…"}
          {(category || adminLevel) && " matching your filters"} — click one to chart its time series.
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="Search (e.g. harapan hidup, kemiskinan, inflasi)…"
          className="flex-1 rounded-lg border border-ink-border bg-ink-panel px-4 py-2.5 text-sm text-ink-text placeholder:text-ink-muted focus:border-ink-accent focus:outline-none"
        />
        <select value={category} onChange={(e) => setCategory(e.target.value)} className={selectClass}>
          <option value="">All categories</option>
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

      <Panel className="p-0 overflow-hidden">
        <div className="overflow-x-auto scroll-thin">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink-border text-left text-xs uppercase tracking-wide text-ink-muted">
                <th className="px-4 py-3 font-medium">Indicator</th>
                <th className="px-4 py-3 font-medium">Category</th>
                <th className="px-4 py-3 font-medium">Levels</th>
                <th className="px-4 py-3 font-medium text-right">Years</th>
                <th className="px-4 py-3 font-medium text-right">Data points</th>
              </tr>
            </thead>
            <tbody>
              {data?.results.map((v) => (
                <tr key={v.id} className="border-b border-ink-border/50 hover:bg-ink-panel2/40">
                  <td className="px-4 py-3">
                    <VariableLink variableId={v.variable_id}>{v.name}</VariableLink>
                    {v.unit && <span className="ml-2 text-xs text-ink-muted">({v.unit})</span>}
                  </td>
                  <td className="px-4 py-3">
                    <Badge>{v.subject_category}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      {(v.admin_levels ?? []).map((l) => (
                        <span key={l} className="text-xs text-ink-muted" title={l}>
                          {l[0].toUpperCase()}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-ink-muted">
                    {v.year_min && v.year_max ? `${v.year_min}–${v.year_max}` : "–"}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-ink-text">
                    {formatNumber(v.data_point_count)}
                  </td>
                </tr>
              ))}
              {data && data.results.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-ink-muted">
                    No indicators match your filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="flex items-center justify-between text-sm text-ink-muted">
        <span>{loading ? "Loading…" : `Page ${page} of ${formatNumber(totalPages)}`}</span>
        <div className="flex gap-2">
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="rounded-lg border border-ink-border px-3 py-1.5 disabled:opacity-40 hover:bg-ink-panel2"
          >
            ← Prev
          </button>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="rounded-lg border border-ink-border px-3 py-1.5 disabled:opacity-40 hover:bg-ink-panel2"
          >
            Next →
          </button>
        </div>
      </div>
    </div>
  );
}
