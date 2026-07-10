"use client";

import { useEffect, useMemo, useState } from "react";
import { dukcapilApi, formatNumber, type DukcapilRank } from "@/lib/api";
import { ChoroplethMap, type MapValue } from "@/components/ChoroplethMap";
import { Panel, SectionTitle } from "@/components/ui";

// The map geojson is sourced from the same Dukcapil ArcGIS service as the
// data, so its `domain_id` is exactly the Dukcapil region code (prov_code /
// kab_code) — the ranking's domain_id matches it directly, no crosswalk.
const GEOJSON: Record<MapLevel, string> = {
  province: "/dukcapil-provinces.geojson",
  regency: "/dukcapil-regencies.geojson",
};
type MapLevel = "province" | "regency";
const MAP_LEVELS: [MapLevel, string][] = [
  ["province", "Provinsi"],
  ["regency", "Kabupaten/Kota"],
];

export function DukcapilMap({
  indicator,
  label,
  unit,
  percentOf,
}: {
  indicator: string;
  label: string;
  unit: string;
  percentOf: string | null;
}) {
  const [mapLevel, setMapLevel] = useState<MapLevel>("province");
  const [rank, setRank] = useState<DukcapilRank | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    setRank(null);
    dukcapilApi
      .rank({
        indicator,
        level: mapLevel,
        order: "desc",
        ...(percentOf ? { percent_of: percentOf } : {}),
      })
      .then(setRank)
      .finally(() => setLoading(false));
  }, [indicator, mapLevel, percentOf]);

  const values = useMemo(() => {
    const m = new Map<string, MapValue>();
    rank?.results.forEach((r) => m.set(r.domain_id, { value: r.value, name: r.domain_name }));
    return m;
  }, [rank]);

  const effUnit = rank?.unit || (percentOf ? "%" : unit);
  const fmt = (v: number | null) => (percentOf ? `${v ?? "–"}%` : formatNumber(v));

  return (
    <Panel>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <SectionTitle hint={`per ${mapLevel === "province" ? "provinsi" : "kab/kota"}${loading ? " · memuat…" : ""}`}>
          {label} {effUnit && <span>({effUnit})</span>}
        </SectionTitle>
        <div className="inline-flex gap-1 rounded-lg border border-ink-border/80 bg-ink-panel/50 p-0.5">
          {MAP_LEVELS.map(([v, lbl]) => (
            <button
              key={v}
              onClick={() => setMapLevel(v)}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                mapLevel === v
                  ? "bg-brand-gradient text-white"
                  : "text-ink-muted hover:bg-ink-panel2/70 hover:text-ink-text"
              }`}
            >
              {lbl}
            </button>
          ))}
        </div>
      </div>
      <ChoroplethMap
        values={values}
        min={rank?.stats.min ?? 0}
        max={rank?.stats.max ?? 1}
        unit={effUnit}
        geojsonUrl={GEOJSON[mapLevel]}
      />
      <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
        {rank?.results.slice(0, 6).map((r) => (
          <div key={r.domain_id} className="flex items-baseline justify-between">
            <span className="truncate text-ink-text">
              {r.rank}. {r.domain_name}
            </span>
            <span className="tabular-nums text-ink-muted">{fmt(r.value)}</span>
          </div>
        ))}
      </div>
    </Panel>
  );
}
