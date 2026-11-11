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
  /** A province drawn from its kabupaten's own images (loadPetaMosaic): each tile's
   * image goes over its own bounds; `bounds` is then their union. */
  tiles?: { kode: string; bounds: PetaBounds }[];
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

/** A province's layers as a mosaic of its kabupaten/kota images (each is transparent
 * outside its own polygon). A layer counts as present only when every kabupaten has it,
 * so a province is never drawn with a hole. The land cover legend sums each class's km²
 * over the kabupaten, so its shares are the province's. null when any kabupaten has no
 * outputs at all. */
export async function loadPetaMosaic(kabs: string[]): Promise<Peta | null> {
  if (!kabs.length) return null;
  const parts = await Promise.all(kabs.map((k) => loadPeta(k)));
  if (parts.some((p) => !p)) return null;
  const all = parts as Peta[];
  const keys = Object.keys(all[0].bounds.layers) as LayerKey[];
  const present = Object.fromEntries(keys.map((k) => [k, all.every((p) => p.present[k])])) as Peta["present"];
  const bounds: PetaBounds = {
    ...all[0].bounds,
    kode: kabs[0].slice(0, 2),
    west: Math.min(...all.map((p) => p.bounds.west)),
    east: Math.max(...all.map((p) => p.bounds.east)),
    south: Math.min(...all.map((p) => p.bounds.south)),
    north: Math.max(...all.map((p) => p.bounds.north)),
  };
  let landcover: PetaLandcover | null = null;
  if (all.every((p) => p.landcover)) {
    const byCode = new Map<number, PetaLandcoverClass>();
    for (const p of all)
      for (const c of p.landcover!.classes) {
        const had = byCode.get(c.code);
        byCode.set(c.code, { ...c, area_km2: (had?.area_km2 ?? 0) + c.area_km2 });
      }
    const area = all.reduce((t, p) => t + p.landcover!.area_km2, 0);
    const classes = [...byCode.values()]
      .map((c) => ({ ...c, share_pct: (c.area_km2 / area) * 100 }))
      .sort((a, b) => b.area_km2 - a.area_km2);
    landcover = {
      ...all[0].landcover!,
      kode: bounds.kode,
      area_km2: area,
      classes,
      dominant: { code: classes[0].code, label: classes[0].label, share_pct: classes[0].share_pct },
    };
  }
  const terrain = all.every((p) => p.terrain)
    ? { ...all[0].terrain!, elevation_m: { ...all[0].terrain!.elevation_m, max: Math.max(...all.map((p) => p.terrain!.elevation_m.max)) } }
    : null;
  return { bounds, terrain, landcover, nightlights: null, present, tiles: all.map((p, i) => ({ kode: kabs[i], bounds: p.bounds })) };
}

/** The local relief classes (terrain.json local_relief), in order, as legend rows. */
export const RELIEF_CLASSES = ["datar", "bergelombang", "berbukit", "bergunung"] as const;
export function reliefLabels(breaks: number[]): string[] {
  const f = (m: number) => m.toLocaleString("id-ID");
  return [`Datar (<${f(breaks[0])} m)`, `Bergelombang (${f(breaks[0])}–${f(breaks[1])} m)`, `Berbukit (${f(breaks[1])}–${f(breaks[2])} m)`, `Bergunung (≥${f(breaks[2])} m)`];
}

/** Peta ranking metrics drawn over the local relief layer (the rest of the medan group
 * over the elevation tint, the tutupan group over land cover). */
export const RELIEF_METRICS = ["local_relief_mean", "relief_bergunung", "relief_datar"];
/** The Peta layer a Peta ranking's maps show. */
export const petaLayerFor = (metric: string): PaintLayer =>
  metric.startsWith("lc_") ? "landcover" : RELIEF_METRICS.includes(metric) ? "relief" : "terrain";

export type PaintLayer = "landcover" | "terrain" | "relief";
export type PaintTarget = { key: string; frame: { west: number; south: number; east: number; north: number }; vw: number; vh: number; px: number };
export type Painted = {
  layer: PaintLayer;
  images: Map<string, string>; // target key -> PNG data URL, sized vw x vh in its own viewBox
  // Land cover: summed over the kabupaten, largest first. Relief: its four classes in order,
  // each kabupaten's share × its area summed.
  classes: (PetaLandcoverClass & { share_pct: number })[];
  area_km2: number;
  elevation: { max: number; tint: [number, string][] } | null; // terrain: highest pixel over the kabupaten, colour stops
  missing: string[]; // kabupaten without the layer's image or stats
};

/** Several kabupaten's layer images painted into one canvas per target frame (an
 * overview's mainland and each inset box), so a whole province or island reads as land
 * cover or terrain. Each tile is fetched, decoded, drawn and released before the next, a
 * few at a time: Sulawesi's 81 tiles are 130 MP decoded. Land cover is drawn
 * nearest-neighbour (classes stay crisp), with each class's km² summed over the
 * kabupaten's landcover.json; terrain is the elevation tint with the hillshade multiplied
 * over it, as on the kabupaten cards, and the highest pixel from terrain.json; relief is the
 * local relief classes (nearest-neighbour) with the hillshade multiplied over them, each
 * class's km² from terrain.json's local_relief shares × the kabupaten's area. */
export async function paintLayer(layer: PaintLayer, kabs: string[], targets: PaintTarget[]): Promise<Painted> {
  const canvases = targets.map((t) => {
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(t.px));
    c.height = Math.max(1, Math.round((t.px * t.vh) / t.vw));
    const ctx = c.getContext("2d")!;
    const cosMid = Math.cos((((t.frame.south + t.frame.north) / 2) * Math.PI) / 180);
    const s = (c.width / ((t.frame.east - t.frame.west) * cosMid || 1));
    const to = (lon: number, lat: number): [number, number] => [(lon - t.frame.west) * s * cosMid, (t.frame.north - lat) * s];
    return { t, c, ctx, to };
  });
  const missing: string[] = [];
  const byCode = new Map<number, PetaLandcoverClass>();
  let reliefColors = null as string[] | null;
  let reliefBreaks = null as number[] | null;
  let area = 0;
  let elevation: Painted["elevation"] = null;
  const queue = [...kabs];
  const work = async () => {
    for (let kab = queue.shift(); kab; kab = queue.shift()) {
      const b = await optionalJson<PetaBounds>(petaAsset(kab, "bounds.json"));
      const files =
        layer === "landcover" ? [b?.layers.landcover] : layer === "relief" ? [b?.layers.relief, b?.layers.hillshade] : [b?.layers.elevation, b?.layers.hillshade];
      const stats =
        layer === "landcover"
          ? await optionalJson<PetaLandcover>(petaAsset(kab, "landcover.json"))
          : await optionalJson<PetaTerrain>(petaAsset(kab, "terrain.json"));
      const lr = layer === "relief" ? (stats as PetaTerrain | null)?.local_relief : null;
      if (!b || files.some((f) => !f) || !stats || (layer === "relief" && (!lr || !(stats as PetaTerrain).metadata.relief_colors))) {
        missing.push(kab);
        continue;
      }
      area += stats.area_km2;
      if (layer === "landcover")
        for (const c of (stats as PetaLandcover).classes) byCode.set(c.code, { ...c, area_km2: (byCode.get(c.code)?.area_km2 ?? 0) + c.area_km2 });
      else if (layer === "relief") {
        const t = stats as PetaTerrain;
        const sum = RELIEF_CLASSES.reduce((x, k) => x + lr!.classes_pct[k], 0);
        if (Math.abs(sum - 100) > 0.5) throw new Error(`relief ${kab}: kelas berjumlah ${sum.toFixed(2)}%`);
        reliefColors = t.metadata.relief_colors!;
        reliefBreaks = lr!.breaks_m;
        RELIEF_CLASSES.forEach((k, i) =>
          byCode.set(i, { code: i, name: k, label: k, color: "", share_pct: 0, area_km2: (byCode.get(i)?.area_km2 ?? 0) + (lr!.classes_pct[k] / 100) * t.area_km2 }));
      } else {
        const t = stats as PetaTerrain;
        elevation = { max: Math.max(elevation?.max ?? -Infinity, t.elevation_m.max), tint: t.metadata.tint };
      }
      const hits = canvases.filter(({ t }) => b.east > t.frame.west && b.west < t.frame.east && b.north > t.frame.south && b.south < t.frame.north);
      if (!hits.length) continue;
      // Elevation first, then its hillshade multiplied over it (transparent outside the
      // kabupaten, so neighbours are untouched).
      for (const [i, file] of files.entries()) {
        const r = await fetch(petaAsset(kab, file!));
        if (!r.ok) {
          missing.push(kab);
          break;
        }
        const bitmap = await createImageBitmap(await r.blob());
        for (const { ctx, to } of hits) {
          const [x0, y0] = to(b.west, b.north);
          const [x1, y1] = to(b.east, b.south);
          ctx.globalCompositeOperation = i === 1 ? "multiply" : "source-over";
          // Classes stay crisp; elevation and hillshade are smooth.
          ctx.imageSmoothingEnabled = !(layer === "landcover" || (layer === "relief" && i === 0));
          ctx.drawImage(bitmap, x0, y0, x1 - x0, y1 - y0);
        }
        bitmap.close();
      }
    }
  };
  await Promise.all([work(), work(), work(), work()]);
  const shared = [...byCode.values()].map((c) => ({ ...c, share_pct: (c.area_km2 / (area || 1)) * 100 }));
  const classes =
    layer === "relief" && reliefColors && reliefBreaks
      ? (() => {
          const labels = reliefLabels(reliefBreaks);
          return shared.sort((a, b) => a.code - b.code).map((c) => ({ ...c, label: labels[c.code], color: reliefColors![c.code] }));
        })()
      : shared.sort((a, b) => b.area_km2 - a.area_km2);
  return {
    layer,
    images: new Map(canvases.map(({ t, c }) => [t.key, c.toDataURL("image/png")])),
    classes: layer === "terrain" ? [] : classes,
    area_km2: area,
    elevation,
    missing: [...new Set(missing)].sort(),
  };
}
