"use client";

import { useEffect, useMemo, type ReactNode } from "react";
import { formatNumber, titleCase } from "@/lib/api";
import { frameOf, framing, neighbourColours, placeLabels, polygons, project, projector, type Feature, type Label } from "./geo";
import { CardHeader, PAD, ZONE } from "./layout";
import { Footer, OffFrameNote } from "./ShareCard";
import { FreeSpace, nearestOnRect, textWidth, type Pt, type Rect } from "./placement";
import { LabelLegend, bulanTahun, compact, type Data, type Geos } from "./WilayahCard";

/**
 * Administrative maps of one kabupaten, modelled on the owner's hand-made
 * slides: every unit (kecamatan or desa) filled and named; a name that doesn't
 * fit inside its unit goes in the nearest free space around the map with a
 * leader line; the neighbouring kabupaten drawn full-bleed and named.
 *
 *   wilayah  kecamatan, one colour each (+ ?sorot=1: highest/lowest population,
 *            density and area callouts)
 *   desa     desa vs kelurahan (Dukcapil status), kecamatan borders on top
 */

const W = ZONE.mapRight - PAD; // 952
const HEADER_H = 170;
const GAP = 24;
const BOX_TOP = ZONE.bodyTop + HEADER_H + GAP; // card y of the map box
const MAP_SHARE = 0.8; // of the box width at most: room for names beside wide shapes
const PANO_SHARE = 0.94; // a panorama has room on its own
const SLIDE = 1080;
const ICONS_TOP = 760; // TikTok's like/comment/share column: x 920..1080, y 760..1680 on every slide
const CAT = 8; // kecamatan colours (brand.ts --nm-cat-*)

type Kind = "pop" | "dens" | "area";
const KIND_COLOR: Record<Kind, string> = { pop: "var(--nm-c-pop)", dens: "var(--nm-c-dens)", area: "var(--nm-c-area)" };
type Item = { kind: Kind; label: string; value: string };
type Callout = { id: string; name: string; items: Item[]; anchor: Pt; off: boolean; rect?: Rect; right?: boolean };
type Leader = { id: string; name: string; anchor: Pt; rect: Rect; size: number };

const C = { name: 26, label: 21, value: 23, lh: 1.25 };
const num = (v: number, d = 0) => v.toLocaleString("id-ID", { maximumFractionDigits: d });

function ringsPx(f: Feature, to: (p: number[]) => [number, number], mx: number, my: number, s: number): Pt[][] {
  return polygons(f).flatMap((poly) => poly.map((ring) => ring.map((p) => { const [x, y] = to(p); return [mx + x * s, my + y * s] as Pt; })));
}

function inRings(rings: Pt[][]) {
  return (x: number, y: number) => {
    let ins = false;
    for (const ring of rings)
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i];
        const [xj, yj] = ring[j];
        if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) ins = !ins;
      }
    return ins;
  };
}

const regencyName = (raw: string) => raw.replace(/^KABUPATEN\s+/i, "").replace(/^KAB\.\s*/i, "").toUpperCase();

type Spec = {
  kode: string;
  feats: Feature[]; // the units drawn and named
  names: Map<string, string>;
  fill: (id: string, tones: Map<string, number>) => string;
  borders?: Feature[]; // drawn over the units (kecamatan lines on the desa map)
  labelSize: { min: number; max: number; minRoom: number; leader: number };
  /** More names than this needing a leader = too dense for one slide. With `panorama` the map then
   * spreads over 2 or 3 slides; past 3 (or without it) the rest stay unnamed, and the card says so. */
  maxLeaders?: number;
  panorama?: boolean;
  callouts?: (feats: Feature[], anchorOf: (id: string) => { pt: Pt; off: boolean }) => Callout[];
  /** Height of the info block for a number of numbered names. */
  infoHeight: (numbered: number, offFrame: boolean, unplacedCallouts: boolean) => number;
};

/** Card-x bands where no text may go: each cut between slides (and the next slide's left margin)
 * and TikTok's icon column on every slide. Box coordinates (x from PAD). */
function noTextBands(panels: number, boxH: number, boxTop = BOX_TOP): Rect[] {
  const out: Rect[] = [];
  for (let i = 0; i < panels; i++) {
    const x0 = i * SLIDE + (920 - PAD);
    if (i < panels - 1) out.push({ x: x0, y: 0, w: SLIDE - (920 - PAD) + PAD, h: boxH });
    else out.push({ x: x0, y: ICONS_TOP - boxTop, w: SLIDE - 920, h: boxH });
  }
  return out;
}

/** Leader names in columns beside the map: each side's names sorted top to bottom, each in the
 * column nearest the map with a free row close to its desa's height. Columns never cross a no-text
 * band. Returns every name with its rectangle, or none when no column has room. */
function columnLeaders(items: { l: Label; anchor: Pt }[], mapLeft: number, mapRight: number, BOX: { w: number; h: number }, bands: Rect[], size: number) {
  const row = Math.ceil(size * 1.25);
  // Columns as wide as most names (90th percentile); the odd longer name runs into the gap.
  const widths = items.map((i) => textWidth(i.l.name, size, true)).sort((a, b) => a - b);
  const colW = Math.min(240, (widths[Math.floor(widths.length * 0.9)] ?? 120) + 12);
  const clear = (x: number) => !bands.some((b) => x < b.x + b.w && x + colW > b.x);
  const cols: { x: number; side: "l" | "r"; used: [number, number][] }[] = [];
  for (let x = mapRight + 24; x + colW <= BOX.w; x += 8) if (clear(x)) { cols.push({ x, side: "r", used: [] }); x += colW + 22 - 8; }
  for (let x = mapLeft - 24 - colW; x >= 0; x -= 8) if (clear(x)) { cols.push({ x, side: "l", used: [] }); x -= colW + 22 - 8; }
  const mid = (mapLeft + mapRight) / 2;
  const freeY = (used: [number, number][], target: number): number | null => {
    const sorted = [...used].sort((a, b) => a[0] - b[0]);
    let best: number | null = null;
    let start = 0;
    for (const gap of [...sorted, [BOX.h, BOX.h] as [number, number]]) {
      const end = gap[0];
      if (end - start >= row) {
        const y = Math.min(Math.max(target, start), end - row);
        if (best === null || Math.abs(y - target) < Math.abs(best - target)) best = y;
      }
      start = Math.max(start, gap[1]);
    }
    return best;
  };
  return items.map(({ l, anchor }) => {
    const side = anchor[0] < mid ? "l" : "r";
    const order = [...cols].sort((a, b) =>
      (a.side === side ? 0 : 1) - (b.side === side ? 0 : 1) || Math.abs(a.x - anchor[0]) - Math.abs(b.x - anchor[0]));
    let pick: { col: (typeof cols)[number]; y: number; cost: number } | null = null;
    for (const [i, col] of order.entries()) {
      const y = freeY(col.used, anchor[1] - row / 2);
      if (y === null) continue;
      const cost = Math.abs(y - (anchor[1] - row / 2)) + i * 60;
      if (!pick || cost < pick.cost) pick = { col, y, cost };
    }
    if (!pick) return { l, anchor, rect: null };
    pick.col.used.push([pick.y, pick.y + row]);
    const w = textWidth(l.name, size, true) + 10;
    const x = pick.col.side === "r" ? pick.col.x : pick.col.x + colW - w;
    return { l, anchor, rect: { x, y: pick.y, w, h: row } as Rect };
  });
}

type Blocks = { header: { w: number; h: number }; info: { w: number; h: number } };

/** Tinggi penuh: the map may cover the whole card; text may not go under TikTok's UI. In card
 * coordinates: above the body, below y 1500, the side margins, the icon column, and each cut. */
function fullBands(panels: number): Rect[] {
  const W = SLIDE * panels;
  const out: Rect[] = [
    { x: 0, y: 0, w: W, h: ZONE.wordmarkTop - 20 },
    { x: 0, y: ZONE.textBottom, w: W, h: 1920 - ZONE.textBottom },
    { x: 0, y: 0, w: PAD, h: 1920 },
  ];
  for (let i = 0; i < panels; i++) {
    const right = (i + 1) * SLIDE;
    // The "Nusantara Mapper" wordmark is on every slide.
    out.push({ x: i * SLIDE + PAD - 8, y: ZONE.wordmarkTop - 24, w: 360, h: 72 });
    out.push({ x: i * SLIDE + 920, y: ICONS_TOP, w: SLIDE - 920, h: 1680 - ICONS_TOP });
    out.push({ x: right - (SLIDE - ZONE.mapRight), y: 0, w: SLIDE - ZONE.mapRight + (i < panels - 1 ? PAD : 0), h: 1920 });
  }
  return out;
}

/** Tinggi penuh: the largest map (and its position) that leaves the header's top-left corner and the
 * info block's bottom-left corner on empty space, tested on sample points against the outline. */
function fitAround(rings: (s: number, mx: number, my: number) => Pt[][], vw: number, vh: number, BOX: { w: number; h: number }, b: Blocks, share: number) {
  // BOX is the whole card (or panorama); the blocks sit in the text-safe zone of slide 1.
  const base = Math.min((BOX.w * share) / vw, (BOX.h * 0.98) / vh);
  const header: Rect = { x: PAD, y: ZONE.wordmarkTop - 20, ...b.header, h: b.header.h + (ZONE.bodyTop - ZONE.wordmarkTop + 20) };
  // The info block takes the bottom-left corner, or the bottom-right one (still left of the icons).
  const infos: Rect[] = [
    { x: PAD, y: ZONE.textBottom - b.info.h, ...b.info },
    { x: Math.max(PAD, 920 - b.info.w), y: ZONE.textBottom - b.info.h, ...b.info },
  ];
  const sample = (rect: Rect) => {
    const pts: Pt[] = [];
    for (let y = rect.y; y <= rect.y + rect.h; y += 14) for (let x = rect.x; x <= rect.x + rect.w; x += 14) pts.push([x, y]);
    return pts;
  };
  const headerProbes = sample({ ...header, w: header.w + 16, h: header.h + 16 });
  const infoProbes = infos.map((info) => sample({ ...info, x: info.x - 16, y: info.y - 16, w: info.w + 32, h: info.h + 16 }));
  for (let f = 1; f >= 0.5; f -= 0.04) {
    const s = base * f;
    const free = BOX.w - vw * s;
    const freeY = BOX.h - vh * s;
    for (const ax of [0.5, 0.75, 1, 0.25, 0]) {
      for (const ay of [0.5, 0.25, 0.75, 0, 1]) {
        const mx = free * ax;
        const my = freeY * ay;
        const inside = inRings(rings(s, mx, my));
        if (headerProbes.some(([x, y]) => inside(x, y))) continue;
        const k = infoProbes.findIndex((probes) => !probes.some(([x, y]) => inside(x, y)));
        if (k >= 0) return { s, mx, my, header, info: infos[k] };
      }
    }
  }
  const info = infos[0];
  const s = base * 0.5;
  return { s, mx: BOX.w - vw * s, my: (BOX.h - vh * s) / 2, header, info };
}

function layout(spec: Spec, geo: Geos, BOX: { w: number; h: number }, panels = 1, blocks?: Blocks) {
  const { kode, feats, names } = spec;
  const own = geo.outline.features.filter((f) => f.properties.domain_id === kode);
  const fit = framing(feats);
  const { paths, vw, vh } = project(feats, fit.frame);
  const to = projector(fit.frame);
  const share = panels > 1 ? PANO_SHARE : MAP_SHARE;
  const boxTop = blocks ? 0 : BOX_TOP;
  const boxLeft = blocks ? 0 : PAD;
  let s = Math.min((BOX.w * share) / vw, BOX.h / vh);
  let mx = (BOX.w - vw * s) / 2;
  let my = (BOX.h - vh * s) / 2;
  let headerRect: Rect | null = null;
  let infoRect: Rect | null = null;
  if (blocks) {
    const outline = own.length ? own : feats;
    const f = fitAround((ss, x, y) => outline.flatMap((o) => ringsPx(o, to, x, y, ss)), vw, vh, BOX, blocks, panels > 1 ? PANO_SHARE : 1);
    ({ s, mx, my } = f);
    headerRect = f.header;
    infoRect = f.info;
  }
  const { min, max, minRoom } = spec.labelSize;
  const placed = placeLabels(feats, fit.frame, vw, vh, names, vw * s, vh * s, { min, max, minRoom });
  // A name on a cut between slides or under the icons can't stay inside its unit: give it a leader.
  const bands = blocks ? fullBands(panels) : noTextBands(panels, BOX.h, boxTop);
  placed.labels = placed.labels.filter((l) => {
    const w = (l.lines ? Math.max(...l.lines.map((t) => t.length)) : l.name.length) * l.size * 0.56 * s;
    const h = (l.lines ? 2.3 : 1.2) * l.size * s;
    const x = mx + l.x * s - w / 2;
    const y = my + l.y * s - h / 2;
    const hit = bands.some((b) => x < b.x + b.w && x + w > b.x && y < b.y + b.h && y + h > b.y);
    if (hit) placed.numbered.push({ ...l, lines: undefined });
    return !hit;
  });
  const tones = neighbourColours(feats, CAT);
  const edge = project(own, fit.frame).paths;
  const borderPaths = spec.borders ? project(spec.borders, fit.frame).paths : [];

  // Neighbouring kabupaten anywhere on the card (the land layer is full-bleed).
  const win = { x0: -(boxLeft + mx) / s, x1: (SLIDE * panels - boxLeft - mx) / s, y0: -(boxTop + my) / s, y1: (1920 - boxTop - my) / s };
  const near = geo.outline.features.filter((f) => {
    if (f.properties.domain_id === kode) return false;
    const fr = frameOf([f]);
    const [x0, y0] = to([fr.west, fr.north]);
    const [x1, y1] = to([fr.east, fr.south]);
    return x1 > win.x0 && x0 < win.x1 && y1 > win.y0 && y0 < win.y1;
  });
  const nearPaths = project(near, fit.frame).paths;

  // Free space: the kabupaten is taken; then callouts, leader names, neighbour names.
  const space = new FreeSpace(BOX.w, BOX.h);
  for (const f of own.length ? own : feats) space.occupyShape(ringsPx(f, to, mx, my, s), 1);
  for (const b of bands) space.occupyRect(b);
  if (headerRect) space.occupyRect(headerRect, 1);
  if (infoRect) space.occupyRect(infoRect, 1);
  const px = (l: Label): Pt => [mx + l.x * s, my + l.y * s];
  const anchorOf = (id: string): { pt: Pt; off: boolean } => {
    const l = [...placed.labels, ...placed.numbered].find((x) => x.id === id);
    let pt: Pt;
    if (l) pt = px(l);
    else {
      const fr = frameOf(feats.filter((f) => f.properties.domain_id === id));
      const [cx, cy] = to([(fr.west + fr.east) / 2, (fr.south + fr.north) / 2]);
      pt = [mx + cx * s, my + cy * s];
    }
    const off = pt[0] < 0 || pt[1] < 0 || pt[0] > BOX.w || pt[1] > BOX.h;
    return { pt: off ? [Math.min(Math.max(pt[0], 0), BOX.w), Math.min(Math.max(pt[1], 0), BOX.h)] : pt, off };
  };

  const callouts = spec.callouts ? spec.callouts(feats, anchorOf) : [];
  for (const c of callouts) {
    if (c.off) c.name = `${c.name} (di luar bingkai)`;
    const lines = 1 + c.items.length * 2;
    const w = Math.max(textWidth(c.name, C.name, true), ...c.items.flatMap((i) => [textWidth(i.label, C.label), textWidth(i.value, C.value, true)])) + 8;
    const h = (C.name + (lines - 1) * ((C.label + C.value) / 2)) * C.lh + 8;
    const rect = space.place(w, h, c.anchor);
    if (rect) {
      c.rect = rect;
      c.right = rect.x + rect.w / 2 > c.anchor[0];
    }
  }

  // Names too big for their unit: in free space with a leader line. On one slide each name takes
  // the nearest free spot; a panorama lines them up in columns beside the map, each name level with
  // its desa where it can be, so the leaders fan out (as in the owner's Luwu Utara slides).
  const size = spec.labelSize.leader;
  const leaders: Leader[] = [];
  const numbered: Label[] = [];
  const todo = [...placed.numbered].sort((a, b) => a.y - b.y || a.x - b.x);
  let crowded = 0;
  if (panels > 1) {
    const placedCols = columnLeaders(todo.map((l) => ({ l, anchor: px(l) })), mx, mx + vw * s, BOX, bands, size);
    for (const { l, anchor, rect } of placedCols) {
      const r2 = rect ?? space.place(textWidth(l.name, size, true) + 10, size * 1.3, anchor, undefined, 0);
      if (r2) {
        leaders.push({ id: l.id, name: l.name, anchor, rect: r2, size });
        space.occupyRect(r2);
      } else crowded++;
    }
  } else if (spec.maxLeaders !== undefined && todo.length > spec.maxLeaders) crowded = todo.length;
  else
    for (const l of todo) {
      const anchor = px(l);
      const off = anchor[0] < 0 || anchor[1] < 0 || anchor[0] > BOX.w || anchor[1] > BOX.h;
      const rect = off ? null : space.place(textWidth(l.name, size, true) + 10, size * 1.3, anchor, undefined, 0);
      if (rect) leaders.push({ id: l.id, name: l.name, anchor, rect, size });
      else numbered.push(l);
    }
  numbered.forEach((l, i) => (l.n = i + 1));

  // Neighbour names: at the centre of the part of that neighbour's land the map shows (the mean of
  // its visible sample points), moved only as far as free space requires.
  const neighbourNames: { name: string; rect: Rect }[] = [];
  for (const f of near) {
    const name = regencyName(String(f.properties.name ?? f.properties.domain_id));
    const inside = inRings(ringsPx(f, to, mx, my, s));
    let sx = 0;
    let sy = 0;
    let n = 0;
    for (let y = 8; y < BOX.h; y += 24)
      for (let x = 8; x < BOX.w; x += 24)
        if (inside(x, y)) {
          sx += x;
          sy += y;
          n++;
        }
    if (n < 4) continue; // only a sliver shows: no name
    // Capitals with 2 px tracking run wider than mixed-case text.
    const w = name.length * (26 * 0.66 + 2) + 12;
    const rect = space.place(w, 34, [sx / n, sy / n], inside, 0, true);
    if (rect) neighbourNames.push({ name, rect });
  }
  return { BOX, boxTop, boxLeft, headerRect, infoRect, panels, crowded, paths, edge, borderPaths, nearPaths, labels: placed.labels, numbered, leaders, tones, s, mx, my, callouts, neighbourNames, offFrame: fit.offFrame };
}

/** Tinggi penuh header: kicker, the name over two lines if needed, the province. */
const FULL = { headerW: 560, kicker: 28, sub: 30 };
function titleSize(title: string) {
  return title.length > 22 ? 84 : title.length > 14 ? 96 : 110;
}
function fullHeaderH(title: string, facts: string) {
  const size = titleSize(title);
  const lines = Math.ceil((title.length * size * 0.46) / FULL.headerW);
  const factLines = facts ? Math.ceil((facts.length * 26 * 0.52) / FULL.headerW) : 0;
  return 40 + lines * size * 0.98 + 50 + factLines * 36 + (facts ? 8 : 0);
}

function AdminMap({
  spec, geo, kicker, title, sub, info, infoW, source, panel = 1, onPanels, full = false, facts = "", fullInfo, fullInfoH = 0,
}: {
  spec: Spec; geo: Geos; kicker: string; title: string; sub: string; info: ReactNode; infoW: number; source: string;
  /** Tinggi penuh: the numbers as one line under the title, and a small key (desa legend) instead of `info`. */
  facts?: string;
  fullInfo?: ReactNode;
  fullInfoH?: number;
  /** Which slide of a panorama this card shows (1-based). */
  panel?: number;
  onPanels?: (n: number) => void;
  /** Tinggi penuh: the map takes the whole text height; header and info sit in its empty corners. */
  full?: boolean;
}) {
  // The info block's height depends on how many names end up numbered: re-fit until it's stable.
  // Too crowded for one slide: the same map over 2, then 3 slides (desa).
  const m = useMemo(() => {
    let cur: ReturnType<typeof layout> | null = null;
    let fallback = false; // Tinggi penuh too dense: standard panorama
    for (const n of spec.panorama ? [1, 2, 3] : [1]) {
      const w = n === 1 ? W : SLIDE * n - 2 * PAD;
      const infoH = (x: ReturnType<typeof layout> | null) =>
        spec.infoHeight(x?.numbered.length ?? 0, (x?.offFrame.length ?? 0) > 0, !!x?.callouts.some((c) => !c.rect)) + (x?.crowded ? 36 : 0);
      if (full && !fallback) {
        // Map first: the numbers sit in one line under the title; the bottom block is only the key,
        // the notes and the source line.
        const blocks = (x: ReturnType<typeof layout> | null): Blocks => ({
          header: { w: FULL.headerW, h: fullHeaderH(title, facts) },
          info: {
            w: Math.max(infoW, 520),
            h: fullInfoH + 84 + (x?.numbered.length ? Math.ceil(x.numbered.length / 2) * 34 : 0) + ((x?.offFrame.length ?? 0) > 0 ? 72 : 0) + (x?.crowded ? 36 : 0),
          },
        });
        const fit = (k: number) => {
          const card = { w: SLIDE * k, h: 1920 };
          const a = layout(spec, geo, card, k, blocks(null));
          const b = layout(spec, geo, card, k, blocks(a));
          return b.infoRect!.h !== a.infoRect!.h ? b : a;
        };
        cur = fit(1);
        // Too crowded: as many slides as the map, drawn at full height, is wide (2 or 3). If that
        // still can't name every desa with short leaders (a big map leaves no room for name columns),
        // the standard panorama below does it better: use that instead.
        if (cur.crowded && spec.panorama) {
          const feats = spec.feats;
          const { vw, vh } = project(feats, framing(feats).frame);
          const wide = (vw * ((1920 * 0.98) / vh)) / (SLIDE * PANO_SHARE);
          cur = fit(Math.min(3, Math.max(2, Math.ceil(wide))));
          const lengths = cur.leaders.map((l) => Math.hypot(l.rect.x + l.rect.w / 2 - l.anchor[0], l.rect.y + l.rect.h / 2 - l.anchor[1]));
          const mean = lengths.length ? lengths.reduce((a, b) => a + b, 0) / lengths.length : 0;
          if (!cur.crowded && mean <= 220) break;
          cur = null;
          fallback = true;
          continue;
        }
        break;
      } else {
        const pass = (h: number) => layout(spec, geo, { w, h }, n);
        const room = ZONE.textBottom - BOX_TOP; // the standard layout starts below the header
        cur = pass(room - infoH(null));
        for (let i = 0; i < 2; i++) {
          const h = room - infoH(cur);
          if (h >= cur.BOX.h) break;
          cur = pass(h);
        }
      }
      if (!cur.crowded) break;
    }
    return cur!;
  }, [spec, geo, full, title, infoW, facts, fullInfoH]);
  const { BOX } = m;
  useEffect(() => onPanels?.(m.panels), [m.panels, onPanels]);

  const mapSvg = (
    <svg width={BOX.w} height={BOX.h} viewBox={`0 0 ${BOX.w} ${BOX.h}`} className="overflow-visible">
      <g transform={`translate(${m.mx} ${m.my}) scale(${m.s})`}>
        {m.paths.map((p) => (
          <path key={p.id} d={p.d} fill={spec.fill(p.id, m.tones)} stroke="var(--nm-bg)" strokeWidth={spec.borders ? 0.7 : 1.4} vectorEffect="non-scaling-stroke" />
        ))}
        {m.borderPaths.map((p) => (
          <path key={`b-${p.id}`} d={p.d} fill="none" stroke="var(--nm-edge)" strokeOpacity={0.55} strokeWidth={1.3} vectorEffect="non-scaling-stroke" />
        ))}
        {m.edge.map((p) => (
          <path key={`e-${p.id}`} d={p.d} fill="none" stroke="var(--nm-edge)" strokeWidth={2.6} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        ))}
        {m.labels.map((l) => (
          <text key={l.id} x={l.x} y={l.y} textAnchor="middle" dominantBaseline="middle" fontSize={l.size} fontWeight={600}
            fill="var(--nm-edge)" stroke="var(--nm-bg)" strokeWidth={l.size * 0.18} paintOrder="stroke">
            {l.lines ? l.lines.map((t, i) => (
              <tspan key={i} x={l.x} dy={i === 0 ? -l.size * 0.55 : l.size * 1.1}>{t}</tspan>
            )) : l.name}
          </text>
        ))}
        {m.numbered.map((l) => (
          <g key={`n-${l.id}`}>
            <circle cx={l.x} cy={l.y} r={15 / m.s} fill="var(--nm-edge)" />
            <text x={l.x} y={l.y} textAnchor="middle" dominantBaseline="central" fontSize={19 / m.s} fontWeight={800} fill="var(--nm-bg)">{l.n}</text>
          </g>
        ))}
      </g>
      {m.leaders.map((l) => <LeaderName key={l.id} l={l} />)}
      {m.neighbourNames.map((n) => (
        <text key={n.name} x={n.rect.x + 6} y={n.rect.y + 26} fontSize={26} fontStyle="italic" letterSpacing={2} fill="var(--nm-muted)">
          {n.name}
        </text>
      ))}
      {m.callouts.map((c) => (c.rect ? <CalloutBlock key={c.id} c={c as Required<Callout>} /> : null))}
    </svg>
  );
  const fullNotes = (
    <>
      <OffFrameNote items={m.offFrame} />
      <LabelLegend numbered={m.numbered} />
      {m.crowded > 0 && (
        <p className="mb-2 text-[22px] text-coal-muted">{m.crowded.toLocaleString("id-ID")} nama terlalu rapat; tidak dinamai di peta ini.</p>
      )}
      {fullInfo}
    </>
  );
  const notes = (
    <>
      <OffFrameNote items={m.offFrame} />
      <LabelLegend numbered={m.numbered} />
      {m.crowded > 0 && (
        <p className="mb-2 text-[22px] text-coal-muted">
          {m.crowded.toLocaleString("id-ID")} nama terlalu rapat untuk satu slide; tidak dinamai di peta ini.
        </p>
      )}
      {info}
      {m.callouts.some((c) => !c.rect) && (
        <p className="mt-2 text-[22px] text-coal-muted">
          {m.callouts.filter((c) => !c.rect).map((c) => `${c.name}: ${c.items.map((i) => `${i.label.toLowerCase()} ${i.value}`).join(", ")}`).join(" · ")}
        </p>
      )}
    </>
  );

  return (
    // A panorama is laid out once across all its slides; each card shows its own slice.
    <div className="absolute top-0" style={{ left: -(Math.min(panel, m.panels) - 1) * SLIDE, width: SLIDE * m.panels, height: 1920 }}>
      {/* The neighbours' land runs to the card edges, behind the header and the numbers. */}
      <svg className="absolute left-0 top-0" width={SLIDE * m.panels} height={1920} viewBox={`0 0 ${SLIDE * m.panels} 1920`}>
        <g transform={`translate(${m.boxLeft + m.mx} ${m.boxTop + m.my}) scale(${m.s})`}>
          {m.nearPaths.map((p) => (
            <path key={`n-${p.id}`} d={p.d} fill="var(--nm-prov)" stroke="var(--nm-border-soft)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          ))}
        </g>
      </svg>
      {full && m.headerRect && m.infoRect ? (
        <>
          <div className="absolute" style={{ left: m.boxLeft, top: m.boxTop }}>{mapSvg}</div>
          <div className="absolute" style={{ left: m.headerRect.x, top: ZONE.bodyTop, width: m.headerRect.w }}>
            <div className="font-mono text-[28px] uppercase tracking-[0.1em] text-ink-gold">{kicker}</div>
            <h1 className="mt-2 font-display leading-[0.98]" style={{ fontSize: titleSize(title) }}>{title}</h1>
            <div className="mt-2 text-[30px] text-coal-muted">{sub}</div>
            {facts && <div className="mt-2 text-[26px] font-semibold leading-snug">{facts}</div>}
          </div>
          <div className="absolute flex flex-col justify-end" style={{ left: m.infoRect.x, top: m.infoRect.y, width: m.infoRect.w, height: m.infoRect.h }}>
            {fullNotes}
            <p className="mt-3 text-[20px] leading-snug text-coal-muted">
              Sumber: {m.panels > 1 ? `${source}. Peta ${Math.min(panel, m.panels)} dari ${m.panels}, geser untuk lanjutannya` : source}. Batas wilayah indikatif (BIG).
            </p>
          </div>
        </>
      ) : (
        <div className="absolute flex flex-col" style={{ left: PAD, top: ZONE.bodyTop, width: W, height: ZONE.textBottom - ZONE.bodyTop }}>
          <div className="shrink-0" style={{ height: HEADER_H }}>
            <CardHeader kicker={`${kicker} · ${sub}`} title={title} />
          </div>
          <div className="shrink-0" style={{ marginTop: GAP, width: BOX.w, height: BOX.h }}>{mapSvg}</div>
          <div className="flex min-h-0 flex-1 flex-col" style={{ marginTop: GAP, maxWidth: SLIDE - 2 * PAD - 96 }}>{notes}</div>
        </div>
      )}
      {/* Footer is position: fixed, so it sits on whichever slide this card shows (Tinggi penuh: in the info block). */}
      {!(full && m.headerRect) && <Footer source={m.panels > 1 ? `${source}. Peta ${Math.min(panel, m.panels)} dari ${m.panels}, geser untuk lanjutannya` : source} />}
    </div>
  );
}

function LeaderName({ l }: { l: Leader }) {
  const right = l.rect.x + l.rect.w / 2 > l.anchor[0];
  const start = nearestOnRect(l.anchor, l.rect);
  return (
    <g>
      <line x1={start[0]} y1={start[1]} x2={l.anchor[0]} y2={l.anchor[1]} stroke="var(--nm-ink)" strokeOpacity={0.55} strokeWidth={1.2} />
      <circle cx={l.anchor[0]} cy={l.anchor[1]} r={3} fill="var(--nm-ink)" />
      <text x={right ? l.rect.x + 4 : l.rect.x + l.rect.w - 4} y={l.rect.y + l.size} textAnchor={right ? "start" : "end"} fontSize={l.size}
        fontWeight={600} fill="var(--nm-ink)" stroke="var(--nm-bg)" strokeWidth={l.size * 0.18} paintOrder="stroke">
        {l.name}
      </text>
    </g>
  );
}

function CalloutBlock({ c }: { c: Required<Callout> }) {
  const { rect, right } = c;
  // Text hugs the side facing the map: right-aligned when the block is left of its anchor.
  const x = right ? rect.x + 4 : rect.x + rect.w - 4;
  const anchor = right ? "start" : "end";
  const start = nearestOnRect(c.anchor, rect);
  let y = rect.y + C.name;
  const lines: { text: string; size: number; color: string; bold?: boolean; y: number }[] = [
    { text: c.name, size: C.name, color: "var(--nm-ink)", bold: true, y },
  ];
  for (const i of c.items) {
    y += C.label * C.lh + 4;
    lines.push({ text: i.label, size: C.label, color: KIND_COLOR[i.kind], y });
    y += C.value * C.lh;
    lines.push({ text: i.value, size: C.value, color: KIND_COLOR[i.kind], bold: true, y });
  }
  return (
    <g>
      {!c.off && (
        <>
          <line x1={start[0]} y1={start[1]} x2={c.anchor[0]} y2={c.anchor[1]} stroke="var(--nm-ink)" strokeOpacity={0.7} strokeWidth={1.6} strokeDasharray="2 5" strokeLinecap="round" />
          <circle cx={c.anchor[0]} cy={c.anchor[1]} r={4} fill="var(--nm-ink)" />
        </>
      )}
      {lines.map((l, i) => (
        <text key={i} x={x} y={l.y} textAnchor={anchor} fontSize={l.size} fontWeight={l.bold ? 700 : 500} fill={l.color} stroke="var(--nm-bg)" strokeWidth={4} paintOrder="stroke">
          {l.text}
        </text>
      ))}
    </g>
  );
}

function infoBase(rows: number) {
  return (numbered: number, offFrame: boolean, unplaced: boolean) =>
    GAP + rows * 42 + 12 + (numbered ? Math.ceil(numbered / 3) * 34 + 8 : 0) + (offFrame ? 72 : 0) + (unplaced ? 64 : 0);
}

/** The kecamatan of a kabupaten (template `wilayah`). `sorot`: the extremes callouts. */
export function KecamatanMapBody({ kode, data, geo, sorot, full = false }: { kode: string; data: Data; geo: Geos; sorot: boolean; full?: boolean }) {
  const spec = useMemo<Spec>(() => {
    const feats = geo.inner.features.filter((f) => f.properties.domain_id.startsWith(kode));
    const names = new Map(data.districts.map((d) => [d.domain_id, titleCase(d.domain_name)]));
    return {
      kode, feats, names,
      fill: (id, tones) => `var(--nm-cat-${tones.get(id) ?? 0})`,
      // One size for every name on the map, inside or on a leader.
      labelSize: { min: 24, max: 24, minRoom: 8, leader: 24 },
      infoHeight: infoBase(5),
      callouts: sorot ? (fs, anchorOf) => extremes(fs, data, names, anchorOf) : undefined,
    };
  }, [kode, data, geo, sorot]);
  const pop = data.kab.pop;
  const area = data.kab.area;
  const stats: [string, string][] = [
    ["Kecamatan", formatNumber(data.districts.length)],
    ["Desa/kelurahan", formatNumber(data.villageTotal)],
    ["Penduduk", pop !== null ? `${compact(pop)} (${bulanTahun(data.period)})` : "–"],
    ["Luas", area !== null ? `${num(area, 2)} km²` : "–"],
    ["Kepadatan", pop !== null && area ? `${num(pop / area)} jiwa/km²` : "–"],
  ];
  return (
    <AdminMap
      spec={spec}
      geo={geo}
      kicker="Peta wilayah administrasi"
      sub={data.kab.prov}
      title={data.kab.name}
      info={<StatsList rows={stats} />}
      infoW={480}
      full={full}
      facts={[
        `${formatNumber(data.districts.length)} kecamatan`,
        `${formatNumber(data.villageTotal)} desa/kel.`,
        pop !== null ? `${compact(pop)} jiwa` : null,
        area !== null ? `${num(area)} km²` : null,
      ].filter(Boolean).join(" · ")}
      source={`Penduduk: Ditjen Dukcapil Kemendagri, data ${bulanTahun(data.period)} (terdaftar); luas dan batas: BIG 1:10.000, dijumlahkan NusaStats`}
    />
  );
}

/** Desa vs kelurahan (template `desa`): status from Dukcapil, kecamatan borders on top. */
export function DesaMapBody({
  kode, data, geo, panel = 1, onPanels, full = false,
}: { kode: string; data: Data; geo: Geos; panel?: number; onPanels?: (n: number) => void; full?: boolean }) {
  const status = useMemo(() => new Map(data.villageRegions.map((v) => [v.code, v.status])), [data.villageRegions]);
  const spec = useMemo<Spec>(() => {
    const feats = geo.inner.features.filter((f) => f.properties.domain_id.startsWith(kode));
    const names = new Map(data.villageRegions.map((v) => [v.code, titleCase(v.name)]));
    return {
      kode, feats, names,
      // Unknown status is drawn as no data, never guessed.
      fill: (id) => (status.get(id) === "Kelurahan" ? "var(--nm-kel)" : status.get(id) === "Desa" ? "var(--nm-desa)" : "var(--nm-nodata)"),
      borders: geo.kec?.features.filter((f) => f.properties.domain_id.startsWith(kode)),
      // One size for every name on the map, inside or on a leader.
      labelSize: { min: 18, max: 18, minRoom: 6, leader: 18 },
      maxLeaders: 40,
      panorama: true,
      infoHeight: infoBase(3),
    };
  }, [kode, data, geo, status]);
  const counts = { Kelurahan: 0, Desa: 0, other: 0 };
  for (const v of data.villageRegions) {
    if (v.status === "Kelurahan") counts.Kelurahan++;
    else if (v.status === "Desa") counts.Desa++;
    else counts.other++;
  }
  return (
    <AdminMap
      spec={spec}
      geo={geo}
      kicker="Peta desa dan kelurahan"
      sub={data.kab.prov}
      title={data.kab.name}
      infoW={380}
      full={full}
      fullInfoH={44}
      fullInfo={
        <div className="flex flex-wrap gap-x-8 text-[30px] font-semibold">
          {counts.Kelurahan > 0 && <span className="inline-flex items-center gap-3"><span className="inline-block h-7 w-7 rounded-full" style={{ background: "var(--nm-kel)" }} />Kelurahan {formatNumber(counts.Kelurahan)}</span>}
          {counts.Desa > 0 && <span className="inline-flex items-center gap-3"><span className="inline-block h-7 w-7 rounded-full" style={{ background: "var(--nm-desa)" }} />Desa {formatNumber(counts.Desa)}</span>}
        </div>
      }
      info={
        <ul className="mt-2 space-y-2 text-[34px] font-semibold">
          {counts.Kelurahan > 0 && (
            <li className="flex items-center gap-4"><span className="inline-block h-8 w-8 rounded-full" style={{ background: "var(--nm-kel)" }} />Kelurahan <span className="tabular-nums">{formatNumber(counts.Kelurahan)}</span></li>
          )}
          {counts.Desa > 0 && (
            <li className="flex items-center gap-4"><span className="inline-block h-8 w-8 rounded-full" style={{ background: "var(--nm-desa)" }} />Desa <span className="tabular-nums">{formatNumber(counts.Desa)}</span></li>
          )}
          {counts.other > 0 && <li className="text-[24px] font-normal text-coal-muted">Tanpa status di data Dukcapil: {formatNumber(counts.other)}</li>}
        </ul>
      }
      panel={panel}
      onPanels={onPanels}
      source={`Status desa/kelurahan: Ditjen Dukcapil Kemendagri, data ${bulanTahun(data.period)}; batas desa: BIG 1:10.000`}
    />
  );
}

function StatsList({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-10 gap-y-1 text-[30px] leading-snug">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-coal-muted">{k}</dt>
          <dd className="font-semibold tabular-nums">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Highest/lowest population, density and area per kecamatan, merged per kecamatan. */
function extremes(feats: Feature[], data: Data, names: Map<string, string>, anchorOf: (id: string) => { pt: Pt; off: boolean }): Callout[] {
  const pop = new Map(data.districts.map((d) => [d.domain_id, d.value]));
  const area = new Map(data.districtAreas.map((d) => [d.domain_id, d.value]));
  const rows = feats.map((f) => f.properties.domain_id).filter((id) => pop.has(id)).map((id) => ({ id, pop: pop.get(id)!, area: area.get(id) ?? null }));
  if (rows.length < 2) return [];
  const dens = (r: (typeof rows)[number]) => (r.area ? r.pop / r.area : null);
  const fmtD = (v: number) => `${num(v, v < 100 ? 1 : 0)} jiwa/km²`;
  const fmtA = (v: number) => `${num(v, v < 100 ? 1 : 0)} km²`;
  const list: { kind: Kind; label: string; pick: (r: (typeof rows)[number]) => number | null; fmt: (v: number) => string; hi: boolean }[] = [
    { kind: "pop", label: "Populasi tertinggi", pick: (r) => r.pop, fmt: (v) => `${num(v)} jiwa`, hi: true },
    { kind: "pop", label: "Populasi terendah", pick: (r) => r.pop, fmt: (v) => `${num(v)} jiwa`, hi: false },
    { kind: "dens", label: "Kepadatan tertinggi", pick: dens, fmt: fmtD, hi: true },
    { kind: "dens", label: "Kepadatan terendah", pick: dens, fmt: fmtD, hi: false },
    { kind: "area", label: "Area terluas", pick: (r) => r.area, fmt: fmtA, hi: true },
    { kind: "area", label: "Area terkecil", pick: (r) => r.area, fmt: fmtA, hi: false },
  ];
  const byId = new Map<string, Callout>();
  for (const e of list) {
    const vals = rows.map((r) => ({ r, v: e.pick(r) })).filter((x): x is { r: (typeof rows)[number]; v: number } => x.v !== null);
    if (!vals.length) continue;
    const best = vals.reduce((a, b) => (e.hi ? (b.v > a.v ? b : a) : b.v < a.v ? b : a));
    const { pt, off } = anchorOf(best.r.id);
    const c = byId.get(best.r.id) ?? { id: best.r.id, name: names.get(best.r.id) ?? best.r.id, items: [], anchor: pt, off };
    c.items.push({ kind: e.kind, label: e.label, value: e.fmt(best.v) });
    byId.set(best.r.id, c);
  }
  return [...byId.values()];
}
