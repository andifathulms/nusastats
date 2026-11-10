// Map geometry shared by the 1080x1920 cards: GeoJSON features projected into a
// 1000-wide SVG viewBox (equirectangular with the mid-latitude cosine, the same
// projection the Peta Wilayah rasters are drawn in), plus the dark-surface ramp.

export type Feature = { properties: { domain_id: string; name?: string }; geometry: { type: string; coordinates: unknown } };
export type Geo = { features: Feature[] };
export type Frame = { west: number; south: number; east: number; north: number };

// DESIGN.md: on a dark surface choropleths run dark sea -> cream, so high values
// read as the strongest colour; "no data" stays neutral grey, off the ramp.
export const RAMP = ["#1A2E55", "#2B57A3", "#4F82DC", "#A3BEF0", "#F3ECDD"];
export const NO_DATA = "var(--nm-nodata)"; // brand.ts palettes

export function lerpHex(a: string, b: string, t: number): string {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return `#${pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, "0")).join("")}`;
}

export function rampColor(t: number, colors: string[] = RAMP): string {
  const x = Math.max(0, Math.min(1, t)) * (colors.length - 1);
  const i = Math.min(colors.length - 2, Math.floor(x));
  return lerpHex(colors[i], colors[i + 1], x - i);
}

// Nusantara Mapper card palettes, one per kind of number (proposal "Arah Visual
// Nusantara Mapper"), all perceptually ordered and colour-blind safe on the dark
// card background. The first stop is lighter than the background on purpose, so
// the lowest class never reads as "no data".
export const PALETTES = {
  /** Counts and densities: magma-like, dark -> bright = few -> many. */
  amount: ["#3B2559", "#6D2B6F", "#A83E6B", "#E2604F", "#F69F4E", "#FBE29A"],
  /** Ratios and shares: viridis-like, so they never read as a population map. */
  ratio: ["#3E4A89", "#31688E", "#26828E", "#1F9E89", "#6CCE59", "#E6E419"],
  /** Numbers with a meaningful middle (sex ratio 100): teal below, coral above. */
  diverging: ["#1F8A8A", "#6FC2B8", "#E8E4DA", "#F2A27A", "#D9573B"],
};

// Light palettes (brand.ts) flip the data ramps so more = darker: the bright
// end of magma/viridis would vanish on paper. Set once per card page, before
// the card renders (app/card/[template]/[kode]/page.tsx).
let LIGHT_RAMPS = false;
export function setLightRamps(light: boolean): void {
  LIGHT_RAMPS = light;
}
/** A palette as the current card draws it. Diverging keeps its order (the middle is the point). */
export function palette(kind: keyof typeof PALETTES): string[] {
  return LIGHT_RAMPS && kind !== "diverging" ? [...PALETTES[kind]].reverse() : PALETTES[kind];
}

export type Scale = { color: (v: number) => string; gradient: string; mid?: number; lo: number; hi: number };

/** A colour scale for values in [lo, hi]. `mid` makes it diverging and
 * symmetric around that value (e.g. 100 for L per 100 P), so which side a
 * region is on is visible without the legend. */
export function scaleFor(kind: keyof typeof PALETTES, lo: number, hi: number, mid?: number): Scale {
  const colors = palette(kind);
  if (mid !== undefined) {
    const dev = Math.max(Math.abs(lo - mid), Math.abs(hi - mid)) || 1;
    return { color: (v) => rampColor(0.5 + (v - mid) / (2 * dev), colors), gradient: colors.join(", "), mid, lo: mid - dev, hi: mid + dev };
  }
  return { color: (v) => rampColor((v - lo) / (hi - lo || 1), colors), gradient: colors.join(", "), lo, hi };
}

/** Rounded to 2 significant digits (0,16 / 2,4 / 51 / 1.200): a break a legend can print. */
function niceBreak(v: number): number {
  if (v === 0) return 0;
  const p = 10 ** (Math.floor(Math.log10(Math.abs(v))) - 1);
  return Math.round(v / p) * p;
}

export type ClassedScale = { color: (v: number) => string; breaks: number[]; colors: string[] };

/** For a lopsided ranking (the median sits in the bottom or top fifth of the range, e.g.
 * built-up land: Makassar 51%, most kabupaten under 3%): up to 6 classes with about as
 * many regions in each, breaks rounded to 2 significant digits. A linear ramp would paint
 * nearly every region one colour. null when the values are spread evenly enough for the
 * ramp, too few to class (< 12), or the scale is diverging. */
export function classedScale(kind: keyof typeof PALETTES, values: number[], n = 6): ClassedScale | null {
  if (kind === "diverging" || values.length < 12) return null;
  const s = [...values].sort((a, b) => a - b);
  const [lo, hi] = [s[0], s[s.length - 1]];
  if (!(hi > lo)) return null;
  const t = (s[Math.floor(s.length / 2)] - lo) / (hi - lo);
  if (t >= 0.2 && t <= 0.8) return null;
  const breaks: number[] = [];
  for (let i = 1; i < n; i++) {
    const b = niceBreak(s[Math.round((i * (s.length - 1)) / n)]);
    if (b > lo && b <= hi && (!breaks.length || b > breaks[breaks.length - 1])) breaks.push(b);
  }
  if (breaks.length < 2) return null;
  const ramp = palette(kind);
  const colors = Array.from({ length: breaks.length + 1 }, (_, i) => rampColor(i / breaks.length, ramp));
  // Class i holds values in [breaks[i-1], breaks[i]).
  const color = (v: number) => colors[breaks.filter((b) => v >= b).length];
  return { color, breaks, colors };
}

/** Which palette a metric gets, from its unit or key. */
export function kindFor(unit: string, key = ""): { kind: keyof typeof PALETTES; mid?: number } {
  const u = (unit || "").toLowerCase();
  if (key === "sex_ratio" || u.includes("per 100 p")) return { kind: "diverging", mid: 100 };
  if (/^(jiwa|orang|kk|rp)\b|jiwa\/km|^rp/.test(u)) return { kind: "amount" };
  return { kind: "ratio" };
}

export function polygons(f: Feature): number[][][][] {
  return (f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates) as number[][][][];
}

export function frameOf(features: Feature[]): Frame {
  const fr = { west: 180, south: 90, east: -180, north: -90 };
  for (const f of features)
    for (const poly of polygons(f))
      for (const ring of poly)
        for (const [x, y] of ring) {
          fr.west = Math.min(fr.west, x);
          fr.east = Math.max(fr.east, x);
          fr.south = Math.min(fr.south, y);
          fr.north = Math.max(fr.north, y);
        }
  return fr;
}

/** Equirectangular with the mid-latitude cosine (same as ShareCard), in a 1000-wide viewBox. */
export function project(features: Feature[], frame: Frame) {
  const cosMid = Math.cos((((frame.south + frame.north) / 2) * Math.PI) / 180);
  const vw = 1000;
  const s = vw / ((frame.east - frame.west) * cosMid || 1);
  const vh = (frame.north - frame.south) * s;
  const paths = features.map((f) => ({
    id: f.properties.domain_id,
    d: polygons(f)
      .map((poly) =>
        poly
          .map((ring) =>
            ring.map(([x, y], i) => `${i ? "L" : "M"}${((x - frame.west) * s * cosMid).toFixed(1)} ${((frame.north - y) * s).toFixed(1)}`).join("") + "Z"
          )
          .join("")
      )
      .join(""),
  }));
  return { paths, vw, vh, frame };
}

/** The projection `project` uses, as a function on [lon, lat]. */
export function projector(frame: Frame) {
  const cosMid = Math.cos((((frame.south + frame.north) / 2) * Math.PI) / 180);
  const s = 1000 / ((frame.east - frame.west) * cosMid || 1);
  return ([x, y]: number[]): [number, number] => [(x - frame.west) * s * cosMid, (frame.north - y) * s];
}

function ringArea(ring: [number, number][]): number {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1]);
  return a / 2;
}

function ringCentroid(ring: [number, number][]): [number, number] {
  let a = 0;
  let x = 0;
  let y = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const f = ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
    a += f;
    x += (ring[j][0] + ring[i][0]) * f;
    y += (ring[j][1] + ring[i][1]) * f;
  }
  return a ? [x / (3 * a), y / (3 * a)] : ring[0];
}

function insideRings(p: [number, number], rings: [number, number][][]): boolean {
  let inside = false;
  for (const ring of rings)
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
    }
  return inside;
}

function edgeDistance(p: [number, number], rings: [number, number][][]): number {
  let best = Infinity;
  for (const ring of rings)
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [ax, ay] = ring[j];
      const [bx, by] = ring[i];
      const dx = bx - ax;
      const dy = by - ay;
      const t = Math.max(0, Math.min(1, ((p[0] - ax) * dx + (p[1] - ay) * dy) / (dx * dx + dy * dy || 1)));
      best = Math.min(best, Math.hypot(p[0] - (ax + t * dx), p[1] - (ay + t * dy)));
    }
  return best;
}

/** Where a label goes inside a feature (projected): the grid point farthest from
 * any edge of the feature's largest polygon, an approximate pole of
 * inaccessibility, so a concave kecamatan still gets its label inside it.
 * `room` is that distance: how much space the label has. */
export function labelPoint(f: Feature, to: (c: number[]) => [number, number]): { x: number; y: number; room: number } {
  const polys = polygons(f).map((poly) => poly.map((ring) => ring.map(to)));
  let biggest = polys[0];
  let bigArea = -1;
  for (const poly of polys) {
    const xs = poly[0].map((c) => c[0]);
    const ys = poly[0].map((c) => c[1]);
    const area = (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
    if (area > bigArea) [bigArea, biggest] = [area, poly];
  }
  const xs = biggest[0].map((c) => c[0]);
  const ys = biggest[0].map((c) => c[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  let best = { x: (x0 + x1) / 2, y: (y0 + y1) / 2, room: 0 };
  const N = 16;
  for (let i = 1; i < N; i++)
    for (let j = 1; j < N; j++) {
      const p: [number, number] = [x0 + ((x1 - x0) * i) / N, y0 + ((y1 - y0) * j) / N];
      if (!insideRings(p, biggest)) continue;
      const room = edgeDistance(p, biggest);
      if (room > best.room) best = { x: p[0], y: p[1], room };
    }
  return best;
}

/** Greedy colouring so neighbouring features (sharing a vertex) differ.
 * Returns a palette index per feature id. */
export function neighbourColours(features: Feature[], paletteSize: number): Map<string, number> {
  const owners = new Map<string, Set<string>>();
  for (const f of features)
    for (const poly of polygons(f))
      for (const ring of poly)
        for (const [x, y] of ring) {
          const k = `${x.toFixed(4)},${y.toFixed(4)}`;
          if (!owners.has(k)) owners.set(k, new Set());
          owners.get(k)!.add(f.properties.domain_id);
        }
  const nbrs = new Map<string, Set<string>>(features.map((f) => [f.properties.domain_id, new Set<string>()]));
  for (const ids of owners.values())
    if (ids.size > 1) for (const a of ids) for (const b of ids) if (a !== b) nbrs.get(a)!.add(b);
  const colour = new Map<string, number>();
  const order = [...features].sort((a, b) => nbrs.get(b.properties.domain_id)!.size - nbrs.get(a.properties.domain_id)!.size);
  for (const f of order) {
    const id = f.properties.domain_id;
    const used = new Set([...nbrs.get(id)!].map((n) => colour.get(n)));
    let c = 0;
    while (used.has(c) && c < paletteSize - 1) c++;
    colour.set(id, c);
  }
  return colour;
}

export type OffFrame = { id: string; name: string; km: number; dir: string };
export type Framing = { frame: Frame; cropped: boolean; offFrame: OffFrame[] };

const ARAH = ["timur", "timur laut", "utara", "barat laut", "barat", "barat daya", "selatan", "tenggara"];

/** Frame a region on its main landmass. Starting from the largest polygon, any
 * part within a fifth of the cluster's size is pulled in; parts farther out
 * (Makassar's Kepulauan Sangkarrang, ~30 km offshore) are left outside the
 * frame and returned with distance and direction, so a card can name them.
 * A real archipelago (outlying parts > 15% of the area) or a crop that wouldn't
 * gain much keeps the full frame. */
export function framing(features: Feature[]): Framing {
  type Part = { id: string; name: string; fr: Frame; area: number; cx: number; cy: number };
  const parts: Part[] = [];
  for (const f of features)
    for (const poly of polygons(f)) {
      const fr = frameOf([{ properties: f.properties, geometry: { type: "Polygon", coordinates: poly } }]);
      const ring = poly[0];
      let a = 0;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1]);
      parts.push({
        id: f.properties.domain_id,
        name: f.properties.name ?? f.properties.domain_id,
        fr,
        area: Math.abs(a / 2),
        cx: (fr.west + fr.east) / 2,
        cy: (fr.south + fr.north) / 2,
      });
    }
  const full = frameOf(features);
  if (!parts.length) return { frame: full, cropped: false, offFrame: [] };
  const inCluster = new Set<Part>([parts.reduce((m, p) => (p.area > m.area ? p : m))]);
  const box = { ...[...inCluster][0].fr };
  for (let grown = true; grown; ) {
    grown = false;
    const reach = 0.2 * Math.max(box.east - box.west, box.north - box.south);
    for (const p of parts) {
      if (inCluster.has(p)) continue;
      const gap = Math.max(0, p.fr.west - box.east, box.west - p.fr.east, p.fr.south - box.north, box.south - p.fr.north);
      if (gap <= reach) {
        inCluster.add(p);
        box.west = Math.min(box.west, p.fr.west);
        box.east = Math.max(box.east, p.fr.east);
        box.south = Math.min(box.south, p.fr.south);
        box.north = Math.max(box.north, p.fr.north);
        grown = true;
      }
    }
  }
  const out = parts.filter((p) => !inCluster.has(p));
  const total = parts.reduce((s, p) => s + p.area, 0);
  const outArea = out.reduce((s, p) => s + p.area, 0);
  const span = (fr: Frame) => (fr.east - fr.west) * (fr.north - fr.south);
  if (!out.length || outArea > 0.15 * total || span(full) < 1.6 * span(box)) return { frame: full, cropped: false, offFrame: [] };

  const pad = 0.04 * Math.max(box.east - box.west, box.north - box.south);
  const frame = { west: box.west - pad, east: box.east + pad, south: box.south - pad, north: box.north + pad };
  const cx = (box.west + box.east) / 2;
  const cy = (box.south + box.north) / 2;
  const cos = Math.cos((cy * Math.PI) / 180);
  const byId = new Map<string, OffFrame>();
  for (const p of out) {
    const dx = (p.cx - cx) * cos * 111.32;
    const dy = (p.cy - cy) * 110.57;
    const km = Math.round(Math.hypot(dx, dy) / 5) * 5;
    const dir = ARAH[Math.round(((Math.atan2(dy, dx) * 180) / Math.PI + 360) / 45) % 8];
    const prev = byId.get(p.id);
    if (!prev || km > prev.km) byId.set(p.id, { id: p.id, name: p.name, km, dir });
  }
  return { frame, cropped: true, offFrame: [...byId.values()] };
}

/** The rectangle of `inner` in the projection of `outer` (viewBox units), to
 * crop a raster card drawn over `outer` down to `inner`. */
export function cropBox(inner: Frame, outer: Frame): { x: number; y: number; w: number; h: number } {
  const to = projector(outer);
  const [x0, y0] = to([Math.max(inner.west, outer.west), Math.min(inner.north, outer.north)]);
  const [x1, y1] = to([Math.min(inner.east, outer.east), Math.max(inner.south, outer.south)]);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** One inset box: `kab` is its key (the first member); `members` the kabupaten it shows, each
 * whole (an island kabupaten) or only its far islands. One member except in `cluster` mode. */
export type InsetGroup = {
  kab: string; whole: boolean; members: { kab: string; whole: boolean }[]; features: Feature[]; frame: Frame; centre: [number, number];
};
/** `dropped`: ids of features not drawn at all (cluster mode only), for the card to name. */
export type Insets = { main: Feature[]; frame: Frame; groups: InsetGroup[]; dropped: string[] };

/** Split a province map (kabupaten or kecamatan features) into its mainland and
 * inset boxes, the way printed maps show Sulawesi Selatan: the mainland at full
 * size, Kepulauan Selayar and Pangkep's far islands in boxes of their own.
 *
 * The mainland is every polygon connected to the largest one (bounding boxes
 * within ~2 km, chained). A kabupaten with under half its area there (Selayar)
 * goes to an inset whole; a mainland kabupaten keeps its islands near the coast
 * (within a tenth of the mainland's span) and sends the far ones to its inset.
 * Group key: the 4-digit kabupaten prefix of the Kemendagri code. Returns null
 * when insets wouldn't help: nothing far out, an archipelago (insets > 15% of
 * the area or more than 3 boxes), or a frame that shrinks by less than 40%.
 * Every polygon is drawn exactly once, in the main map or in one box.
 *
 * `cluster` (a map of several provinces, e.g. all of Sulawesi): islands off the
 * coast that barely widen the frame (Banggai, Wakatobi, Wawonii) stay on the
 * main map, and far groups lying close together share one box (Sangihe, Sitaro
 * and Talaud). A far group under 0.01% of the area (Mamuju's Balabalakang
 * islands, a few dots) gets no box and isn't drawn; `dropped` names it. Up to 4 boxes. */
export function insets(features: Feature[], { cluster = false }: { cluster?: boolean } = {}): Insets | null {
  type Part = { f: Feature; poly: number[][][]; fr: Frame; area: number; kab: string };
  const parts: Part[] = [];
  for (const f of features)
    for (const poly of polygons(f)) {
      const ring = poly[0];
      let a = 0;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1]);
      const fr = frameOf([{ properties: f.properties, geometry: { type: "Polygon", coordinates: poly } }]);
      parts.push({ f, poly, fr, area: Math.abs(a / 2), kab: f.properties.domain_id.slice(0, 4) });
    }
  if (parts.length < 2) return null;
  const gap = (a: Frame, b: Frame) => Math.max(0, a.west - b.east, b.west - a.east, a.south - b.north, b.south - a.north);
  const grow = (fr: Frame, b: Frame) => {
    fr.west = Math.min(fr.west, b.west);
    fr.east = Math.max(fr.east, b.east);
    fr.south = Math.min(fr.south, b.south);
    fr.north = Math.max(fr.north, b.north);
  };

  const land = new Set<Part>([parts.reduce((m, p) => (p.area > m.area ? p : m))]);
  for (const queue = [...land]; queue.length; ) {
    const m = queue.pop()!;
    for (const p of parts) if (!land.has(p) && gap(p.fr, m.fr) <= 0.02) land.add(p), queue.push(p);
  }
  const box = { ...[...land][0].fr };
  for (const p of land) grow(box, p.fr);
  const reach = 0.1 * Math.max(box.east - box.west, box.north - box.south);

  const kabArea = new Map<string, { all: number; land: number }>();
  for (const p of parts) {
    const k = kabArea.get(p.kab) ?? { all: 0, land: 0 };
    k.all += p.area;
    if (land.has(p)) k.land += p.area;
    kabArea.set(p.kab, k);
  }
  const mainland = (k: string) => kabArea.get(k)!.land >= 0.5 * kabArea.get(k)!.all;
  const inMain = (p: Part) => land.has(p) || (mainland(p.kab) && gap(p.fr, box) <= reach);

  const frame = { ...box };
  const out = new Map<string, Part[]>();
  const kept = new Set<Part>();
  for (const p of parts)
    if (inMain(p)) grow(frame, p.fr), kept.add(p);
    else out.set(p.kab, [...(out.get(p.kab) ?? []), p]);
  const frameOfParts = (ps: Part[]) => {
    const fr = { ...ps[0].fr };
    for (const p of ps) grow(fr, p.fr);
    return fr;
  };
  // Members of each box: one kabupaten each, or (cluster) neighbours merged.
  let boxes: string[][] = [...out.keys()].map((k) => [k]);
  if (cluster) {
    // Near the coast: keep on the main map when it widens the frame by at most 6% either way.
    const widen = (fr: Frame) => {
      const [w, h] = [frame.east - frame.west, frame.north - frame.south];
      return Math.max(
        (Math.max(frame.east, fr.east) - Math.min(frame.west, fr.west)) / w,
        (Math.max(frame.north, fr.north) - Math.min(frame.south, fr.south)) / h,
      );
    };
    for (let moved = true; moved; ) {
      moved = false;
      for (const [k, ps] of out)
        if (widen(frameOfParts(ps)) <= 1.06) {
          for (const p of ps) grow(frame, p.fr), kept.add(p);
          out.delete(k);
          moved = true;
        }
    }
    // Far groups whose frames lie within 1.25 x `reach` of each other share a box (chained):
    // Sangihe-Talaud is 0.84 degrees apart on Sulawesi's 0.81 reach; Pangkep-Selayar 1.2.
    boxes = [];
    for (const k of out.keys()) {
      const fr = frameOfParts(out.get(k)!);
      const near = boxes.filter((b) => b.some((o) => gap(fr, frameOfParts(out.get(o)!)) <= 1.25 * reach));
      boxes = [...boxes.filter((b) => !near.includes(b)), [...near.flat(), k]];
    }
  }
  const total = parts.reduce((s, p) => s + p.area, 0);
  if (cluster) {
    const area = (b: string[]) => b.flatMap((k) => out.get(k)!).reduce((s, p) => s + p.area, 0);
    const tiny = boxes.filter((b) => area(b) < 1e-4 * total);
    for (const b of tiny) for (const k of b) out.delete(k);
    boxes = boxes.filter((b) => !tiny.includes(b));
  }
  const outArea = [...out.values()].flat().reduce((s, p) => s + p.area, 0);
  const span = (fr: Frame) => (fr.east - fr.west) * (fr.north - fr.south);
  if (!boxes.length || boxes.length > (cluster ? 4 : 3) || outArea > 0.15 * total || span(frameOf(features)) < 1.6 * span(frame)) return null;

  // Rebuild features from the parts each side keeps (a kecamatan may be split).
  const regroup = (ps: Part[]) => {
    const byF = new Map<Feature, number[][][][]>();
    for (const p of ps) byF.set(p.f, [...(byF.get(p.f) ?? []), p.poly]);
    return [...byF].map(([f, polys]) => ({ properties: f.properties, geometry: { type: "MultiPolygon", coordinates: polys } }));
  };
  const pad = 0.03 * Math.max(frame.east - frame.west, frame.north - frame.south);
  const groups = boxes.map((ks) => {
    ks.sort();
    const ps = ks.flatMap((k) => out.get(k)!);
    const fr = frameOfParts(ps);
    const members = ks.map((k) => ({ kab: k, whole: !mainland(k) }));
    return {
      kab: ks[0], whole: members.every((m) => m.whole), members, features: regroup(ps), frame: fr,
      centre: [(fr.west + fr.east) / 2, (fr.south + fr.north) / 2] as [number, number],
    };
  });
  const shown = new Set([...kept, ...[...out.values()].flat()].map((p) => p.f));
  return {
    dropped: features.filter((f) => !shown.has(f)).map((f) => f.properties.domain_id),
    main: regroup(parts.filter((p) => kept.has(p))),
    frame: { west: frame.west - pad, east: frame.east + pad, south: frame.south - pad, north: frame.north + pad },
    groups,
  };
}

/** Split one kabupaten's map (kecamatan or desa features) into its mainland and
 * at most two inset boxes, the way Pangkep is printed: the mainland large, the
 * Spermonde islands off its coast in one box, the far Kalmas and Tangaya
 * islands in another.
 *
 * An island kecamatan is one with under half its area on the mainland, where
 * the mainland is every polygon touching the largest (bounding boxes within
 * ~100 m, chained: tight, so islands a few km out don't join it). Its parts all
 * go to a box. A mainland kecamatan keeps its islands near the coast (within a
 * fifth of the mainland's span, as framing() does) and sends far ones to a box. Out parts within one
 * mainland span of the coast share the "near" box; the rest share the "far" box.
 * Groups and members are keyed by the 6-digit kecamatan code. Returns null when
 * boxes wouldn't help: nothing far out, islands over 15% of the area (an
 * archipelago such as Selayar), more than three kecamatan in one box, or a
 * frame that shrinks by less than 40%.
 * Every polygon is drawn exactly once, in the main map or in one box. */
export function kabInsets(features: Feature[]): Insets | null {
  type Part = { f: Feature; poly: number[][][]; fr: Frame; area: number; kec: string };
  const parts: Part[] = [];
  for (const f of features)
    for (const poly of polygons(f)) {
      const ring = poly[0];
      let a = 0;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1]);
      const fr = frameOf([{ properties: f.properties, geometry: { type: "Polygon", coordinates: poly } }]);
      parts.push({ f, poly, fr, area: Math.abs(a / 2), kec: f.properties.domain_id.slice(0, 6) });
    }
  if (parts.length < 2) return null;
  const gap = (a: Frame, b: Frame) => Math.max(0, a.west - b.east, b.west - a.east, a.south - b.north, b.south - a.north);
  const grow = (fr: Frame, b: Frame) => {
    fr.west = Math.min(fr.west, b.west);
    fr.east = Math.max(fr.east, b.east);
    fr.south = Math.min(fr.south, b.south);
    fr.north = Math.max(fr.north, b.north);
  };
  const frameOfParts = (ps: Part[]) => {
    const fr = { ...ps[0].fr };
    for (const p of ps) grow(fr, p.fr);
    return fr;
  };
  const span = (fr: Frame) => Math.max(fr.east - fr.west, fr.north - fr.south);

  const land = new Set<Part>([parts.reduce((m, p) => (p.area > m.area ? p : m))]);
  for (const queue = [...land]; queue.length; ) {
    const m = queue.pop()!;
    for (const p of parts) if (!land.has(p) && gap(p.fr, m.fr) <= 0.001) land.add(p), queue.push(p);
  }
  const share = new Map<string, { all: number; land: number }>();
  for (const p of parts) {
    const k = share.get(p.kec) ?? { all: 0, land: 0 };
    k.all += p.area;
    if (land.has(p)) k.land += p.area;
    share.set(p.kec, k);
  }
  const mainland = (k: string) => share.get(k)!.land >= 0.5 * share.get(k)!.all;
  const box = frameOfParts([...land]);
  // Like framing(): islands within a fifth of the mainland's span stay (Makassar's Lae-Lae).
  const reach = 0.2 * span(box);
  const kept = parts.filter((p) => land.has(p) || (mainland(p.kec) && gap(p.fr, box) <= reach));
  const out = parts.filter((p) => !kept.includes(p));
  if (!out.length) return null;
  const total = parts.reduce((s, p) => s + p.area, 0);
  const frame = frameOfParts(kept);
  const area = (fr: Frame) => (fr.east - fr.west) * (fr.north - fr.south);
  if (out.reduce((s, p) => s + p.area, 0) > 0.15 * total || area(frameOf(features)) < 1.6 * area(frame)) return null;

  // Near or far, decided per kecamatan (all its out parts together), so a kecamatan is never split across boxes.
  const byKec = new Map<string, Part[]>();
  for (const p of out) byKec.set(p.kec, [...(byKec.get(p.kec) ?? []), p]);
  const near = (ps: Part[]) => gap(frameOfParts(ps), frame) <= span(frame);
  const sides = [[...byKec].filter(([, ps]) => near(ps)), [...byKec].filter(([, ps]) => !near(ps))].filter((s) => s.length);
  // A box names its kecamatan; more than three (Ambon and the Lease islands in Maluku Tengah)
  // is an archipelago, not a mainland with outliers.
  if (sides.some((s) => s.length > 3)) return null;
  const regroup = (ps: Part[]) => {
    const byF = new Map<Feature, number[][][][]>();
    for (const p of ps) byF.set(p.f, [...(byF.get(p.f) ?? []), p.poly]);
    return [...byF].map(([f, polys]) => ({ properties: f.properties, geometry: { type: "MultiPolygon", coordinates: polys } }));
  };
  const groups = sides.map((side) => {
    side.sort(([a], [b]) => a.localeCompare(b));
    const ps = side.flatMap(([, ps]) => ps);
    const fr = frameOfParts(ps);
    const members = side.map(([k]) => ({ kab: k, whole: !mainland(k) }));
    return {
      kab: members[0].kab, whole: members.every((m) => m.whole), members, features: regroup(ps), frame: fr,
      centre: [(fr.west + fr.east) / 2, (fr.south + fr.north) / 2] as [number, number],
    };
  });
  const pad = 0.04 * span(frame);
  return {
    dropped: [],
    main: regroup(kept),
    frame: { west: frame.west - pad, east: frame.east + pad, south: frame.south - pad, north: frame.north + pad },
    groups,
  };
}

/** `features` without the polygons drawn elsewhere (an inset box's islands): a polygon
 * goes when its bounding-box centre lies in the bounding box of one of `moved`'s
 * polygons. For the kabupaten outline and kecamatan lines over a map split by kabInsets. */
export function withoutMoved(features: Feature[], moved: Feature[]): Feature[] {
  const eps = 1e-4;
  const boxes = moved.flatMap((f) => polygons(f).map((poly) => frameOf([{ properties: f.properties, geometry: { type: "Polygon", coordinates: poly } }])));
  return features.map((f) => ({
    properties: f.properties,
    geometry: {
      type: "MultiPolygon",
      coordinates: polygons(f).filter((poly) => {
        const fr = frameOf([{ properties: f.properties, geometry: { type: "Polygon", coordinates: poly } }]);
        const [x, y] = [(fr.west + fr.east) / 2, (fr.south + fr.north) / 2];
        return !boxes.some((b) => x >= b.west - eps && x <= b.east + eps && y >= b.south - eps && y <= b.north + eps);
      }),
    },
  }));
}

export type Label = { id: string; name: string; x: number; y: number; size: number; n?: number; lines?: string[] };

/** A multi-word name split into two lines at the space nearest its middle ("Bonto / Lojong"). */
export function twoLines(name: string): [string, string] | null {
  const spaces = [...name.matchAll(/ /g)].map((m) => m.index!);
  if (!spaces.length) return null;
  const at = spaces.reduce((a, b) => (Math.abs(b - name.length / 2) < Math.abs(a - name.length / 2) ? b : a));
  return [name.slice(0, at), name.slice(at + 1)];
}

/** Names for the features of a map in a box of boxW x boxH card pixels: the
 * roomiest features first, each name inside its feature at 26-34 px when it
 * has room and doesn't collide; the rest get a number (sorted by name) for a
 * legend. Features wholly outside the frame are skipped (an off-frame note
 * names them). */
export function placeLabels(
  feats: Feature[], frame: Frame, vw: number, vh: number, names: Map<string, string>, boxW: number, boxH: number,
  { min = 26, max = 34, minRoom = 16, allowed }: {
    min?: number; max?: number; minRoom?: number;
    /** Where text may go (projected units), e.g. not under TikTok's UI. Default: anywhere in the frame. */
    allowed?: (x: number, y: number) => boolean;
  } = {},
): { labels: Label[]; numbered: Label[] } {
  const to = projector(frame);
  const k = 1 / Math.min(boxW / vw, boxH / vh); // viewBox units per card pixel
  const labels: Label[] = [];
  const numbered: Label[] = [];
  const ok = allowed ?? (() => true);
  // Each name gets the spot where its own text box sits most fully inside its unit, in allowed space,
  // clear of other names, as far from the unit's edge as possible (so it reads centred). Small units
  // first: they have the fewest spots; big ones can move around them.
  const units = feats.map((f) => {
    const polys = polygons(f).map((poly) => poly.map((ring) => ring.map(to)));
    const all = polys.flatMap((p) => p);
    const xs = all.flatMap((r) => r.map((c) => c[0]));
    const ys = all.flatMap((r) => r.map((c) => c[1]));
    return { f, polys, bbox: [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)] as const };
  });
  units.sort((a, b) => (a.bbox[1] - a.bbox[0]) * (a.bbox[3] - a.bbox[2]) - (b.bbox[1] - b.bbox[0]) * (b.bbox[3] - b.bbox[2]));
  type Box = { x0: number; x1: number; y0: number; y1: number };
  type Spot = { x: number; y: number; lines?: [string, string]; box: Box; room: number };
  const size = Math.max(min, Math.min(max, max)) * k;
  /** The best spot for a unit's name clear of `taken`, plus the unit's roomiest readable point (for a
   * leader). `mode`: "fit" (pass 1), "centre" (pass 2) or "straddle" (a narrow unit), see below. */
  const search = (u: (typeof units)[number], name: string, taken: Box[], mode: "fit" | "centre" | "straddle") => {
    const overlap = mode === "centre";
    const [x0, x1, y0, y1] = u.bbox;
    const inside = (x: number, y: number) => u.polys.some((poly) => insideRings([x, y], poly));
    const onOther = (x: number, y: number) =>
      units.some((o) => o !== u && x >= o.bbox[0] && x <= o.bbox[1] && y >= o.bbox[2] && y <= o.bbox[3] && o.polys.some((poly) => insideRings([x, y], poly)));
    const room = (x: number, y: number) => Math.max(...u.polys.map((poly) => (insideRings([x, y], poly) ? edgeDistance([x, y], poly) : 0)));
    const split = twoLines(name);
    const variants: { lines?: [string, string]; w: number; up: number; down: number }[] = [
      { w: name.length * size * 0.56, up: size * 0.7, down: size * 0.5 },
      ...(split ? [{ lines: split, w: Math.max(...split.map((t) => t.length)) * size * 0.56, up: size * 1.25, down: size * 1.05 }] : []),
    ];
    const N = 18;
    const spots: { x: number; y: number; r: number }[] = [];
    for (let i = 0; i <= N; i++)
      for (let j = 0; j <= N; j++) {
        const x = x0 + ((x1 - x0) * i) / N;
        const y = y0 + ((y1 - y0) * j) / N;
        if (inside(x, y)) spots.push({ x, y, r: room(x, y) });
      }
    const maxRoom = Math.max(1e-9, ...spots.map((p) => p.r));
    // How roomy the unit is: its area against the name's smallest box, 0 at 1.5x, 1 from 4x. The pull
    // to the middle grows with it: in a tight unit it would take the space a neighbour's name needed
    // (dense desa maps), so there the best fit wins.
    const area = u.polys.reduce((t, poly) => t + Math.abs(ringArea(poly[0])), 0);
    const roomy = Math.max(0, Math.min(1, (area / Math.min(...variants.map((v) => v.w * (v.up + v.down))) - 1.5) / 2.5));
    const pull = 0.02 + (overlap ? 0.78 : 0.38) * roomy;
    const fullFit = overlap ? 1 - 0.25 * roomy : 1; // this much of the name on its unit counts as a full fit
    const overlapCost = overlap ? 1 - 0.7 * roomy : 1;
    // "Central" is half distance from the edge (the widest part) and half closeness to the centre of
    // mass of the unit's main polygon, where the eye puts its middle (Polongbangkeng Selatan's widest
    // strip runs along its top edge).
    const main = u.polys.reduce((a, b) => (Math.abs(ringArea(b[0])) > Math.abs(ringArea(a[0])) ? b : a));
    const [cx, cy] = ringCentroid(main[0]);
    const reach = 0.5 * Math.sqrt(Math.abs(ringArea(main[0])));
    const central = (x: number, y: number, r: number) =>
      0.5 * (r / maxRoom) + 0.5 * (1 - Math.min(1, Math.hypot(x - cx, y - cy) / reach));
    let best: (Spot & { score: number }) | null = null;
    let anchor: { x: number; y: number; room: number } | null = null;
    for (const { x, y, r } of spots) {
      if (ok(x, y) && (!anchor || r > anchor.room)) anchor = { x, y, room: r };
      for (const [vi, v] of variants.entries()) {
        const box = { x0: x - v.w / 2, x1: x + v.w / 2, y0: y - v.up, y1: y + v.down };
        if (box.x0 < 0 || box.x1 > vw || box.y0 < 0 || box.y1 > vh) continue;
        if (taken.some((p) => box.x0 < p.x1 && box.x1 > p.x0 && box.y0 < p.y1 && box.y1 > p.y0)) continue;
        let hit = 0;
        let other = 0;
        let n = 0;
        let blocked = false;
        for (let a = 0; a <= 6 && !blocked; a++)
          for (let b = 0; b <= 2; b++) {
            const px = box.x0 + ((box.x1 - box.x0) * a) / 6;
            const py = box.y0 + ((box.y1 - box.y0) * b) / 2;
            if (!ok(px, py)) { blocked = true; break; }
            n++;
            if (inside(px, py)) hit++;
            else if (onOther(px, py)) other++;
          }
        if (blocked) continue;
        // How much of the name is on its unit, how much spills onto another unit (whose own name
        // needs that room: Libureng over Lompo Riaja), and how central the spot is. One line beats
        // two at the same spot.
        const fit = hit / n;
        if (mode === "straddle") {
          // A unit too narrow for its name (Galesong Utara, a coastal strip): the name centred on it,
          // running out over nothing but empty space (sea, the neighbouring kabupaten) on either
          // side. Nothing else under it, so it is still clear which unit it names.
          if (other > 0 || fit < 0.15 || !inside(x, y)) continue;
          const score = fit + 0.5 * central(x, y, r) - vi * 0.05;
          if (!best || score > best.score) best = { x, y, lines: v.lines, box, room: r, score };
          continue;
        }
        if (fit < 0.5) continue; // at least half the name on its own unit (a name may spill over a small one, as on hand-made maps)
        // An overlap must leave it clear which unit the name is for: at most a quarter on a
        // neighbour, the middle of the name well inside its own unit, no leader dot under it.
        if (overlap && other > 0) {
          if (other / n > 0.25 || r < size * 0.6) continue;
          const pad = 8 * k;
          if (numbered.some((d) => d.x > box.x0 - pad && d.x < box.x1 + pad && d.y > box.y0 - pad && d.y < box.y1 + pad)) continue;
        }
        const score = Math.min(1, fit / fullFit) - overlapCost * (other / n) + pull * central(x, y, r) - vi * 0.05;
        if (!best || score > best.score) best = { x, y, lines: v.lines, box, room: r, score };
      }
    }
    return { best: best && best.room / k >= minRoom * 0.25 ? best : null, anchor, roomy };
  };

  // Pass 1: every name at its best fit, small units first.
  const spotOf = new Map<string, { u: (typeof units)[number]; name: string; roomy: number; spot: Spot }>();
  for (const u of units) {
    const id = u.f.properties.domain_id;
    const name = names.get(id) ?? u.f.properties.name ?? id;
    const [x0, x1, y0, y1] = u.bbox;
    if (x1 < 0 || x0 > vw || y1 < 0 || y0 > vh) continue; // wholly off the frame: the off-frame note names it
    const taken = [...spotOf.values()].map((p) => p.spot.box);
    const { best, anchor, roomy } = search(u, name, taken, "fit");
    const straddle = best ? null : search(u, name, taken, "straddle").best;
    if (best) spotOf.set(id, { u, name, roomy, spot: best });
    else if (straddle) spotOf.set(id, { u, name, roomy: 0, spot: straddle });
    else {
      // No clean spot: a leader from the roomiest readable point (or the unit's centre).
      const a = anchor ?? labelPoint(u.f, to);
      numbered.push({ id, name, x: a.x, y: a.y, size: 18 * k });
    }
  }
  // Pass 2: a roomy unit's name moves to its middle, where it may overlap a neighbour a little (the
  // owner's call: fine while it is clear which unit the name is for). Every other name stays where
  // pass 1 put it, so an overlap never costs a neighbour its own name.
  for (const [id, p] of spotOf) {
    if (p.roomy <= 0) continue;
    const others = [...spotOf].filter(([o]) => o !== id).map(([, q]) => q.spot.box);
    const { best } = search(p.u, p.name, others, "centre");
    if (best) p.spot = best;
  }
  for (const [id, { name, spot }] of spotOf) labels.push({ id, name, x: spot.x, y: spot.y, size, ...(spot.lines ? { lines: spot.lines } : {}) });
  numbered.sort((a, b) => a.name.localeCompare(b.name, "id"));
  numbered.forEach((l, i) => (l.n = i + 1));
  return { labels, numbered };
}
