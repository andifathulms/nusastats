"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { carouselApi, dukcapilApi, regionLabel, type CarouselMapValue, type CarouselPackResult } from "@/lib/api";
import { loadPeta, petaAsset, type Peta } from "@/lib/peta";
import { NO_DATA, cropBox, frameOf, framing, insets, kindFor, polygons, project, projector, scaleFor, type Feature, type Geo } from "./geo";
import { FreeSpace, textWidth, type Pt } from "./placement";
import { temaStyle, type Tema } from "./brand";
import { CornerTag, Footer, OffFrameNote } from "./ShareCard";
import { CONTENT_W, CardHeader, H, MapLayout, PAD, TikTokOverlay, W, ZONE, mapBoxFor } from "./layout";

/**
 * 1080×1920 "angka" card: one carousel-data/1 pack (backend api/carousel.py) on
 * a map, for Carousel Press decks (`npm run carousel`). Same exporter contract
 * as ShareCard: #card gets data-card-ready once fonts, data and images are in,
 * and data-card-error with no figures when a guardrail fails.
 *
 *   /card/angka/{scope}?{pack query}              overview: every region's value
 *   /card/angka/{scope}?{pack query}&focus=6409    one region: rank + value on its own map,
 *                                                  over its Peta Wilayah layer (bg=terrain|landcover)
 *
 * scope = Kemendagri province code, or 00 for all of Indonesia. Every number is
 * the pack's, already formatted by the backend (`display`), so the card shows
 * exactly what the deck text says. When a Peta layer hasn't been computed for a
 * region, the card draws its silhouette instead and says so in data-card-note.
 */

type Bg = "terrain" | "landcover" | "none";

// A focused region without its Peta layer: one fixed sea fill. Its value is in
// the big number, and a ramp colour without a legend would only hide the lowest
// values against the coal surface.
const SILHOUETTE = "#41545A"; // neutral slate: the value is in the big number, not the fill
// The TikTok account these carousels are posted on.
const BRAND = "Nusantara Mapper";
const TOP_N = 10;
const PACK_KEYS = ["source", "metric", "level", "period", "prov", "turvar", "th", "unit", "label_metric", "notes",
  "top", "bottom", "allow_partial"];
const LEVEL_NOUN = { provinsi: "provinsi", kabupaten: "kabupaten/kota", kecamatan: "kecamatan" } as const;

function geometryUrl(level: string, scope: string, focus: string | null): string {
  const g = focus ?? "";
  if (g.length === 2 || (!focus && level === "provinsi")) return "/dukcapil-provinces.geojson";
  if (focus) return `/dukcapil-districts-${g.slice(0, 2)}.geojson`;
  if (level === "kecamatan") return `/dukcapil-districts-${scope}.geojson`;
  return "/dukcapil-regencies.geojson";
}

function selectFeatures(geo: Geo, level: string, scope: string, focus: string | null): Feature[] {
  if (focus) return geo.features.filter((f) => (focus.length === 2 ? f.properties.domain_id === focus : f.properties.domain_id.startsWith(focus)));
  if (level === "provinsi" || scope === "00") return geo.features;
  return geo.features.filter((f) => f.properties.domain_id.startsWith(scope));
}

/** §8-style guardrails on the pack itself. Any problem = no card. */
function problems(data: CarouselPackResult, focus: string | null): string[] {
  const { map } = data;
  const out: string[] = [];
  if (!map.values.length) out.push("pack tanpa nilai yang bisa dipetakan");
  if (map.min > map.max) out.push("min > maks");
  if (map.values.some((v) => v.value < map.min || v.value > map.max)) out.push("nilai di luar rentang min–maks");
  if (map.n > map.expected) out.push(`n (${map.n}) > jumlah wilayah (${map.expected})`);
  if (focus && !map.values.some((v) => v.geo === focus)) out.push(`wilayah ${focus} tidak ada di pack`);
  return out;
}

export function AngkaCard({ scope, query, debug, tema = "malam" }: { scope: string; query: URLSearchParams; debug: boolean; tema?: Tema }) {
  const focus = query.get("focus");
  const bg = (query.get("bg") ?? "none") as Bg;
  const asc = query.get("order") === "asc";
  const view = query.get("view");
  const packQuery = useMemo(() => {
    const q = new URLSearchParams();
    for (const k of PACK_KEYS) {
      const v = query.get(k);
      if (v) q.set(k, v);
    }
    if (scope !== "00" && !q.get("prov") && q.get("level") !== "provinsi") q.set("prov", scope);
    return q.toString();
  }, [query, scope]);

  const [data, setData] = useState<CarouselPackResult | null>(null);
  const [geo, setGeo] = useState<Geo | null>(null);
  // A focused kabupaten's own boundary, drawn strong over faint kecamatan lines.
  const [outline, setOutline] = useState<Geo | null | undefined>(undefined);
  const [peta, setPeta] = useState<Peta | null | undefined>(undefined);
  // Kabupaten names for the overview's inset boxes (province scope only).
  const [kabs, setKabs] = useState<Map<string, string> | null | undefined>(undefined);
  const [fatal, setFatal] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(0);
  const [fontsReady, setFontsReady] = useState(false);

  const wantsPeta = !!focus && focus.length >= 4 && bg !== "none";
  const wantsKabs = !focus && view !== "top10" && scope.length === 2 && scope !== "00" && query.get("level") !== "provinsi";

  useEffect(() => {
    carouselApi.pack(packQuery).then(setData).catch((e) => setFatal(String(e.message ?? e)));
    document.fonts.ready.then(() => setFontsReady(true));
  }, [packQuery]);

  useEffect(() => {
    if (!data) return;
    const url = geometryUrl(data.map.level, scope, focus);
    fetch(url)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`batas wilayah ${url} -> ${r.status}`))))
      .then(setGeo)
      .catch((e) => setFatal(String(e.message ?? e)));
    if (wantsPeta) loadPeta(focus!).then(setPeta).catch(() => setPeta(null));
    else setPeta(null);
    if (focus?.length === 4)
      fetch("/dukcapil-regencies.geojson")
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`batas kabupaten -> ${r.status}`))))
        .then(setOutline)
        .catch((e) => setFatal(String(e.message ?? e)));
    else setOutline(null);
    if (wantsKabs)
      dukcapilApi
        .regions({ level: "regency", prov: scope })
        // Box labels: the bare name for a kabupaten (the box says which one), "Kota X" for a city.
        .then((rows) => setKabs(new Map(rows.map((r) => [r.code, /^Kota/.test(r.status) ? regionLabel(r.name, r.status) : r.name]))))
        .catch((e) => setFatal(`nama kabupaten: ${String(e.message ?? e)}`));
    else setKabs(null);
  }, [data, scope, focus, wantsPeta, wantsKabs]);

  const start = Math.max(1, Number(query.get("start")) || 1);
  const issues = data ? problems(data, focus) : [];
  if (data && view === "top10" && start > data.map.values.length) issues.push(`peringkat #${start} tidak ada (${data.map.values.length} wilayah)`);
  const error = fatal ?? (issues.length ? issues.join("; ") : null);

  // The Peta layer behind a focused region, when it exists on this machine.
  const layers =
    peta && wantsPeta
      ? bg === "terrain" && peta.present.elevation && peta.present.hillshade
        ? [petaAsset(focus!, peta.bounds.layers.elevation!), petaAsset(focus!, peta.bounds.layers.hillshade!)]
        : bg === "landcover" && peta.present.landcover
          ? [petaAsset(focus!, peta.bounds.layers.landcover!)]
          : []
      : [];
  const note = wantsPeta && peta !== undefined && !layers.length ? `lapisan ${bg} belum ada untuk ${focus}; siluet` : undefined;
  const ready =
    !error && !!data && !!geo && peta !== undefined && outline !== undefined && kabs !== undefined && fontsReady && loaded === layers.length;

  return (
    <div
      id="card"
      data-card-ready={ready ? "1" : undefined}
      data-card-error={error ?? undefined}
      data-card-note={note}
      className="nm-card relative overflow-hidden bg-coal-bg font-sans text-coal-text"
      style={{ width: W, height: H, ...temaStyle("angka", tema) }}
    >
      {error ? (
        <div className="p-16 text-[28px] text-coal-text">Kartu tidak dibuat: {error}</div>
      ) : data && geo && peta !== undefined && outline !== undefined && kabs !== undefined ? (
        view === "top10" ? (
          <TopBody data={data} asc={asc} start={start} />
        ) : focus ? (
          <FocusBody
            data={data}
            geo={geo}
            focus={focus}
            asc={asc}
            peta={layers.length ? peta : null}
            outline={outline}
            bg={bg}
            layers={layers}
            onImage={() => setLoaded((n) => n + 1)}
            onImageError={(src) => setFatal(`gambar gagal dimuat: ${src}`)}
          />
        ) : (
          <OverviewBody data={data} geo={geo} scope={scope} asc={asc} kabs={kabs} />
        )
      ) : null}
      <CornerTag label={BRAND} />
      {debug && <TikTokOverlay />}
    </div>
  );
}

/** A text-only body (the top-10 card): the text zone, no map. */
function TextBody({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute flex flex-col" style={{ left: PAD, top: ZONE.bodyTop, width: CONTENT_W, height: ZONE.textBottom - ZONE.bodyTop }}>
      {children}
    </div>
  );
}

function scopeLabel(data: CarouselPackResult): string {
  const noun = LEVEL_NOUN[data.map.level];
  return data.map.prov_name ? `${noun} di ${data.map.prov_name}` : `${noun} se-Indonesia`;
}

function partialNote(data: CarouselPackResult): string | null {
  const { n, expected, level } = data.map;
  return n < expected ? `Ada nilai untuk ${n.toLocaleString("id-ID")} dari ${expected.toLocaleString("id-ID")} ${LEVEL_NOUN[level]}.` : null;
}

type Projected = { paths: { id: string; d: string }[]; vw: number; vh: number };
type InsetBox = { kab: string; lines: string[]; x: number; y: number; w: number; h: number; map: { x: number; y: number; w: number; h: number }; own: Projected };
// The composed map: the mainland at (ox, oy) in a vw x vh viewBox, boxes around or over it.
type Composed = { main: Projected; ox: number; oy: number; vw: number; vh: number; boxes: InsetBox[]; unit: number };

const INSET_FONT = 22; // card px, like the other small print
const INSET_MIN_W = 150; // card px: a box is at least this wide, so its name wraps to a few words a line
const INSET_GAP = 20; // card px between the mainland and a box, and between boxes

/** Greedy word wrap to `width` (same units as `size`). */
function wrap(text: string, size: number, width: number): string[] {
  const lines: string[] = [];
  for (const word of text.split(" ")) {
    const last = lines[lines.length - 1];
    if (last && textWidth(`${last} ${word}`, size) <= width) lines[lines.length - 1] = `${last} ${word}`;
    else lines.push(word);
  }
  return lines;
}

/** viewBox units per card px for a composed map of this size. A map with
 * inset boxes is always stacked (map across the card, text below), so the
 * mainland sits centred with its boxes around it. */
function unitFor(vw: number, vh: number): number {
  const box = mapBoxFor(vh / vw, undefined, undefined, false);
  return 1 / Math.min(box.w / vw, box.h / vh);
}

type Group = { kab: string; title: string; own: Projected; anchor: Pt; native: number };

/** A box for one group with its map scaled by k (viewBox units per own unit), at (x, y). */
function boxFor(g: Group, k: number, unit: number, x = 0, y = 0): InsetBox {
  const [font, pad] = [INSET_FONT * unit, 10 * unit];
  const mw = g.own.vw * k;
  const mh = g.own.vh * k;
  const inner = Math.max(mw, INSET_MIN_W * unit);
  const lines = wrap(g.title, font, inner);
  const w = Math.max(inner, ...lines.map((l) => textWidth(l, font))) + 2 * pad;
  const h = mh + 2 * pad + lines.length * font * 1.2 + pad / 2;
  return { kab: g.kab, lines, x, y, w, h, own: g.own, map: { x: x + (w - mw) / 2, y: y + h - pad - mh, w: mw, h: mh } };
}

const moveBox = (b: InsetBox, x: number, y: number): InsetBox => ({ ...b, x, y, map: { ...b.map, x: b.map.x - b.x + x, y: b.map.y - b.y + y } });

/** Stack boxes along one axis near their anchors without overlap, inside [0, len]. */
function spread(items: { at: number; size: number }[], len: number, gap: number): number[] | null {
  const order = items.map((_, i) => i).sort((i, j) => items[i].at - items[j].at);
  const pos = new Array<number>(items.length);
  let next = 0;
  for (const i of order) next = (pos[i] = Math.max(next, Math.min(items[i].at - items[i].size / 2, len - items[i].size))) + items[i].size + gap;
  if (next - gap > len + 1e-6) return null;
  // Pull back from the far end: anything pushed past it moves up as a block.
  let limit = len;
  for (const i of [...order].reverse()) {
    pos[i] = Math.min(pos[i], limit - items[i].size);
    limit = pos[i] - gap;
  }
  return pos.some((p) => p < -1e-6) ? null : pos;
}

/** Boxes in the empty sea of the mainland's own frame, each on the side its islands really lie. */
function composeInside(main: Projected, rings: Pt[][], groups: Group[], unit: number): Composed | null {
  const free = new FreeSpace(main.vw, main.vh);
  free.occupyShape(rings, 1);
  const [cx, cy] = [main.vw / 2, main.vh / 2];
  const boxes: InsetBox[] = [];
  for (const g of groups) {
    const dir = [g.anchor[0] - cx, g.anchor[1] - cy];
    const facing = (x: number, y: number) => (x - cx) * dir[0] + (y - cy) * dir[1] > 0;
    const anchor: Pt = [Math.min(Math.max(g.anchor[0], 0), main.vw), Math.min(Math.max(g.anchor[1], 0), main.vh)];
    let placed: InsetBox | null = null;
    for (const f of [1, 0.4, 0.33, 0.27, 0.22]) {
      const b = boxFor(g, Math.min(g.native, f * main.vw) / Math.max(g.own.vw, g.own.vh), unit);
      const rect = free.place(b.w, b.h, anchor, facing);
      if (rect) {
        placed = moveBox(b, rect.x, rect.y);
        break;
      }
    }
    if (!placed) return null;
    boxes.push(placed);
  }
  return { main, ox: 0, oy: 0, vw: main.vw, vh: main.vh, boxes, unit };
}

/** A column of boxes on each side of a centred mainland (west groups left, east right). */
function composeSides(main: Projected, groups: Group[], unit: number, colPx: number): Composed | null {
  const gap = INSET_GAP * unit;
  const col = colPx * unit;
  const sides = [groups.filter((g) => g.anchor[0] < main.vw / 2), groups.filter((g) => g.anchor[0] >= main.vw / 2)];
  const boxes: InsetBox[] = [];
  for (const [s, list] of sides.entries()) {
    if (!list.length) continue;
    const sized = list.map((g) => {
      const room = col - 20 * unit;
      const k = Math.min(room / g.own.vw, (main.vh / list.length - 80 * unit) / g.own.vh);
      return boxFor(g, Math.max(k, 0), unit);
    });
    if (sized.some((b) => b.w > col + 1e-6 || b.map.h <= 0)) return null;
    const ys = spread(sized.map((b, i) => ({ at: list[i].anchor[1], size: b.h })), main.vh, gap);
    if (!ys) return null;
    sized.forEach((b, i) => boxes.push(moveBox(b, s === 0 ? col - b.w : col + gap + main.vw + gap, ys[i])));
  }
  return { main, ox: col + gap, oy: 0, vw: col * 2 + gap * 2 + main.vw, vh: main.vh, boxes, unit };
}

/** A row of boxes above the mainland (north groups) and one below (south groups). */
function composeRows(main: Projected, groups: Group[], unit: number, rowPx: number): Composed | null {
  const gap = INSET_GAP * unit;
  const row = rowPx * unit;
  const rows = [groups.filter((g) => g.anchor[1] < main.vh / 2), groups.filter((g) => g.anchor[1] >= main.vh / 2)];
  const boxes: InsetBox[] = [];
  for (const [r, list] of rows.entries()) {
    if (!list.length) continue;
    const sized = list.map((g) => {
      const head = boxFor(g, 0, unit).h; // label and padding
      const k = Math.min((row - head) / g.own.vh, (main.vw / list.length - 20 * unit - gap) / g.own.vw);
      return boxFor(g, Math.max(k, 0), unit);
    });
    if (sized.some((b) => b.h > row + 1e-6 || b.map.w <= 0)) return null;
    const xs = spread(sized.map((b, i) => ({ at: list[i].anchor[0], size: b.w })), main.vw, gap);
    if (!xs) return null;
    sized.forEach((b, i) => boxes.push(moveBox(b, xs[i], r === 0 ? row - b.h : (rows[0].length ? row + gap : 0) + main.vh + gap)));
  }
  const top = rows[0].length ? row + gap : 0;
  return { main, ox: 0, oy: top, vw: main.vw, vh: top + main.vh + (rows[1].length ? gap + row : 0), boxes, unit };
}

/** The overview map: the mainland as large as the card allows and, when a
 * province has far islands (geo.insets), each kabupaten's far parts in a
 * labelled box: in the mainland's own empty sea on the side they really lie,
 * in columns either side of a centred mainland, or in a row above/below,
 * whichever leaves the mainland biggest. Boxes have their own scale. */
function overviewMap(feats: Feature[], kabs: Map<string, string> | null): Composed {
  const found = kabs ? insets(feats) : null;
  // A box needs its kabupaten's name from this province's own list (Raja Ampat's
  // shapes still sit in Papua Barat's file); without one, no boxes at all.
  const split = found && found.groups.every((g) => kabs!.has(g.kab)) ? found : null;
  if (!split) {
    const main = project(feats, frameOf(feats));
    return { main, ox: 0, oy: 0, vw: main.vw, vh: main.vh, boxes: [], unit: 1 };
  }
  const main = project(split.main, split.frame);
  const to = projector(split.frame);
  const rings = split.main.flatMap((f) => polygons(f).flatMap((poly) => poly.map((ring) => ring.map(to) as Pt[])));
  const groups: Group[] = split.groups.map((g) => {
    const name = kabs!.get(g.kab)!;
    const [x0, y0] = to([g.frame.west, g.frame.north]);
    const [x1, y1] = to([g.frame.east, g.frame.south]);
    return {
      kab: g.kab,
      title: g.whole ? name : `${name}, pulau terluar`,
      own: project(g.features, g.frame),
      anchor: [(x0 + x1) / 2, (y0 + y1) / 2],
      native: Math.max(x1 - x0, y1 - y0),
    };
  });

  // Each candidate is built at the unit its own size implies (two passes: the unit depends on the result).
  const build = (make: (unit: number) => Composed | null): Composed | null => {
    let c = make(unitFor(main.vw, main.vh));
    if (c) c = make(unitFor(c.vw, c.vh)) ?? c;
    return c && { ...c, unit: unitFor(c.vw, c.vh) };
  };
  const candidates = [
    build((u) => composeInside(main, rings, groups, u)),
    ...[180, 220, 260, 300].map((px) => build((u) => composeSides(main, groups, u, px))),
    ...[160, 200, 240].map((px) => build((u) => composeRows(main, groups, u, px))),
  ].filter((c): c is Composed => !!c);
  // Biggest mainland wins (smallest unit); boxes inside the frame win ties.
  const best = candidates.reduce<Composed | null>((m, c) => (!m || c.unit < m.unit * 0.97 ? c : m), null);
  if (best) return best;
  const whole = project(feats, frameOf(feats));
  return { main: whole, ox: 0, oy: 0, vw: whole.vw, vh: whole.vh, boxes: [], unit: 1 };
}

function OverviewBody({ data, geo, scope, asc, kabs }: { data: CarouselPackResult; geo: Geo; scope: string; asc: boolean; kabs: Map<string, string> | null }) {
  const { map, pack } = data;
  const byGeo = useMemo(() => new Map(map.values.map((v) => [v.geo, v])), [map.values]);
  const { main, ox, oy, vw, vh, boxes, unit } = useMemo(() => overviewMap(selectFeatures(geo, map.level, scope, null), kabs), [geo, map.level, scope, kabs]);
  const { kind, mid } = kindFor(pack.unit);
  const scale = scaleFor(kind, map.min, map.max, mid);
  const lowest = map.values.reduce((a, b) => (b.value < a.value ? b : a));
  const highest = map.values.reduce((a, b) => (b.value > a.value ? b : a));
  const partial = partialNote(data);
  const fill = (id: string) => {
    const v = byGeo.get(id);
    return v ? scale.color(v.value) : NO_DATA;
  };

  return (
    <MapLayout
      aspect={vh / vw}
      side={boxes.length ? false : undefined}
      header={
        <CardHeader kicker={map.kicker} title={map.title}>
          <div className="mt-2 text-[32px] text-coal-muted">{`${scopeLabel(data)} · ${map.period_label}`}</div>
        </CardHeader>
      }
      info={
        <>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 font-mono text-[22px] text-coal-muted">
            <span className="whitespace-nowrap">{lowest.display}</span>
            <div className="h-3 min-w-[120px] flex-1 rounded-full" style={{ background: `linear-gradient(90deg, ${scale.gradient})` }} />
            <span className="whitespace-nowrap">{highest.display}</span>
          </div>
          {/* No names here: the ranking is the payoff of the next slides. */}
          <p className="mt-8 font-display text-[64px] leading-[1.02]">
            {asc ? "Siapa paling rendah?" : "Siapa nomor\u00a01?"}
          </p>
          <p className="mt-3 text-[32px] text-ink-gold">Geser untuk lihat peringkatnya →</p>
          {partial && <p className="mt-4 text-[22px] text-coal-muted">{partial}</p>}
          <Footer source={pack.source} />
        </>
      }
      map={
        <svg viewBox={`0 0 ${vw.toFixed(0)} ${vh.toFixed(0)}`} preserveAspectRatio="xMidYMid meet" className="h-full w-full">
          <g transform={`translate(${ox} ${oy})`}>
            {main.paths.map((p) => (
              <path key={p.id} d={p.d} fill={fill(p.id)} stroke="var(--nm-bg)" strokeWidth={0.6} vectorEffect="non-scaling-stroke" />
            ))}
          </g>
          {boxes.map((b) => (
            <g key={b.kab} data-inset={b.kab}>
              <rect x={b.x} y={b.y} width={b.w} height={b.h} fill="none" stroke="var(--nm-border-strong)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
              {b.lines.map((l, i) => (
                <text key={i} x={b.x + 10 * unit} y={b.y + 10 * unit + INSET_FONT * unit * (0.95 + 1.2 * i)} fontSize={INSET_FONT * unit} fill="var(--nm-muted)" className="font-sans">
                  {l}
                </text>
              ))}
              <svg x={b.map.x} y={b.map.y} width={b.map.w} height={b.map.h} viewBox={`0 0 ${b.own.vw} ${b.own.vh.toFixed(0)}`} preserveAspectRatio="xMidYMid meet">
                {/* Outlined in their own colour: at inset scale most islands are smaller than a pixel. */}
                {b.own.paths.map((p) => (
                  <path key={p.id} d={p.d} fill={fill(p.id)} stroke={fill(p.id)} strokeWidth={2.5} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
                ))}
              </svg>
            </g>
          ))}
        </svg>
      }
    />
  );
}

function FocusBody({
  data,
  geo,
  focus,
  asc,
  peta,
  outline,
  bg,
  layers,
  onImage,
  onImageError,
}: {
  data: CarouselPackResult;
  geo: Geo;
  focus: string;
  asc: boolean;
  peta: Peta | null;
  outline: Geo | null;
  bg: Bg;
  layers: string[];
  onImage: () => void;
  onImageError: (src: string) => void;
}) {
  const { map, pack } = data;
  const v = map.values.find((x) => x.geo === focus) as CarouselMapValue;
  const { paths, edge, view, fit, full } = useMemo(() => {
    const feats = selectFeatures(geo, map.level, "", focus);
    const fit = framing(feats);
    const frame = peta ? peta.bounds : fit.frame;
    const own = outline?.features.filter((f) => f.properties.domain_id === focus) ?? [];
    const { paths, vw, vh } = project(feats, frame);
    const view = peta && fit.cropped ? cropBox(fit.frame, peta.bounds) : { x: 0, y: 0, w: vw, h: vh };
    return { paths, edge: own.length ? project(own, frame).paths : [], view, fit, full: { vw, vh } };
  }, [geo, map.level, focus, peta, outline]);
  const { w: vw, h: vh } = view;
  const counted = useRef(new Set<string>());
  const done = (src: string) => {
    if (counted.current.has(src)) return;
    counted.current.add(src);
    onImage();
  };
  const place = asc ? v.rank_asc : v.rank;
  const word = asc ? "terendah" : "tertinggi";
  const layerSource = !peta
    ? ""
    : bg === "terrain"
      ? "; peta: Copernicus DEM GLO-30 (© DLR e.V., © Airbus DS; Copernicus/EU/ESA)"
      : `; peta: ESA WorldCover ${peta.landcover?.year ?? ""} v200 (CC BY 4.0)`;
  const partial = partialNote(data);

  return (
    <MapLayout
      aspect={vh / vw}
      headerH={300}
      header={
        <CardHeader kicker={map.kicker} title={v.label}>
          <div className="mt-4 flex flex-wrap items-center gap-4">
            <span className="rounded-full bg-kunyit-light px-5 py-1 font-mono text-[34px] font-bold text-laut-950">#{place}</span>
            <span className="font-mono text-[24px] uppercase tracking-[0.1em] text-coal-muted">
              {word} dari {map.n.toLocaleString("id-ID")} {scopeLabel(data)}
            </span>
          </div>
        </CardHeader>
      }
      info={
        <>
          <OffFrameNote items={fit.offFrame} />
          {peta && <LayerLegend peta={peta} bg={bg} />}
          <div className="mt-6 text-[96px] font-extrabold leading-none tracking-[-0.02em] tabular-nums">{v.display}</div>
          <div className="mt-3 text-[26px] text-coal-muted">
            {map.title}, {map.period_label}
          </div>
          {partial && <p className="mt-4 text-[22px] text-coal-muted">{partial}</p>}
          <Footer source={pack.source + layerSource} />
        </>
      }
      map={
        <svg viewBox={`${view.x.toFixed(1)} ${view.y.toFixed(1)} ${vw.toFixed(1)} ${vh.toFixed(1)}`} preserveAspectRatio="xMidYMid meet" className="h-full w-full">
          {layers.map((src, i) => (
            <image
              key={src}
              href={src}
              x={0}
              y={0}
              width={full.vw}
              height={full.vh}
              preserveAspectRatio="none"
              style={{ mixBlendMode: i === 1 ? "multiply" : "normal", imageRendering: bg === "terrain" ? "auto" : "pixelated" }}
              onLoad={() => done(src)}
              onError={() => onImageError(src)}
            />
          ))}
          {/* Kecamatan as faint hairlines (or none on a silhouette), so the
              kabupaten's own outline and its terrain carry the map. */}
          {paths.map((p) => (
            <path
              key={p.id}
              d={p.d}
              fill={peta ? "none" : SILHOUETTE}
              stroke={edge.length ? "var(--nm-border-soft)" : "var(--nm-border-strong)"}
              strokeWidth={edge.length ? 0.6 : 1.6}
              strokeOpacity={peta || !edge.length ? 1 : 0.5}
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {edge.map((p) => (
            <path key={`edge-${p.id}`} d={p.d} fill="none" stroke="var(--nm-edge)" strokeWidth={2.6} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          ))}
        </svg>
      }
    />
  );
}

/** What the Peta layer's colours mean, so the map reads on its own (as on the Peta cards). */
function LayerLegend({ peta, bg }: { peta: Peta; bg: Bg }) {
  if (bg === "landcover" && peta.landcover) {
    const shown = peta.landcover.classes.filter((c) => c.share_pct >= 1).slice(0, 5);
    return (
      <ul className="nm-legend flex shrink-0 flex-wrap gap-x-6 gap-y-2 text-[24px] text-coal-muted">
        {shown.map((c) => (
          <li key={c.code} className="inline-flex items-center gap-2">
            <span className="inline-block h-5 w-5 rounded" style={{ background: c.color }} />
            {c.label}
          </li>
        ))}
      </ul>
    );
  }
  if (bg === "terrain" && peta.terrain) {
    const t = peta.terrain;
    const stops = t.metadata.tint;
    const topIdx = stops.findIndex(([m]) => m >= t.elevation_m.max);
    const shown = stops.slice(0, topIdx === -1 ? stops.length : topIdx + 1);
    const top = shown[shown.length - 1][0] || 1;
    const gradient = shown.map(([m, c]) => `${c} ${((m / top) * 100).toFixed(2)}%`).join(", ");
    return (
      <div className="flex shrink-0 items-center gap-4 font-mono text-[22px] text-coal-muted">
        <span>0</span>
        <div className="h-3 min-w-0 flex-1 rounded-full" style={{ background: `linear-gradient(90deg, ${gradient})` }} />
        <span className="whitespace-nowrap">{top.toLocaleString("id-ID")} m</span>
      </div>
    );
  }
  return null;
}

/** The ranking table, 10 rows per card: #start to #start+9 of the top (or bottom,
 * order=asc), as bars from zero on one scale with the rows above them. The regions
 * the deck counted down to are drawn in the ink colour, the rest muted. */
function TopBody({ data, asc, start = 1 }: { data: CarouselPackResult; asc: boolean; start?: number }) {
  const { map, pack } = data;
  // Regions without a map code (map.unmatched) are left out here as on the maps;
  // the guardrails above already refuse packs where that would matter.
  const ranked = [...map.values].sort((a, b) => (asc ? a.rank_asc - b.rank_asc : a.rank - b.rank) || a.code.localeCompare(b.code));
  const rows = ranked.slice(start - 1, start - 1 + TOP_N);
  const upto = ranked.slice(0, start - 1 + TOP_N);
  const featured = new Set(pack.rows.slice(0, 5).map((r) => r.code));
  if (asc) {
    featured.clear();
    pack.rows.slice(-5).forEach((r) => featured.add(r.code));
  }
  const max = Math.max(...upto.map((r) => Math.abs(r.value)), 1e-9);
  const partial = partialNote(data);
  const word = asc ? "terendah" : "tertinggi";

  return (
    <TextBody>
      <CardHeader kicker={map.kicker} title={start === 1 ? `${rows.length} ${word}` : `#${start}–${start + rows.length - 1} ${word}`}>
        <div className="mt-2 text-[30px] leading-snug text-coal-muted">{`${map.title} · ${scopeLabel(data)} · ${map.period_label}`}</div>
      </CardHeader>
      {/* Ten rows fill the slide: sized for a phone at arm's length. */}
      <ol className="mt-8 flex min-h-0 flex-1 flex-col justify-start gap-5">
        {rows.map((r) => {
          const place = asc ? r.rank_asc : r.rank;
          return (
            <li key={r.code}>
              <div className="flex items-baseline gap-3">
                <span className="w-[72px] shrink-0 font-mono text-[30px] text-ink-gold">#{place}</span>
                <span className="min-w-0 flex-1 truncate text-[36px] font-semibold">{r.label}</span>
                <span className="whitespace-nowrap text-[36px] font-extrabold tabular-nums">{r.display}</span>
              </div>
              <div className="ml-[84px] mt-2 h-4 rounded-full bg-white/5">
                <div
                  className="h-4 rounded-full"
                  style={{ width: `${Math.max(1, (Math.abs(r.value) / max) * 100)}%`, background: featured.has(r.code) ? "var(--nm-ink)" : "var(--nm-bar)" }}
                />
              </div>
            </li>
          );
        })}
      </ol>
      <div className="mt-8 shrink-0">
        {partial && <p className="mb-4 text-[22px] text-coal-muted">{partial}</p>}
        <Footer source={pack.source} />
      </div>
    </TextBody>
  );
}
