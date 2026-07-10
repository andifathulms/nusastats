"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { dukcapilApi, formatNumber, regionLabel, type DukcapilRank, type DukcapilRegionRow } from "@/lib/api";
import { ChoroplethMap, type MapValue } from "@/components/ChoroplethMap";
import { Panel, SectionTitle } from "@/components/ui";

// Map geojson comes from the same Dukcapil ArcGIS service as the data, so its
// `domain_id` is exactly the Dukcapil region code (prov=2 / kab=4 / kec=6
// digits) — the ranking's domain_id matches directly, and a province code is a
// prefix of its regencies'/districts' codes (used by the filter).
const GEOJSON: Record<MapLevel, string> = {
  province: "/dukcapil-provinces.geojson",
  regency: "/dukcapil-regencies.geojson",
  district: "/dukcapil-districts.geojson",
};
type MapLevel = "province" | "regency" | "district";
const MAP_LEVELS: [MapLevel, string][] = [
  ["province", "Provinsi"],
  ["regency", "Kabupaten/Kota"],
  ["district", "Kecamatan"],
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
  const [provinces, setProvinces] = useState<DukcapilRegionRow[]>([]);
  const [selProvs, setSelProvs] = useState<string[]>([]);
  const [rank, setRank] = useState<DukcapilRank | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    dukcapilApi.regions({ level: "province" }).then(setProvinces);
  }, []);

  useEffect(() => {
    setLoading(true);
    setRank(null);
    dukcapilApi
      .rank({ indicator, level: mapLevel, order: "desc", ...(percentOf ? { percent_of: percentOf } : {}) })
      .then(setRank)
      .finally(() => setLoading(false));
  }, [indicator, mapLevel, percentOf]);

  // The visible rows (filtered to the selected provinces). Both the colour
  // scale and the top-list are computed from these, so the filtered view gets
  // the full colour range rather than being squished by nationwide extremes.
  const visible = useMemo(() => {
    const rows = rank?.results ?? [];
    if (!selProvs.length) return rows;
    return rows.filter((r) => selProvs.some((p) => r.domain_id.startsWith(p)));
  }, [rank, selProvs]);

  const values = useMemo(() => {
    const m = new Map<string, MapValue>();
    visible.forEach((r) => m.set(r.domain_id, { value: r.value, name: regionLabel(r.domain_name, r.status) }));
    return m;
  }, [visible]);

  const nums = visible.map((r) => r.value);
  const min = nums.length ? Math.min(...nums) : 0;
  const max = nums.length ? Math.max(...nums) : 1;
  const effUnit = rank?.unit || (percentOf ? "%" : unit);
  const fmt = (v: number | null) => (percentOf ? `${v ?? "–"}%` : formatNumber(v));

  // Kecamatan nationwide is too dense/heavy to be useful — require a province.
  const needFilter = mapLevel === "district" && selProvs.length === 0;

  return (
    <Panel>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <SectionTitle hint={loading ? "memuat…" : `${visible.length} wilayah`}>
          {label} {effUnit && <span>({effUnit})</span>}
        </SectionTitle>
        <div className="flex flex-wrap items-center gap-2">
          <ProvinceFilter provinces={provinces} selected={selProvs} onChange={setSelProvs} />
          <div className="inline-flex gap-1 rounded-lg border border-ink-border/80 bg-ink-panel/50 p-0.5">
            {MAP_LEVELS.map(([v, lbl]) => (
              <button
                key={v}
                onClick={() => setMapLevel(v)}
                className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                  mapLevel === v ? "bg-brand-gradient text-white" : "text-ink-muted hover:bg-ink-panel2/70 hover:text-ink-text"
                }`}
              >
                {lbl}
              </button>
            ))}
          </div>
        </div>
      </div>

      {needFilter ? (
        <div className="flex h-64 items-center justify-center px-6 text-center text-sm text-ink-muted">
          Peta kecamatan padat — pilih satu atau beberapa provinsi di filter untuk menampilkannya.
        </div>
      ) : (
        <>
          <ChoroplethMap
            values={values}
            min={min}
            max={max}
            unit={effUnit}
            geojsonUrl={GEOJSON[mapLevel]}
            provFilter={selProvs}
          />
          <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
            {visible.slice(0, 6).map((r, i) => (
              <div key={r.domain_id} className="flex items-baseline justify-between">
                <span className="truncate text-ink-text">
                  {i + 1}. {regionLabel(r.domain_name, r.status)}
                </span>
                <span className="tabular-nums text-ink-muted">{fmt(r.value)}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </Panel>
  );
}

function ProvinceFilter({
  provinces,
  selected,
  onChange,
}: {
  provinces: DukcapilRegionRow[];
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const toggle = (code: string) =>
    onChange(selected.includes(code) ? selected.filter((c) => c !== code) : [...selected, code]);

  const labelText = selected.length === 0 ? "Semua provinsi" : `${selected.length} provinsi`;

  return (
    <div ref={boxRef} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="rounded-lg border border-ink-border bg-ink-panel px-3 py-1.5 text-xs text-ink-text hover:border-ink-accent/60"
      >
        Filter: {labelText} ▾
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-1 w-60 rounded-lg border border-ink-border bg-ink-panel shadow-xl shadow-black/40">
          <div className="flex items-center justify-between border-b border-ink-border px-3 py-2 text-xs">
            <span className="text-ink-muted">{selected.length} dipilih</span>
            <button onClick={() => onChange([])} className="text-ink-accent hover:underline">
              Bersihkan
            </button>
          </div>
          <div className="max-h-64 overflow-y-auto scroll-thin py-1">
            {provinces.map((p) => (
              <label
                key={p.code}
                className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm hover:bg-ink-panel2"
              >
                <input
                  type="checkbox"
                  checked={selected.includes(p.code)}
                  onChange={() => toggle(p.code)}
                  className="accent-[#8b5e3c]"
                />
                <span className="truncate text-ink-text">{p.name}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
