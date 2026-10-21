"use client";

import { useMemo } from "react";
import { formatNumber, titleCase } from "@/lib/api";
import { frameOf, framing, neighbourColours, placeLabels, polygons, project, projector, type Feature, type Geo, type Label } from "./geo";
import { CardHeader, PAD, ZONE } from "./layout";
import { Footer, OffFrameNote } from "./ShareCard";
import { FreeSpace, nearestOnRect, textWidth, type Pt, type Rect } from "./placement";
import { LabelLegend, MapLabels, bulanTahun, compact, type Data, type Geos } from "./WilayahCard";

/**
 * Peta wilayah administrasi (kecamatan), v2: every kecamatan in its own colour
 * with its name, the neighbouring kabupaten named around it, callouts for the
 * kecamatan with the highest/lowest population, density and area (dotted
 * leaders into the free space around the map), and the kabupaten's numbers.
 * Population: Dukcapil (registered); area: BIG 1:10.000 boundaries summed.
 */

const W = ZONE.mapRight - PAD; // 952
const HEADER_H = 170;
const GAP = 24;
const BOX_TOP = ZONE.bodyTop + HEADER_H + GAP; // card y of the map box
const MAP_SHARE = 0.8; // of the box width at most: leave room for callouts beside wide shapes
/** The info block under the map: stats (5 rows), the numbered-name legend, the off-frame note
 * and any callout that found no free space. The map box gets the rest, down to y 1500. */
function infoHeight(numbered: number, offFrame: boolean, unplaced: boolean): number {
  return GAP + 5 * 42 + 12 + (numbered ? Math.ceil(numbered / 3) * 34 + 8 : 0) + (offFrame ? 40 : 0) + (unplaced ? 64 : 0);
}
const CAT = 8; // kecamatan colours (brand.ts --nm-cat-*)

type Kind = "pop" | "dens" | "area";
const KIND_COLOR: Record<Kind, string> = { pop: "var(--nm-c-pop)", dens: "var(--nm-c-dens)", area: "var(--nm-c-area)" };
type Item = { kind: Kind; label: string; value: string };
type Callout = { id: string; name: string; items: Item[]; anchor: Pt; off: boolean; rect?: Rect; right?: boolean };

const C = { name: 26, label: 21, value: 23, lh: 1.25 };

function ringsPx(f: Feature, to: (p: number[]) => [number, number], mx: number, my: number, s: number): Pt[][] {
  return polygons(f).flatMap((poly) => poly.map((ring) => ring.map((p) => { const [x, y] = to(p); return [mx + x * s, my + y * s] as Pt; })));
}

function regencyName(raw: string): string {
  return raw.replace(/^KABUPATEN\s+/i, "").replace(/^KAB\.\s*/i, "").toUpperCase();
}

const num = (v: number, d = 0) => v.toLocaleString("id-ID", { maximumFractionDigits: d });

function layout(kode: string, data: Data, geo: Geos, BOX: { w: number; h: number }) {
  {
    const feats = geo.inner.features.filter((f) => f.properties.domain_id.startsWith(kode));
    const own = geo.outline.features.filter((f) => f.properties.domain_id === kode);
    const fit = framing(feats);
    const { paths, vw, vh } = project(feats, fit.frame);
    const s = Math.min((BOX.w * MAP_SHARE) / vw, BOX.h / vh);
    const mx = (BOX.w - vw * s) / 2;
    const my = (BOX.h - vh * s) / 2;
    const to = projector(fit.frame);
    const names = new Map(data.districts.map((d) => [d.domain_id, titleCase(d.domain_name)]));
    const { labels, numbered } = placeLabels(feats, fit.frame, vw, vh, names, vw * s, vh * s);
    const tones = neighbourColours(feats, CAT);
    const edge = project(own, fit.frame).paths;

    // Neighbouring kabupaten that show in the box, drawn as dark land with their name.
    // The whole card, in projected units (the land layer is full-bleed).
    const win = { x0: -(PAD + mx) / s, x1: (1080 - PAD - mx) / s, y0: -(BOX_TOP + my) / s, y1: (1920 - BOX_TOP - my) / s };
    const near = geo.outline.features.filter((f) => {
      if (f.properties.domain_id === kode) return false;
      const fr = frameOf([f]);
      const [x0, y0] = to([fr.west, fr.north]);
      const [x1, y1] = to([fr.east, fr.south]);
      return x1 > win.x0 && x0 < win.x1 && y1 > win.y0 && y0 < win.y1;
    });
    const nearPaths = project(near, fit.frame).paths;

    // Free space: the kabupaten (and its labels) are taken; callouts first, then neighbour names.
    const space = new FreeSpace(BOX.w, BOX.h);
    for (const f of own.length ? own : feats) space.occupyShape(ringsPx(f, to, mx, my, s), 1);
    const px = (l: Label): Pt => [mx + l.x * s, my + l.y * s];

    // Callouts: highest/lowest population, density and area, merged per kecamatan.
    const pop = new Map(data.districts.map((d) => [d.domain_id, d.value]));
    const area = new Map(data.districtAreas.map((d) => [d.domain_id, d.value]));
    const rows = feats
      .map((f) => f.properties.domain_id)
      .filter((id) => pop.has(id))
      .map((id) => ({ id, pop: pop.get(id)!, area: area.get(id) ?? null }));
    const extremes: { kind: Kind; label: string; pick: (r: (typeof rows)[number]) => number | null; fmt: (v: number) => string; hi: boolean }[] = [
      { kind: "pop", label: "Populasi tertinggi", pick: (r) => r.pop, fmt: (v) => `${num(v)} jiwa`, hi: true },
      { kind: "pop", label: "Populasi terendah", pick: (r) => r.pop, fmt: (v) => `${num(v)} jiwa`, hi: false },
      { kind: "dens", label: "Kepadatan tertinggi", pick: (r) => (r.area ? r.pop / r.area : null), fmt: (v) => `${num(v, v < 100 ? 1 : 0)} jiwa/km²`, hi: true },
      { kind: "dens", label: "Kepadatan terendah", pick: (r) => (r.area ? r.pop / r.area : null), fmt: (v) => `${num(v, v < 100 ? 1 : 0)} jiwa/km²`, hi: false },
      { kind: "area", label: "Area terluas", pick: (r) => r.area, fmt: (v) => `${num(v, v < 100 ? 1 : 0)} km²`, hi: true },
      { kind: "area", label: "Area terkecil", pick: (r) => r.area, fmt: (v) => `${num(v, v < 100 ? 1 : 0)} km²`, hi: false },
    ];
    const byId = new Map<string, Callout>();
    const allLabels = [...labels, ...numbered];
    for (const e of rows.length > 1 ? extremes : []) {
      const vals = rows.map((r) => ({ r, v: e.pick(r) })).filter((x): x is { r: (typeof rows)[number]; v: number } => x.v !== null);
      if (!vals.length) continue;
      const best = vals.reduce((a, b) => (e.hi ? (b.v > a.v ? b : a) : b.v < a.v ? b : a));
      const id = best.r.id;
      const l = allLabels.find((x) => x.id === id);
      const f = feats.find((x) => x.properties.domain_id === id)!;
      const fr = frameOf([f]);
      const [cx, cy] = to([(fr.west + fr.east) / 2, (fr.south + fr.north) / 2]);
      const raw: Pt = l ? px(l) : [mx + cx * s, my + cy * s];
      // A kecamatan outside the frame (islands): no leader, the name says where it is.
      const off = raw[0] < 0 || raw[1] < 0 || raw[0] > BOX.w || raw[1] > BOX.h;
      const anchor: Pt = off ? [Math.min(Math.max(raw[0], 0), BOX.w), Math.min(Math.max(raw[1], 0), BOX.h)] : raw;
      const c = byId.get(id) ?? { id, name: names.get(id) ?? id, items: [], anchor, off };
      c.items.push({ kind: e.kind, label: e.label, value: e.fmt(best.v) });
      byId.set(id, c);
    }
    const callouts = [...byId.values()];
    for (const c of callouts) {
      if (c.off) c.name = `${c.name} (di luar bingkai)`;
      const lines = [c.name, ...c.items.flatMap((i) => [i.label, i.value])];
      const w = Math.max(textWidth(c.name, C.name, true), ...c.items.flatMap((i) => [textWidth(i.label, C.label), textWidth(i.value, C.value, true)])) + 8;
      const h = (C.name + (lines.length - 1) * ((C.label + C.value) / 2)) * C.lh + 8;
      const rect = space.place(w, h, c.anchor);
      if (rect) {
        c.rect = rect;
        c.right = rect.x + rect.w / 2 > c.anchor[0];
      }
    }

    // Neighbour names: inside that neighbour's land, in free space, as close to the kabupaten as fits.
    const centre: Pt = [mx + (vw * s) / 2, my + (vh * s) / 2];
    const neighbourNames: { name: string; rect: Rect }[] = [];
    for (const f of near) {
      const name = regencyName(String((f.properties as { name?: string }).name ?? f.properties.domain_id));
      const rings = ringsPx(f, to, mx, my, s);
      const inside = (x: number, y: number) => {
        let ins = false;
        for (const ring of rings)
          for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
            const [xi, yi] = ring[i];
            const [xj, yj] = ring[j];
            if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) ins = !ins;
          }
        return ins;
      };
      const rect = space.place(textWidth(name, 26) + 12, 34, centre, inside, 0);
      if (rect) neighbourNames.push({ name, rect });
    }
    return { BOX, feats, paths, edge, nearPaths, labels, numbered, tones, s, mx, my, callouts, neighbourNames, offFrame: fit.offFrame };
  }
}

export function AdminMapBody({ kode, data, geo }: { kode: string; data: Data; geo: Geos }) {
  // Two passes: the info block's height depends on how many names end up numbered.
  const m = useMemo(() => {
    const full = ZONE.textBottom - BOX_TOP;
    const first = layout(kode, data, geo, { w: W, h: full - infoHeight(0, false, false) });
    const unplaced = (x: typeof first) => x.callouts.some((c) => !c.rect);
    const h = full - infoHeight(first.numbered.length, first.offFrame.length > 0, unplaced(first));
    const second = layout(kode, data, geo, { w: W, h });
    // Fewer labels fit in a smaller box: if that adds legend rows, shrink once more.
    const h2 = full - infoHeight(second.numbered.length, second.offFrame.length > 0, unplaced(second));
    return h2 < h ? layout(kode, data, geo, { w: W, h: h2 }) : second;
  }, [geo, kode, data]);
  const BOX = m.BOX;

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
    <>
      {/* The neighbours' land runs to the card edges, behind the header and the numbers. */}
      <svg className="absolute left-0 top-0" width={1080} height={1920} viewBox="0 0 1080 1920">
        <g transform={`translate(${PAD + m.mx} ${BOX_TOP + m.my}) scale(${m.s})`}>
          {m.nearPaths.map((p) => (
            <path key={`n-${p.id}`} d={p.d} fill="var(--nm-prov)" stroke="var(--nm-border-soft)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          ))}
        </g>
      </svg>
    <div className="absolute flex flex-col" style={{ left: PAD, top: ZONE.bodyTop, width: W, height: ZONE.textBottom - ZONE.bodyTop }}>
      <div className="shrink-0" style={{ height: HEADER_H }}>
        <CardHeader kicker={`Peta wilayah administrasi · ${data.kab.prov}`} title={data.kab.name} />
      </div>
      <div className="shrink-0" style={{ marginTop: GAP, width: BOX.w, height: BOX.h }}>
        <svg width={BOX.w} height={BOX.h} viewBox={`0 0 ${BOX.w} ${BOX.h}`} className="overflow-visible">
          <g transform={`translate(${m.mx} ${m.my}) scale(${m.s})`}>
            {m.paths.map((p) => (
              <path key={p.id} d={p.d} fill={`var(--nm-cat-${m.tones.get(p.id) ?? 0})`} stroke="var(--nm-bg)" strokeWidth={1.4} vectorEffect="non-scaling-stroke" />
            ))}
            {m.edge.map((p) => (
              <path key={`e-${p.id}`} d={p.d} fill="none" stroke="var(--nm-edge)" strokeWidth={2.6} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
            ))}
            <MapLabels labels={m.labels} numbered={m.numbered} k={1 / m.s} />
          </g>
          {m.neighbourNames.map((n) => (
            <text key={n.name} x={n.rect.x + 6} y={n.rect.y + 26} fontSize={26} fontStyle="italic" letterSpacing={2} fill="var(--nm-muted)">
              {n.name}
            </text>
          ))}
          {m.callouts.map((c) => (c.rect ? <CalloutBlock key={c.id} c={c as Required<Callout>} /> : null))}
        </svg>
      </div>
      <div className="flex min-h-0 flex-1 flex-col" style={{ marginTop: GAP }}>
        <OffFrameNote items={m.offFrame} />
        <LabelLegend numbered={m.numbered} />
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-10 gap-y-1 text-[30px] leading-snug">
          {stats.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-coal-muted">{k}</dt>
              <dd className="font-semibold tabular-nums">{v}</dd>
            </div>
          ))}
        </dl>
        {m.callouts.some((c) => !c.rect) && (
          <p className="mt-2 text-[22px] text-coal-muted">
            {m.callouts.filter((c) => !c.rect).map((c) => `${c.name}: ${c.items.map((i) => `${i.label.toLowerCase()} ${i.value}`).join(", ")}`).join(" · ")}
          </p>
        )}
        <Footer source={`Penduduk: Ditjen Dukcapil Kemendagri, data ${bulanTahun(data.period)} (terdaftar); luas dan batas: BIG 1:10.000, dijumlahkan NusaStats`} />
      </div>
    </div>
    </>
  );
}

function CalloutBlock({ c }: { c: Required<Callout> }) {
  const { rect, right } = c;
  // Text hugs the side facing the map: right-aligned when the block is left of its anchor.
  const x = right ? rect.x + 4 : rect.x + rect.w - 4;
  const anchor = right ? "start" : "end";
  const start = nearestOnRect(c.anchor, rect);
  const leader = !c.off;
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
      {leader && (
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


