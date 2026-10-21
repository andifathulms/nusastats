// Free-space placement for map annotations (callouts, neighbour names), in card
// pixels. The map's own shape is "occupied"; a block goes in the free cell
// rectangle closest to its anchor, so annotations sit in the empty corners,
// the sea or the neighbours' land, never on the region itself.

export type Pt = [number, number];
export type Rect = { x: number; y: number; w: number; h: number };

const CELL = 12;

function inRings(x: number, y: number, rings: Pt[][]): boolean {
  let inside = false;
  for (const ring of rings)
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
  return inside;
}

export class FreeSpace {
  readonly cols: number;
  readonly rows: number;
  private used: Uint8Array;

  constructor(readonly w: number, readonly h: number) {
    this.cols = Math.ceil(w / CELL);
    this.rows = Math.ceil(h / CELL);
    this.used = new Uint8Array(this.cols * this.rows);
  }

  /** Mark every cell whose centre is inside the rings (even-odd), grown by `pad` cells. */
  occupyShape(rings: Pt[][], pad = 1): void {
    const hit = new Uint8Array(this.cols * this.rows);
    for (let r = 0; r < this.rows; r++)
      for (let c = 0; c < this.cols; c++) if (inRings((c + 0.5) * CELL, (r + 0.5) * CELL, rings)) hit[r * this.cols + c] = 1;
    for (let r = 0; r < this.rows; r++)
      for (let c = 0; c < this.cols; c++) {
        if (!hit[r * this.cols + c]) continue;
        for (let dr = -pad; dr <= pad; dr++)
          for (let dc = -pad; dc <= pad; dc++) this.mark(c + dc, r + dr);
      }
  }

  occupyRect(rect: Rect, pad = 0): void {
    const c0 = Math.floor(rect.x / CELL) - pad;
    const r0 = Math.floor(rect.y / CELL) - pad;
    const c1 = Math.ceil((rect.x + rect.w) / CELL) + pad;
    const r1 = Math.ceil((rect.y + rect.h) / CELL) + pad;
    for (let r = r0; r < r1; r++) for (let c = c0; c < c1; c++) this.mark(c, r);
  }

  private mark(c: number, r: number): void {
    if (c >= 0 && r >= 0 && c < this.cols && r < this.rows) this.used[r * this.cols + c] = 1;
  }

  private free(c0: number, r0: number, cw: number, rh: number, within?: (x: number, y: number) => boolean): boolean {
    if (c0 < 0 || r0 < 0 || c0 + cw > this.cols || r0 + rh > this.rows) return false;
    for (let r = r0; r < r0 + rh; r++)
      for (let c = c0; c < c0 + cw; c++) {
        if (this.used[r * this.cols + c]) return false;
        if (within && !within((c + 0.5) * CELL, (r + 0.5) * CELL)) return false;
      }
    return true;
  }

  /** Whether every cell under `rect` is free (and inside the grid). */
  isFree(rect: Rect): boolean {
    const c0 = Math.floor(rect.x / CELL);
    const r0 = Math.floor(rect.y / CELL);
    return this.free(c0, r0, Math.ceil((rect.x + rect.w) / CELL) - c0, Math.ceil((rect.y + rect.h) / CELL) - r0);
  }

  /** The free w x h rectangle nearest to `anchor` (distance from the rectangle's
   * nearest edge point), or null when none fits. `within` limits the cells
   * (e.g. inside a neighbour's polygon). The rectangle is then marked used. */
  place(w: number, h: number, anchor: Pt, within?: (x: number, y: number) => boolean, gap = 1, centred = false): Rect | null {
    const cw = Math.ceil(w / CELL);
    const rh = Math.ceil(h / CELL);
    let best: { rect: Rect; d: number } | null = null;
    for (let r = 0; r + rh <= this.rows; r++)
      for (let c = 0; c + cw <= this.cols; c++) {
        const rect = { x: c * CELL, y: r * CELL, w: cw * CELL, h: rh * CELL };
        // Callouts and leaders: nearest edge. Names that belong at a spot: nearest centre.
        const d = centred ? Math.hypot(rect.x + rect.w / 2 - anchor[0], rect.y + rect.h / 2 - anchor[1]) : distToRect(anchor, rect);
        if (best && d >= best.d) continue;
        if (!this.free(c, r, cw, rh, within)) continue;
        best = { rect, d };
      }
    if (best) this.occupyRect(best.rect, gap);
    return best?.rect ?? null;
  }
}

export function distToRect([x, y]: Pt, r: Rect): number {
  const dx = Math.max(r.x - x, 0, x - (r.x + r.w));
  const dy = Math.max(r.y - y, 0, y - (r.y + r.h));
  return Math.hypot(dx, dy);
}

/** The point on a rectangle's edge nearest to `p` (where a leader line starts). */
export function nearestOnRect([x, y]: Pt, r: Rect): Pt {
  return [Math.min(Math.max(x, r.x), r.x + r.w), Math.min(Math.max(y, r.y), r.y + r.h)];
}

/** Rough text width in card px (Archivo; enough for layout, not for kerning). */
export const textWidth = (s: string, size: number, bold = false) => s.length * size * (bold ? 0.56 : 0.52);
