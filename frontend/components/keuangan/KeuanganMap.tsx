"use client";

import { useEffect, useMemo, useState } from "react";
import { djpkApi, formatRupiah, type DjpkMeasure, type DjpkRank, type DjpkRegionLevel } from "@/lib/api";
import { ChoroplethMap, type MapValue } from "@/components/ChoroplethMap";
import { Panel, SectionTitle } from "@/components/ui";

// The Dukcapil choropleth geojson is keyed by `domain_id` = Kemendagri wilayah
// code (prov 2-digit / regency 4-digit) — exactly the `kemendagri_code` the
// DJPK crosswalk attaches to every region. So the same geojson serves the
// finance map; we just key `values` by kemendagri_code instead of djpk_code.
const GEOJSON: Record<DjpkRegionLevel, string> = {
  province: "/dukcapil-provinces.geojson",
  regency: "/dukcapil-regencies.geojson",
};

export function KeuanganMap({
  akun,
  label,
  level,
  measure,
  tahun,
}: {
  akun: string;
  label: string;
  level: DjpkRegionLevel;
  measure: DjpkMeasure;
  tahun: number;
}) {
  const [data, setData] = useState<DjpkRank | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    setData(null);
    djpkApi
      .rank({ akun, measure, level, tahun: String(tahun), limit: "600" })
      .then(setData)
      .finally(() => setLoading(false));
  }, [akun, measure, level, tahun]);

  const isPct = measure === "persentase";
  // Rupiah measures: scale to miliar so the legend/tooltip stay readable
  // (linear scaling leaves the colour ramp unchanged). Keep the exact figure in
  // the tooltip `sub` via formatRupiah. Percentage measures pass through as-is.
  const div = isPct ? 1 : 1e9;
  const unit = isPct ? "%" : "miliar Rp";

  const values = useMemo(() => {
    const m = new Map<string, MapValue>();
    (data?.results ?? []).forEach((r) => {
      if (!r.kemendagri_code) return; // unmapped region — can't place on the map
      m.set(r.kemendagri_code, {
        value: r.value / div,
        name: r.domain_name,
        sub: isPct ? `${r.value.toLocaleString("id-ID", { maximumFractionDigits: 1 })}%` : formatRupiah(r.value),
      });
    });
    return m;
  }, [data, div, isPct]);

  const nums = Array.from(values.values()).map((v) => v.value);
  const min = nums.length ? Math.min(...nums) : 0;
  const max = nums.length ? Math.max(...nums) : 1;

  return (
    <Panel>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <SectionTitle hint={loading ? "memuat…" : `${values.size} wilayah`}>
          {label} <span className="font-normal text-ink-muted">({unit})</span>
        </SectionTitle>
      </div>
      <ChoroplethMap values={values} min={min} max={max} unit={unit} geojsonUrls={[GEOJSON[level]]} />
    </Panel>
  );
}
