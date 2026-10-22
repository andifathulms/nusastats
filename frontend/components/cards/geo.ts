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
  return { paths, vw, vh };
}

/** The projection `project` uses, as a function on [lon, lat]. */
export function projector(frame: Frame) {
  const cosMid = Math.cos((((frame.south + frame.north) / 2) * Math.PI) / 180);
  const s = 1000 / ((frame.east - frame.west) * cosMid || 1);
  return ([x, y]: number[]): [number, number] => [(x - frame.west) * s * cosMid, (frame.north - y) * s];
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
  const placed: { x0: number; x1: number; y0: number; y1: number }[] = [];
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
  for (const u of units) {
    const id = u.f.properties.domain_id;
    const name = names.get(id) ?? u.f.properties.name ?? id;
    const [x0, x1, y0, y1] = u.bbox;
    if (x1 < 0 || x0 > vw || y1 < 0 || y0 > vh) continue; // wholly off the frame: the off-frame note names it
    const inside = (x: number, y: number) => u.polys.some((poly) => insideRings([x, y], poly));
    const room = (x: number, y: number) => Math.max(...u.polys.map((poly) => (insideRings([x, y], poly) ? edgeDistance([x, y], poly) : 0)));
    const size = Math.max(min, Math.min(max, max)) * k;
    const split = twoLines(name);
    const variants: { lines?: [string, string]; w: number; up: number; down: number }[] = [
      { w: name.length * size * 0.56, up: size * 0.7, down: size * 0.5 },
      ...(split ? [{ lines: split, w: Math.max(...split.map((t) => t.length)) * size * 0.56, up: size * 1.25, down: size * 1.05 }] : []),
    ];
    const N = 18;
    let best: { x: number; y: number; v: (typeof variants)[number]; score: number; room: number } | null = null;
    let anchor: { x: number; y: number; room: number } | null = null;
    for (let i = 0; i <= N; i++)
      for (let j = 0; j <= N; j++) {
        const x = x0 + ((x1 - x0) * i) / N;
        const y = y0 + ((y1 - y0) * j) / N;
        if (!inside(x, y)) continue;
        const r = room(x, y);
        if (ok(x, y) && (!anchor || r > anchor.room)) anchor = { x, y, room: r };
        for (const [vi, v] of variants.entries()) {
          const box = { x0: x - v.w / 2, x1: x + v.w / 2, y0: y - v.up, y1: y + v.down };
          if (box.x0 < 0 || box.x1 > vw || box.y0 < 0 || box.y1 > vh) continue;
          if (placed.some((p) => box.x0 < p.x1 && box.x1 > p.x0 && box.y0 < p.y1 && box.y1 > p.y0)) continue;
          let hit = 0;
          let n = 0;
          let blocked = false;
          for (let a = 0; a <= 4 && !blocked; a++)
            for (let b = 0; b <= 2; b++) {
              const px = box.x0 + ((box.x1 - box.x0) * a) / 4;
              const py = box.y0 + ((box.y1 - box.y0) * b) / 2;
              if (!ok(px, py)) { blocked = true; break; }
              n++;
              if (inside(px, py)) hit++;
            }
          if (blocked) continue;
          // One line beats two at the same fit; within a fit, the spot farthest from the edge wins.
          const score = Math.round((hit / n) * 10) - vi * 0.5;
          if (!best || score > best.score || (score === best.score && r > best.room)) best = { x, y, v, score, room: r };
        }
      }
    // At least half the name on its own unit (a name may spill over a small one, as on hand-made maps).
    if (best && best.score >= 5 && best.room / k >= minRoom * 0.25) {
      placed.push({ x0: best.x - best.v.w / 2, x1: best.x + best.v.w / 2, y0: best.y - best.v.up, y1: best.y + best.v.down });
      labels.push({ id, name, x: best.x, y: best.y, size, ...(best.v.lines ? { lines: best.v.lines } : {}) });
    } else {
      // No clean spot: a leader from the roomiest readable point (or the unit's centre).
      const a = anchor ?? labelPoint(u.f, to);
      numbered.push({ id, name, x: a.x, y: a.y, size: 18 * k });
    }
  }
  numbered.sort((a, b) => a.name.localeCompare(b.name, "id"));
  numbered.forEach((l, i) => (l.n = i + 1));
  return { labels, numbered };
}
