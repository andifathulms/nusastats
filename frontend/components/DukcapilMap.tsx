"use client";

import { useEffect, useMemo, useState } from "react";
import { dukcapilApi, formatNumber, type DukcapilRank } from "@/lib/api";
import { ChoroplethMap, type MapValue } from "@/components/ChoroplethMap";
import { Panel, SectionTitle } from "@/components/ui";

// Crosswalk: Dukcapil province codes are the 2-digit Kemendagri/BPS province
// number ("12" = Sumut); the map geojson keys provinces by the 4-digit BPS
// domain id ("1200"). So the crosswalk is simply <prov_code>00. The geojson
// predates the 2022–24 Papua split, so the 4 new Papua provinces (92/93/95/96)
// have no polygon — they still appear in the ranking list below, just uncolored.
function toGeoId(provCode: string): string {
  return `${provCode}00`;
}

export function DukcapilMap({
  indicator,
  label,
  unit,
}: {
  indicator: string;
  label: string;
  unit: string;
}) {
  const [rank, setRank] = useState<DukcapilRank | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    dukcapilApi
      .rank({ indicator, level: "province", order: "desc" })
      .then(setRank)
      .finally(() => setLoading(false));
  }, [indicator]);

  const values = useMemo(() => {
    const m = new Map<string, MapValue>();
    rank?.results.forEach((r) => m.set(toGeoId(r.domain_id), { value: r.value, name: r.domain_name }));
    return m;
  }, [rank]);

  const unmapped = rank?.results.filter((r) => ["92", "93", "95", "96"].includes(r.domain_id)) ?? [];

  return (
    <Panel>
      <SectionTitle hint={`per provinsi · ${unit || "nilai"}${loading ? " · memuat…" : ""}`}>
        {label}
      </SectionTitle>
      <ChoroplethMap
        values={values}
        min={rank?.stats.min ?? 0}
        max={rank?.stats.max ?? 1}
        unit={unit}
      />
      <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
        {rank?.results.slice(0, 6).map((r) => (
          <div key={r.domain_id} className="flex items-baseline justify-between">
            <span className="truncate text-ink-text">
              {r.rank}. {r.domain_name}
            </span>
            <span className="tabular-nums text-ink-muted">{formatNumber(r.value)}</span>
          </div>
        ))}
      </div>
      {unmapped.length > 0 && (
        <p className="mt-3 text-xs text-ink-muted">
          {unmapped.length} provinsi baru (pemekaran Papua) belum ada di peta dasar — tetap tampil di peringkat.
        </p>
      )}
    </Panel>
  );
}
