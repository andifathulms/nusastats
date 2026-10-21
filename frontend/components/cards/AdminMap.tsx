"use client";

import { useMemo, type ReactNode } from "react";
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
  /** More names than this needing a leader = too dense for one slide: leave them unnamed (and say so). */
  maxLeaders?: number;
  callouts?: (feats: Feature[], anchorOf: (id: string) => { pt: Pt; off: boolean }) => Callout[];
  /** Height of the info block for a number of numbered names. */
  infoHeight: (numbered: number, offFrame: boolean, unplacedCallouts: boolean) => number;
};

function layout(spec: Spec, geo: Geos, BOX: { w: number; h: number }) {
  const { kode, feats, names } = spec;
  const own = geo.outline.features.filter((f) => f.properties.domain_id === kode);
  const fit = framing(feats);
  const { paths, vw, vh } = project(feats, fit.frame);
  const s = Math.min((BOX.w * MAP_SHARE) / vw, BOX.h / vh);
  const mx = (BOX.w - vw * s) / 2;
  const my = (BOX.h - vh * s) / 2;
  const to = projector(fit.frame);
  const { min, max, minRoom } = spec.labelSize;
  const placed = placeLabels(feats, fit.frame, vw, vh, names, vw * s, vh * s, { min, max, minRoom });
  const tones = neighbourColours(feats, CAT);
  const edge = project(own, fit.frame).paths;
  const borderPaths = spec.borders ? project(spec.borders, fit.frame).paths : [];

  // Neighbouring kabupaten anywhere on the card (the land layer is full-bleed).
  const win = { x0: -(PAD + mx) / s, x1: (1080 - PAD - mx) / s, y0: -(BOX_TOP + my) / s, y1: (1920 - BOX_TOP - my) / s };
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

  // Names too big for their unit: in free space with a leader line, top to bottom.
  const size = spec.labelSize.leader;
  const leaders: Leader[] = [];
  const numbered: Label[] = [];
  const crowded = spec.maxLeaders !== undefined && placed.numbered.length > spec.maxLeaders;
  for (const l of crowded ? [] : [...placed.numbered].sort((a, b) => a.y - b.y || a.x - b.x)) {
    const anchor = px(l);
    const off = anchor[0] < 0 || anchor[1] < 0 || anchor[0] > BOX.w || anchor[1] > BOX.h;
    const rect = off ? null : space.place(textWidth(l.name, size, true) + 10, size * 1.3, anchor, undefined, 0);
    if (rect) leaders.push({ id: l.id, name: l.name, anchor, rect, size });
    else numbered.push(l);
  }
  numbered.forEach((l, i) => (l.n = i + 1));

  // Neighbour names: inside that neighbour's land, in free space, as close to the kabupaten as fits.
  const centre: Pt = [mx + (vw * s) / 2, my + (vh * s) / 2];
  const neighbourNames: { name: string; rect: Rect }[] = [];
  for (const f of near) {
    const name = regencyName(String(f.properties.name ?? f.properties.domain_id));
    const rect = space.place(textWidth(name, 26) + 12, 34, centre, inRings(ringsPx(f, to, mx, my, s)), 0);
    if (rect) neighbourNames.push({ name, rect });
  }
  return { BOX, crowded: crowded ? placed.numbered.length : 0, paths, edge, borderPaths, nearPaths, labels: placed.labels, numbered, leaders, tones, s, mx, my, callouts, neighbourNames, offFrame: fit.offFrame };
}

function AdminMap({ spec, geo, kicker, title, info, source }: { spec: Spec; geo: Geos; kicker: string; title: string; info: ReactNode; source: string }) {
  // The info block's height depends on how many names end up numbered: shrink the map until it fits.
  const m = useMemo(() => {
    const full = ZONE.textBottom - BOX_TOP;
    const pass = (h: number) => layout(spec, geo, { w: W, h });
    const unplaced = (x: ReturnType<typeof pass>) => x.callouts.some((c) => !c.rect);
    let cur = pass(full - spec.infoHeight(0, false, false));
    for (let i = 0; i < 2; i++) {
      const h = full - spec.infoHeight(cur.numbered.length, cur.offFrame.length > 0, unplaced(cur)) - (cur.crowded ? 36 : 0);
      if (h >= cur.BOX.h) break;
      cur = pass(h);
    }
    return cur;
  }, [spec, geo]);
  const { BOX } = m;

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
          <CardHeader kicker={kicker} title={title} />
        </div>
        <div className="shrink-0" style={{ marginTop: GAP, width: BOX.w, height: BOX.h }}>
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
        </div>
        <div className="flex min-h-0 flex-1 flex-col" style={{ marginTop: GAP }}>
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
          <Footer source={source} />
        </div>
      </div>
    </>
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
export function KecamatanMapBody({ kode, data, geo, sorot }: { kode: string; data: Data; geo: Geos; sorot: boolean }) {
  const spec = useMemo<Spec>(() => {
    const feats = geo.inner.features.filter((f) => f.properties.domain_id.startsWith(kode));
    const names = new Map(data.districts.map((d) => [d.domain_id, titleCase(d.domain_name)]));
    return {
      kode, feats, names,
      fill: (id, tones) => `var(--nm-cat-${tones.get(id) ?? 0})`,
      labelSize: { min: 24, max: 34, minRoom: 14, leader: 24 },
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
      kicker={`Peta wilayah administrasi · ${data.kab.prov}`}
      title={data.kab.name}
      info={<StatsList rows={stats} />}
      source={`Penduduk: Ditjen Dukcapil Kemendagri, data ${bulanTahun(data.period)} (terdaftar); luas dan batas: BIG 1:10.000, dijumlahkan NusaStats`}
    />
  );
}

/** Desa vs kelurahan (template `desa`): status from Dukcapil, kecamatan borders on top. */
export function DesaMapBody({ kode, data, geo }: { kode: string; data: Data; geo: Geos }) {
  const status = useMemo(() => new Map(data.villageRegions.map((v) => [v.code, v.status])), [data.villageRegions]);
  const spec = useMemo<Spec>(() => {
    const feats = geo.inner.features.filter((f) => f.properties.domain_id.startsWith(kode));
    const names = new Map(data.villageRegions.map((v) => [v.code, titleCase(v.name)]));
    return {
      kode, feats, names,
      // Unknown status is drawn as no data, never guessed.
      fill: (id) => (status.get(id) === "Kelurahan" ? "var(--nm-kel)" : status.get(id) === "Desa" ? "var(--nm-desa)" : "var(--nm-nodata)"),
      borders: geo.kec?.features.filter((f) => f.properties.domain_id.startsWith(kode)),
      labelSize: { min: 16, max: 24, minRoom: 10, leader: 18 },
      maxLeaders: 40,
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
      kicker={`Peta desa dan kelurahan · ${data.kab.prov}`}
      title={data.kab.name}
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
