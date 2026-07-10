"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  api,
  formatNumber,
  type DataPoint,
  type Dimensions,
  type Region,
} from "@/lib/api";
import { Badge, Panel, SectionTitle } from "@/components/ui";
import { SeriesChart, type SeriesEntity } from "@/components/SeriesChart";

const LEVEL_LABEL: Record<string, string> = {
  national: "National",
  province: "Province",
  regency: "Kabupaten/Kota",
};

// BPS domain codes encode the admin level: 0000 national, NN00 province,
// anything else a kabupaten/kota. Lets a ?region= deep-link pick the level.
function levelFromDomainId(id: string): string {
  if (id === "0000") return "national";
  if (/^\d{2}00$/.test(id)) return "province";
  return "regency";
}

export default function VariableDetailPage({ params }: { params: { variableId: string } }) {
  const { variableId } = params;
  const [dims, setDims] = useState<Dimensions | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [turvarId, setTurvarId] = useState<string>("");
  const [adminLevel, setAdminLevel] = useState<string>("");
  const [regions, setRegions] = useState<Region[]>([]);
  const [selected, setSelected] = useState<string[]>([]); // domain_ids (geographic) or vervar_ids (non-geo)
  const [regionSearch, setRegionSearch] = useState("");

  const [points, setPoints] = useState<DataPoint[]>([]);
  const [loading, setLoading] = useState(false);

  const isGeographic = useMemo(
    () => !!dims && dims.admin_levels.some((l) => l === "province" || l === "regency"),
    [dims]
  );

  // 1) Load dimensions and set sensible defaults. Honors a ?region= deep
  //    link (from the region pages) by pre-focusing that region's level.
  useEffect(() => {
    const preRegion =
      typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("region") : null;
    api
      .dimensions(variableId)
      .then((d) => {
        setDims(d);
        const total = d.turvars.find((t) => t.turvar_id === "0");
        setTurvarId(total ? total.turvar_id : d.turvars[0]?.turvar_id ?? "");
        const geo = d.admin_levels.some((l) => l === "province" || l === "regency");
        if (geo) {
          const preLevel = preRegion ? levelFromDomainId(preRegion) : null;
          if (preRegion && preLevel && d.admin_levels.includes(preLevel)) {
            setAdminLevel(preLevel);
            setSelected([preRegion]);
          } else {
            setAdminLevel(d.admin_levels.includes("province") ? "province" : d.admin_levels[0]);
          }
        } else {
          // Non-geographic: compare the first few vervar classifications.
          setSelected(d.vervars.slice(0, 6).map((v) => v.vervar_id));
        }
      })
      .catch((e) => setError(String(e)));
  }, [variableId]);

  // 2) Geographic: load the region list for the chosen admin level. Keep any
  //    already-selected regions that belong to this level (so a deep-linked
  //    region survives); otherwise default to the first few.
  useEffect(() => {
    if (!isGeographic || !adminLevel) return;
    api.regions({ admin_level: adminLevel }).then((rs) => {
      setRegions(rs);
      const ids = new Set(rs.map((r) => r.domain_id));
      setSelected((cur) => (cur.some((id) => ids.has(id)) ? cur : rs.slice(0, 5).map((r) => r.domain_id)));
    });
  }, [isGeographic, adminLevel]);

  // 3) Fetch the series whenever the selection changes.
  useEffect(() => {
    if (!dims || !turvarId) return;
    if (isGeographic && selected.length === 0) {
      setPoints([]);
      return;
    }
    setLoading(true);
    const p: Record<string, string | string[]> = { turvar_id: turvarId };
    if (isGeographic) p.domain_id = selected;
    else p.admin_level = "national";
    api
      .series(variableId, p)
      .then((s) => setPoints(s.results))
      .finally(() => setLoading(false));
  }, [dims, isGeographic, turvarId, selected, variableId]);

  // Pivot points -> chart rows + entities.
  const { rows, entities } = useMemo(() => {
    if (!dims) return { rows: [], entities: [] as SeriesEntity[] };
    const keyOf = (p: DataPoint) => (isGeographic ? p.domain_id : p.vervar_id);
    const labelOf = (p: DataPoint) => (isGeographic ? p.domain_name : p.vervar_label || p.vervar_id);
    const allow = new Set(selected);
    const labels = new Map<string, string>();
    const byYear = new Map<number, Record<string, number | null>>();
    for (const p of points) {
      const k = keyOf(p);
      if (!isGeographic && !allow.has(k)) continue; // non-geo: only selected vervars
      if (p.year === null) continue;
      if (!labels.has(k)) labels.set(k, labelOf(p));
      const row = byYear.get(p.year) ?? { year: p.year };
      row[k] = p.value;
      byYear.set(p.year, row);
    }
    const orderedKeys = isGeographic ? selected : selected.filter((k) => labels.has(k));
    const rows = [...byYear.values()].sort((a, b) => (a.year as number) - (b.year as number));
    const entities: SeriesEntity[] = orderedKeys
      .filter((k) => labels.has(k))
      .map((k) => ({ key: k, label: labels.get(k)! }));
    return { rows, entities };
  }, [points, dims, isGeographic, selected]);

  if (error) return <div className="text-ink-muted">Failed to load: {error}</div>;
  if (!dims) return <div className="text-ink-muted">Loading…</div>;

  const chooserItems: { id: string; label: string }[] = isGeographic
    ? regions
        .filter((r) => !regionSearch || r.domain_name.toLowerCase().includes(regionSearch.toLowerCase()))
        .map((r) => ({ id: r.domain_id, label: r.domain_name }))
    : dims.vervars.map((v) => ({ id: v.vervar_id, label: v.vervar_label || v.vervar_id }));

  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id].slice(-8)));

  return (
    <div className="space-y-6">
      <div>
        <Link href="/variables" className="text-sm text-ink-muted hover:text-ink-text">
          ← Variables
        </Link>
        <h1 className="mt-1 text-2xl font-semibold text-ink-text">{dims.name}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-ink-muted">
          {dims.unit && <Badge tone="accent">{dims.unit}</Badge>}
          <Badge>
            {dims.years.length ? `${dims.years[0]}–${dims.years[dims.years.length - 1]}` : "no years"}
          </Badge>
          {dims.admin_levels.map((l) => (
            <Badge key={l}>{LEVEL_LABEL[l] ?? l}</Badge>
          ))}
          <span>variable_id {dims.variable_id}</span>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        {/* Controls */}
        <div className="space-y-4">
          {dims.turvars.length > 1 && (
            <Panel>
              <SectionTitle>Breakdown</SectionTitle>
              <select
                value={turvarId}
                onChange={(e) => setTurvarId(e.target.value)}
                className="w-full rounded-lg border border-ink-border bg-ink-panel2 px-3 py-2 text-sm text-ink-text focus:border-ink-accent focus:outline-none"
              >
                {dims.turvars.map((t) => (
                  <option key={t.turvar_id} value={t.turvar_id}>
                    {t.turvar_label || `turvar ${t.turvar_id}`}
                  </option>
                ))}
              </select>
            </Panel>
          )}

          <Panel>
            <SectionTitle hint="pick up to 8">{isGeographic ? "Regions" : "Classifications"}</SectionTitle>
            {isGeographic && dims.admin_levels.length > 1 && (
              <div className="mb-3 flex gap-1">
                {dims.admin_levels.map((l) => (
                  <button
                    key={l}
                    onClick={() => setAdminLevel(l)}
                    className={`rounded-md px-2 py-1 text-xs ${
                      adminLevel === l
                        ? "bg-brand-gradient text-white shadow-glow"
                        : "border border-ink-border text-ink-muted hover:bg-ink-panel2"
                    }`}
                  >
                    {LEVEL_LABEL[l] ?? l}
                  </button>
                ))}
              </div>
            )}
            {isGeographic && (
              <input
                value={regionSearch}
                onChange={(e) => setRegionSearch(e.target.value)}
                placeholder="Filter…"
                className="mb-2 w-full rounded-lg border border-ink-border bg-ink-panel2 px-3 py-1.5 text-sm text-ink-text placeholder:text-ink-muted focus:border-ink-accent focus:outline-none"
              />
            )}
            <div className="max-h-72 space-y-1 overflow-y-auto scroll-thin pr-1">
              {chooserItems.map((it) => (
                <label
                  key={it.id}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-sm text-ink-text hover:bg-ink-panel2"
                >
                  <input
                    type="checkbox"
                    checked={selected.includes(it.id)}
                    onChange={() => toggle(it.id)}
                    className="accent-ink-accent"
                  />
                  <span className="truncate">{it.label}</span>
                </label>
              ))}
            </div>
          </Panel>
        </div>

        {/* Chart + table */}
        <div className="space-y-6">
          <Panel>
            <SectionTitle hint={loading ? "loading…" : `${entities.length} series · ${rows.length} periods`}>
              Time series
            </SectionTitle>
            <SeriesChart rows={rows} entities={entities} unit={dims.unit} />
          </Panel>

          <Panel className="p-0 overflow-hidden">
            <div className="border-b border-ink-border px-4 py-3">
              <SectionTitle>Raw values</SectionTitle>
            </div>
            <div className="max-h-80 overflow-auto scroll-thin">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-ink-panel">
                  <tr className="text-left text-xs uppercase tracking-wide text-ink-muted">
                    <th className="px-4 py-2 font-medium">Year</th>
                    <th className="px-4 py-2 font-medium">{isGeographic ? "Region" : "Classification"}</th>
                    <th className="px-4 py-2 font-medium">Breakdown</th>
                    <th className="px-4 py-2 font-medium text-right">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {points
                    .filter((p) => (isGeographic ? true : selected.includes(p.vervar_id)))
                    .slice(0, 500)
                    .map((p, i) => (
                      <tr key={i} className="border-b border-ink-border/40">
                        <td className="px-4 py-1.5 tabular-nums text-ink-muted">{p.year}</td>
                        <td className="px-4 py-1.5">{isGeographic ? p.domain_name : p.vervar_label}</td>
                        <td className="px-4 py-1.5 text-ink-muted">{p.turvar_label || "—"}</td>
                        <td className="px-4 py-1.5 text-right tabular-nums text-ink-text">
                          {formatNumber(p.value)}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
