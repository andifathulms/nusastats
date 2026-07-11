"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { dukcapilApi, formatNumber, regionLabel, type DukcapilRank, type DukcapilRegionRow } from "@/lib/api";
import { ChoroplethMap, type MapValue } from "@/components/ChoroplethMap";
import { Panel, SectionTitle } from "@/components/ui";

// Map geojson comes from the same Dukcapil ArcGIS service as the data, so its
// `domain_id` is exactly the Dukcapil region code (prov=2 / kab=4 / kec=6 /
// desa=10 digits) — the ranking's domain_id matches directly, and an ancestor
// code is a prefix of its descendants' codes (used by the filter).
const SINGLE_GEOJSON: Record<"province" | "regency" | "district", string> = {
  province: "/dukcapil-provinces.geojson",
  regency: "/dukcapil-regencies.geojson",
  district: "/dukcapil-districts.geojson",
};
type MapLevel = "province" | "regency" | "district" | "village";
const MAP_LEVELS: [MapLevel, string][] = [
  ["province", "Provinsi"],
  ["regency", "Kabupaten/Kota"],
  ["district", "Kecamatan"],
  ["village", "Desa/Kelurahan"],
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
  const [regencies, setRegencies] = useState<DukcapilRegionRow[]>([]);
  const [selProvs, setSelProvs] = useState<string[]>([]);
  const [selKabs, setSelKabs] = useState<string[]>([]);
  const [rank, setRank] = useState<DukcapilRank | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    dukcapilApi.regions({ level: "province" }).then(setProvinces);
  }, []);

  // Kabupaten options follow the selected provinces; drop any selected kab
  // whose province is no longer selected.
  const provKeyAll = selProvs.join(",");
  useEffect(() => {
    if (!selProvs.length) {
      setRegencies([]);
      return;
    }
    Promise.all(selProvs.map((p) => dukcapilApi.regions({ level: "regency", prov: p }))).then((rs) =>
      setRegencies(rs.flat())
    );
    setSelKabs((kabs) => kabs.filter((k) => selProvs.includes(k.slice(0, 2))));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provKeyAll]);

  // Effective filter: the selected kabupaten (4-digit) if any, else the
  // selected provinces (2-digit). Village geometry/values still load by
  // province (that's how the files/queries are chunked).
  const filterPrefixes = selKabs.length ? selKabs : selProvs;
  const loadProvs = selKabs.length ? Array.from(new Set(selKabs.map((k) => k.slice(0, 2)))) : selProvs;
  const prefixKey = filterPrefixes.join(",");

  const provKey = mapLevel === "village" ? loadProvs.join(",") : "";
  useEffect(() => {
    if ((mapLevel === "district" || mapLevel === "village") && !selProvs.length) {
      setRank(null);
      return;
    }
    setLoading(true);
    setRank(null);
    const base: Record<string, string> = {
      indicator,
      order: "desc",
      ...(percentOf ? { percent_of: percentOf } : {}),
    };
    const calls =
      mapLevel === "village"
        ? loadProvs.map((p) => dukcapilApi.rank({ ...base, level: "village", prov: p }))
        : [dukcapilApi.rank({ ...base, level: mapLevel })];
    Promise.all(calls)
      .then((rs) => {
        const first = rs.find(Boolean);
        setRank(first ? { ...first, results: rs.flatMap((r) => r.results) } : null);
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indicator, mapLevel, percentOf, provKey]);

  // Visible rows = filtered to the selection. Colour scale + top-list use
  // these, so a filtered view gets the full colour range.
  const visible = useMemo(() => {
    const rows = rank?.results ?? [];
    if (!filterPrefixes.length) return rows;
    return rows.filter((r) => filterPrefixes.some((p) => r.domain_id.startsWith(p)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rank, prefixKey]);

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

  const needFilter = (mapLevel === "district" || mapLevel === "village") && selProvs.length === 0;
  const geojsonUrls =
    mapLevel === "village"
      ? loadProvs.map((p) => `/dukcapil-villages-${p}.geojson`)
      : [SINGLE_GEOJSON[mapLevel]];

  return (
    <Panel>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <SectionTitle hint={loading ? "memuat…" : `${visible.length} wilayah`}>
          {label} {effUnit && <span>({effUnit})</span>}
        </SectionTitle>
        <div className="flex flex-wrap items-center gap-2">
          <MultiSelect label="Provinsi" options={provinces} selected={selProvs} onChange={setSelProvs} />
          <MultiSelect
            label="Kab/Kota"
            options={regencies}
            selected={selKabs}
            onChange={setSelKabs}
            disabled={!selProvs.length}
          />
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
          Peta {mapLevel === "village" ? "desa/kelurahan" : "kecamatan"} padat — pilih satu atau beberapa
          provinsi (dan kab/kota) di filter untuk menampilkannya.
        </div>
      ) : (
        <>
          <ChoroplethMap
            values={values}
            min={min}
            max={max}
            unit={effUnit}
            geojsonUrls={geojsonUrls}
            provFilter={filterPrefixes}
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

function MultiSelect({
  label,
  options,
  selected,
  onChange,
  disabled,
}: {
  label: string;
  options: DukcapilRegionRow[];
  selected: string[];
  onChange: (v: string[]) => void;
  disabled?: boolean;
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

  const labelText = selected.length === 0 ? `Semua ${label.toLowerCase()}` : `${selected.length} dipilih`;

  return (
    <div ref={boxRef} className="relative">
      <button
        onClick={() => !disabled && setOpen((o) => !o)}
        disabled={disabled}
        className="rounded-lg border border-ink-border bg-ink-panel px-3 py-1.5 text-xs text-ink-text hover:border-ink-accent/60 disabled:opacity-40"
      >
        {label}: {labelText} ▾
      </button>
      {open && !disabled && (
        <div className="absolute right-0 z-30 mt-1 w-60 rounded-lg border border-ink-border bg-ink-panel shadow-xl shadow-black/40">
          <div className="flex items-center justify-between border-b border-ink-border px-3 py-2 text-xs">
            <span className="text-ink-muted">{selected.length} dipilih</span>
            <button onClick={() => onChange([])} className="text-ink-accent hover:underline">
              Bersihkan
            </button>
          </div>
          <div className="max-h-64 overflow-y-auto scroll-thin py-1">
            {options.map((o) => (
              <label
                key={o.code}
                className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm hover:bg-ink-panel2"
              >
                <input
                  type="checkbox"
                  checked={selected.includes(o.code)}
                  onChange={() => toggle(o.code)}
                  className="accent-[#1D4ED8]"
                />
                <span className="truncate text-ink-text">{regionLabel(o.name, o.status)}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
