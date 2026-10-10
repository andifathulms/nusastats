// Map geometry shared by the 1080x1920 cards: GeoJSON features projected into a
// 1000-wide SVG viewBox (equirectangular with the mid-latitude cosine, the same
// projection the Peta Wilayah rasters are drawn in), plus the dark-surface ramp.

export type Feature = { properties: { domain_id: string; name?: string }; geometry: { type: string; coordinates: unknown } };
export type Geo = { features: Feature[] };
export type Frame = { west: number; south: number; east: number; north: number };

// DESIGN.md: on a dark surface choropleths run dark sea -> cream, so high values
// read as the strongest colour; "no data" stays neutral grey, off the ramp.
export const RAMP = ["#1A2E55", "#2B57A3", "#4F82DC", "#A3BEF0", "#F3ECDD"];
export const NO_DATA = "#2E3442";

export function lerpHex(a: string, b: string, t: number): string {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return `#${pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, "0")).join("")}`;
}

export function rampColor(t: number): string {
  const x = Math.max(0, Math.min(1, t)) * (RAMP.length - 1);
  const i = Math.min(RAMP.length - 2, Math.floor(x));
  return lerpHex(RAMP[i], RAMP[i + 1], x - i);
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

export type Label = { id: string; name: string; x: number; y: number; size: number; n?: number };

/** Names for the features of a map in a box of boxW x boxH card pixels: the
 * roomiest features first, each name inside its feature at 26-34 px when it
 * has room and doesn't collide; the rest get a number (sorted by name) for a
 * legend. Features wholly outside the frame are skipped (an off-frame note
 * names them). */
export function placeLabels(
  feats: Feature[], frame: Frame, vw: number, vh: number, names: Map<string, string>, boxW: number, boxH: number,
): { labels: Label[]; numbered: Label[] } {
  const to = projector(frame);
  const k = 1 / Math.min(boxW / vw, boxH / vh); // viewBox units per card pixel
  const placed: { x0: number; x1: number; y0: number; y1: number }[] = [];
  const labels: Label[] = [];
  const numbered: Label[] = [];
  const spots = feats.map((f) => ({ f, ...labelPoint(f, to) })).sort((a, b) => b.room - a.room);
  for (const s of spots) {
    if (s.x < 0 || s.x > vw || s.y < 0 || s.y > vh) continue;
    const id = s.f.properties.domain_id;
    const name = names.get(id) ?? s.f.properties.name ?? id;
    const size = Math.max(26, Math.min(34, (s.room / k) * 0.55)) * k;
    const w = name.length * size * 0.56;
    const box = { x0: s.x - w / 2, x1: s.x + w / 2, y0: s.y - size * 0.7, y1: s.y + size * 0.5 };
    const clear = !placed.some((p) => box.x0 < p.x1 && box.x1 > p.x0 && box.y0 < p.y1 && box.y1 > p.y0);
    const inside = box.x0 > 0 && box.x1 < vw && box.y0 > 0 && box.y1 < vh;
    if (s.room / k >= 16 && clear && inside) {
      placed.push(box);
      labels.push({ id, name, x: s.x, y: s.y, size });
    } else numbered.push({ id, name, x: s.x, y: s.y, size: 18 * k });
  }
  numbered.sort((a, b) => a.name.localeCompare(b.name, "id"));
  numbered.forEach((l, i) => (l.n = i + 1));
  return { labels, numbered };
}
