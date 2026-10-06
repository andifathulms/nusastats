// Peta Wilayah: terrain & land cover outputs written by the data/peta_wilayah
// pipeline to public/peta/{kode}/ (Kemendagri kode, 2/4/6 digits). Static files,
// not an API: an area that has not been computed simply has no bounds.json.

export type PetaBounds = {
  kode: string;
  crs: "EPSG:4326";
  west: number;
  south: number;
  east: number;
  north: number;
  width: number;
  height: number;
  layers: Partial<Record<"hillshade" | "elevation" | "landcover" | "lowland" | "relief" | "nightlights", string>>;
};

export type PetaProvinsi = { kode: string; name: string };

export type PetaTerrain = {
  kode: string;
  name: string;
  level: string;
  provinsi: PetaProvinsi;
  area_km2: number;
  elevation_m: { min: number; max: number; mean: number; median: number; p5: number; p95: number };
  relief_m: number;
  highest_point: { elevation_m: number; lon: number; lat: number };
  elevation_bands_pct: Record<string, number>;
  slope_deg: { mean: number };
  slope_classes_pct: Record<string, number>;
  metrics_pct: Record<"share_elev_ge_1000" | "share_elev_ge_200" | "share_elev_lt_100" | "share_slope_ge_25" | "share_slope_ge_8" | "share_slope_lt_8", number>;
  // Present once an area is computed with the lowland/relief step (absent in older outputs).
  lowland_pct?: { lt_5: number; lt_10: number };
  local_relief?: {
    window_m: number;
    mean_m: number;
    breaks_m: number[];
    classes_pct: { datar: number; bergelombang: number; berbukit: number; bergunung: number };
  };
  terrain_class: string;
  terrain_class_label: string;
  terrain_class_reason: string;
  classification: { official: boolean; note: string };
  metadata: {
    dataset: string;
    year: number;
    attribution: string;
    tint: [number, string][];
    lowland_colors?: [string, string];
    relief_colors?: [string, string, string, string];
  };
};

export type PetaLandcoverClass = {
  code: number;
  name: string;
  label: string;
  color: string;
  share_pct: number;
  area_km2: number;
};

export type PetaLandcover = {
  kode: string;
  name: string;
  provinsi: PetaProvinsi;
  year: number;
  area_km2: number;
  dominant: { code: number; label: string; share_pct: number };
  classes: PetaLandcoverClass[];
  metadata: { dataset: string; version: string; attribution: string; caveat: string };
};

type LayerKey = keyof PetaBounds["layers"];

// `present` = image layers whose file actually exists. Map images are generated
// locally and not committed (only the stats JSON is), so a checkout can list a
// layer in bounds.json without having its image.
export type PetaNightlightsYear = {
  mean_nw: number;
  lit_pct: number;
  lit_km2: number;
  sum_lit: number;
  nodata_pct: number;
  months: number;
};

export type PetaNightlights = {
  kode: string;
  name: string;
  provinsi: PetaProvinsi;
  unit: string;
  lit_threshold_nw: number;
  base_year: number;
  latest_year: number;
  years: Record<string, PetaNightlightsYear>;
  years_skipped?: Record<string, string>; // year -> why it was left out (e.g. too cloudy)
  growth: { lit_km2_x: number | null; sum_lit_x: number | null; lit_pct_change_pp: number | null; note?: string };
  metadata: { dataset: string; attribution: string; license: string; note: string; colors: string[]; max_radiance_nw: number };
};

export type Peta = {
  bounds: PetaBounds;
  terrain: PetaTerrain | null;
  landcover: PetaLandcover | null;
  nightlights: PetaNightlights | null;
  present: Partial<Record<LayerKey, boolean>>;
};

export const petaAsset = (kode: string, file: string) => `/peta/${kode}/${file}`;

// A growth ratio over an almost-dark base (e.g. 0,08 → 5 km², "×55") is real light
// but a misleading headline. Below this base lit area, show "dari <1 km²" instead.
export const MIN_BASE_LIT_KM2 = 1;

/** Lit-area growth multiplier, or null when there is no fair base to divide by. */
export function litGrowth(nl: PetaNightlights): number | null {
  const base = nl.years[String(nl.base_year)];
  if (!base || nl.growth.lit_km2_x === null || base.lit_km2 < MIN_BASE_LIT_KM2) return null;
  return nl.growth.lit_km2_x;
}

async function optionalJson<T>(url: string): Promise<T | null> {
  const r = await fetch(url);
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`${url} -> ${r.status}`);
  return r.json();
}

/** null = not computed for this area (no bounds.json). Throws on real failures. */
export async function loadPeta(kode: string): Promise<Peta | null> {
  const [bounds, terrain, landcover, nightlights] = await Promise.all([
    optionalJson<PetaBounds>(petaAsset(kode, "bounds.json")),
    optionalJson<PetaTerrain>(petaAsset(kode, "terrain.json")),
    optionalJson<PetaLandcover>(petaAsset(kode, "landcover.json")),
    optionalJson<PetaNightlights>(petaAsset(kode, "nightlights.json")),
  ]);
  if (!bounds) return null;
  const keys = Object.keys(bounds.layers) as LayerKey[];
  const found = await Promise.all(
    keys.map((k) =>
      fetch(petaAsset(kode, bounds.layers[k]!), { method: "HEAD" })
        .then((r) => r.ok)
        .catch(() => false)
    )
  );
  const present = Object.fromEntries(keys.map((k, i) => [k, found[i]])) as Peta["present"];
  return { bounds, terrain, landcover, nightlights, present };
}
