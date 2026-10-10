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
