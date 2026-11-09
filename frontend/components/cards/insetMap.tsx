import { frameOf, polygons, project, projector, type Feature, type Insets } from "./geo";
import { FreeSpace, textWidth, type Pt } from "./placement";
import { mapBoxFor } from "./layout";

/**
 * A map with inset boxes, for cards that stack the map across the card with text
 * below (MapLayout, side={false}): the mainland as large as the card allows and
 * each group of far islands (geo.insets, geo.kabInsets) in a labelled box with
 * its own scale. Boxes go in the mainland's own empty sea on the side their
 * islands really lie, in columns either side of a centred mainland, or in a row
 * above/below, whichever leaves the mainland biggest. Used by the angka overview
 * (kabupaten boxes) and the kepadatan hook (kecamatan boxes).
 */

export type Projected = { paths: { id: string; d: string }[]; vw: number; vh: number };
export type InsetBox = { kab: string; lines: string[]; x: number; y: number; w: number; h: number; map: { x: number; y: number; w: number; h: number }; own: Projected };
// The composed map: the mainland at (ox, oy) in a vw x vh viewBox, boxes around or over it.
export type Composed = { main: Projected; ox: number; oy: number; vw: number; vh: number; boxes: InsetBox[]; unit: number; dropped?: string[] };

export const INSET_FONT = 22; // card px, like the other small print
const INSET_MIN_W = 150; // card px: a box is at least this wide, so its name wraps to a few words a line
const INSET_GAP = 20; // card px between the mainland and a box, and between boxes

/** Greedy word wrap to `width` (same units as `size`). */
function wrap(text: string, size: number, width: number): string[] {
  const lines: string[] = [];
  for (const word of text.split(" ")) {
    const last = lines[lines.length - 1];
    if (last && textWidth(`${last} ${word}`, size, true) <= width) lines[lines.length - 1] = `${last} ${word}`;
    else lines.push(word);
  }
  return lines;
}

/** viewBox units per card px for a composed map of this size. A map with
 * inset boxes is always stacked (map across the card, text below), so the
 * mainland sits centred with its boxes around it. `area` is the map's box as
 * measured on the card; before that, the layout's estimate. */
function unitFor(vw: number, vh: number, area: { w: number; h: number } | undefined, infoH: number): number {
  const box = area ?? mapBoxFor(vh / vw, undefined, infoH, false);
  return 1 / Math.min(box.w / vw, box.h / vh);
}

type Group = { kab: string; title: string; own: Projected; anchor: Pt; native: number };

/** A box for one group with its map scaled by k (viewBox units per own unit), at (x, y). */
function boxFor(g: Group, k: number, unit: number, x = 0, y = 0): InsetBox {
  const [font, pad] = [INSET_FONT * unit, 10 * unit];
  const mw = g.own.vw * k;
  const mh = g.own.vh * k;
  let inner = Math.max(mw, INSET_MIN_W * unit);
  let lines = wrap(g.title, font, inner);
  // A long name ("Kep. Sangihe, Talaud dan Siau Tagulandang Biaro"): widen the box, up to
  // 260 px, until it takes 3 lines at most rather than one word a line.
  while (lines.length > 3 && inner < 260 * unit) lines = wrap(g.title, font, (inner += 10 * unit));
  const w = Math.max(inner, ...lines.map((l) => textWidth(l, font, true))) + 2 * pad;
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

/** Boxes in the empty sea of the mainland's own frame, each on the side its islands really lie.
 * `margin` (a fraction of the mainland's longer side) widens that sea on every side first:
 * a whole island like Sulawesi leaves little room in its own corners. */
function composeInside(main: Projected, rings: Pt[][], groups: Group[], unit: number, margin = 0): Composed | null {
  const m = margin * Math.max(main.vw, main.vh);
  const [vw, vh] = [main.vw + 2 * m, main.vh + 2 * m];
  const free = new FreeSpace(vw, vh);
  free.occupyShape(rings.map((r) => r.map(([x, y]) => [x + m, y + m] as Pt)), 1);
  const [cx, cy] = [vw / 2, vh / 2];
  const boxes: InsetBox[] = [];
  for (const g of groups) {
    const [ax, ay] = [g.anchor[0] + m, g.anchor[1] + m];
    const dir = [ax - cx, ay - cy];
    const facing = (x: number, y: number) => (x - cx) * dir[0] + (y - cy) * dir[1] > 0;
    const anchor: Pt = [Math.min(Math.max(ax, 0), vw), Math.min(Math.max(ay, 0), vh)];
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
  // Trim to what's drawn (the margin is only room to search; unused sea would shrink the
  // map). This also covers the grid rounding up: a box may reach a little past vw/vh.
  const x0 = Math.min(m, ...boxes.map((b) => b.x));
  const y0 = Math.min(m, ...boxes.map((b) => b.y));
  const x1 = Math.max(m + main.vw, ...boxes.map((b) => b.x + b.w));
  const y1 = Math.max(m + main.vh, ...boxes.map((b) => b.y + b.h));
  return { main, ox: m - x0, oy: m - y0, vw: x1 - x0, vh: y1 - y0, boxes: boxes.map((b) => moveBox(b, b.x - x0, b.y - y0)), unit };
}

/** A column of boxes on each side of a centred mainland (west groups left, east right). */
function composeSides(main: Projected, groups: Group[], unit: number, colPx: number, balanced = false): Composed | null {
  const gap = INSET_GAP * unit;
  const col = colPx * unit;
  let sides = [groups.filter((g) => g.anchor[0] < main.vw / 2), groups.filter((g) => g.anchor[0] >= main.vw / 2)];
  // Balanced: every box on one side moves over except the one nearest the mainland, so both
  // sides get a box (Pangkep: the Spermonde islands left, Kalmas and Tangaya right).
  if (balanced && groups.length > 1 && sides.some((l) => !l.length)) {
    const dist = (g: Group) => Math.hypot(g.anchor[0] - main.vw / 2, g.anchor[1] - main.vh / 2);
    const nearest = groups.reduce((a, b) => (dist(b) < dist(a) ? b : a));
    const own = nearest.anchor[0] < main.vw / 2 ? 0 : 1;
    sides = own === 0 ? [[nearest], groups.filter((g) => g !== nearest)] : [groups.filter((g) => g !== nearest), [nearest]];
  }
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

/** The composed map for an inset split, or null when no arrangement fits.
 * `title` names each box; `area` is the map slot measured on the card (before
 * that, the layout's estimate with `infoH` px of text below the map). */
export function composeMap(
  split: Insets, title: (g: Insets["groups"][number]) => string, area: { w: number; h: number } | undefined, infoH: number,
  /** "sides": boxes only in columns left and right of the mainland, one side each where there are two. */
  arrange: "best" | "sides" = "best",
): (Composed & { real: number }) | null {
  const main = project(split.main, split.frame);
  const to = projector(split.frame);
  const rings = split.main.flatMap((f) => polygons(f).flatMap((poly) => poly.map((ring) => ring.map(to) as Pt[])));
  const groups: Group[] = split.groups.map((g) => {
    const [x0, y0] = to([g.frame.west, g.frame.north]);
    const [x1, y1] = to([g.frame.east, g.frame.south]);
    return {
      kab: g.kab,
      title: title(g),
      own: project(g.features, g.frame),
      anchor: [(x0 + x1) / 2, (y0 + y1) / 2],
      native: Math.max(x1 - x0, y1 - y0),
    };
  });

  // Boxes and their text are sized with `unit`; the composed map's real scale follows
  // from its size, so rebuild until the two agree (within 2%), keeping the last that fit.
  const build = (make: (unit: number) => Composed | null): (Composed & { real: number }) | null => {
    let [c, u] = [null as Composed | null, unitFor(main.vw, main.vh, area, infoH)];
    for (let i = 0; i < 5; i++) {
      const next = make(u);
      if (!next) {
        // Fits at the last unit, not at this one: bisect between the two.
        if (!c) break;
        let [lo, hi]: [number, number] = [c.unit, u];
        for (let j = 0; j < 5; j++) {
          const mid: number = (lo + hi) / 2;
          const m = make(mid);
          if (m) [c, lo] = [m, mid];
          else hi = mid;
        }
        break;
      }
      c = next;
      const real = unitFor(c.vw, c.vh, area, infoH);
      if (Math.abs(real - u) <= 0.02 * u) break;
      u = real;
    }
    // A build that never settled has boxes sized for a bigger map: its text would print
    // small. Keep it only when the text still comes out at 90% of INSET_FONT or more.
    const real = c && unitFor(c.vw, c.vh, area, infoH);
    return c && real && c.unit >= 0.9 * real ? { ...c, real } : null;
  };
  const candidates = (arrange === "sides"
    ? [180, 220, 260, 300].map((px) => build((u) => composeSides(main, groups, u, px, true)))
    : [
    ...[0, 0.06, 0.12, 0.2, 0.28, 0.36, 0.45].map((margin) => build((u) => composeInside(main, rings, groups, u, margin))),
    ...[180, 220, 260, 300].map((px) => build((u) => composeSides(main, groups, u, px))),
    ...[160, 200, 240].map((px) => build((u) => composeRows(main, groups, u, px))),
  ]).filter((c): c is Composed & { real: number } => !!c);
  // Biggest mainland wins (smallest unit); boxes inside the frame win ties.
  const best = candidates.reduce<(Composed & { real: number }) | null>((m, c) => (!m || c.real < m.real * 0.97 ? c : m), null);
  return best ? { ...best, dropped: split.dropped } : null;
}

/** The whole region in one frame, no boxes. */
export function plainMap(feats: Feature[]): Composed {
  const main = project(feats, frameOf(feats));
  return { main, ox: 0, oy: 0, vw: main.vw, vh: main.vh, boxes: [], unit: 1 };
}

/** The boxes of a composed map, inside its svg: frame, name, and the islands in their own colour. */
export function InsetBoxes({ boxes, unit, fill }: { boxes: InsetBox[]; unit: number; fill: (id: string) => string }) {
  return (
    <>
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
    </>
  );
}
