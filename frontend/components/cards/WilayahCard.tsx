"use client";

import { useEffect, useMemo, useState } from "react";
import { dukcapilApi, formatNumber, regionLabel, titleCase, type DukcapilRankRow, type DukcapilRegionRow } from "@/lib/api";
import { NO_DATA, frameOf, palette, framing, project, projector, type Geo, type Label, type OffFrame } from "./geo";
import { temaStyle, type Tema } from "./brand";
import { DesaMapBody, KecamatanMapBody } from "./AdminMap";
import { CornerTag, Footer, OffFrameNote } from "./ShareCard";
import { CONTENT_W, CardHeader, H, MapLayout, PAD, TikTokOverlay, W, ZONE, mapBoxFor } from "./layout";
import { compact, densityFacts, pct1, shortName } from "./facts";

/**
 * 1080×1920 kabupaten profile cards drawn from boundaries + Dukcapil data (no
 * Peta raster needed), for the PNG exporter (`npm run card`). Same contract as
 * ShareCard: data-card-ready once fonts and data are in; data-card-error and no
 * figures when a guardrail fails.
 *
 *   /card/wilayah/{kab}    administrative map: kecamatan with their names
 *   /card/kepadatan/{kab}  population density per desa (registered residents
 *                          ÷ BIG area), on fixed log-spaced classes so cards
 *                          of different kabupaten compare; the profile's hook
 *   /card/penutup/{kab}    closing slide: the province with this kabupaten
 *                          highlighted, "Kabupaten mana berikutnya?"
 */

export type WilayahTemplate = "wilayah" | "desa" | "kepadatan" | "penutup";
export const WILAYAH_TEMPLATES: WilayahTemplate[] = ["wilayah", "desa", "kepadatan", "penutup"];

// Muted sea/sand tones for neighbouring kecamatan: distinct, never a ranking.
// Density classes in jiwa/km². Fixed, log-spaced, so 6409 and 3273 read on one scale.
export const BREAKS = [10, 50, 250, 1000, 5000];
// Fixed classes take the six stops of the "amount" palette as they are.
/** Density class colours in the current palette (geo.palette). */
export const classColors = () => palette("amount");
// Typical header and facts heights (card px), for choosing the layout.
const HOOK_HEADER_H = 330;
const CLOSING_HEADER_H = 380;

export type Geos = { inner: Geo; outline: Geo; kec: Geo | null };
export type KabInfo = { name: string; prov: string; pop: number | null; area: number | null };
export type Data = {
  kab: KabInfo;
  districts: DukcapilRankRow[];
  villageTotal: number;
  villageRegions: DukcapilRegionRow[]; // name and Dukcapil status (Desa/Kelurahan) per desa
  villages: DukcapilRankRow[]; // kepadatan only
  districtAreas: DukcapilRankRow[]; // wilayah only: BIG area per kecamatan
  period: string | null;
};

export { compact, pct1, shortName };

export function bulanTahun(period: string | null): string {
  if (!period) return "";
  const b = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
  return `${b[Number(period.slice(5, 7)) - 1]} ${period.slice(0, 4)}`;
}

/** Name, province, registered population and BIG area of a kabupaten, from
 * the province's regency rankings (jumlah_penduduk, luas_big). */
export function kabInfo(kode: string, pops: DukcapilRankRow[], areas: DukcapilRankRow[]): KabInfo {
  const row = pops.find((r) => r.domain_id === kode);
  if (!row) throw new Error(`kabupaten ${kode} tidak ada di data Dukcapil`);
  return {
    name: regionLabel(titleCase(row.domain_name), row.status),
    prov: titleCase(row.nama_prop ?? ""),
    pop: row.value,
    area: areas.find((r) => r.domain_id === kode)?.value ?? null,
  };
}

/** Dukcapil ships a few kecamatan as two polygons with the same numbers; the second
 * arrives under `{code}-{objectid}` (backend dukcapil/twins.py). Count each once. */
function withoutTwins(rows: DukcapilRankRow[]): DukcapilRankRow[] {
  const codes = new Set(rows.map((r) => r.domain_id));
  return rows.filter((r) => !(r.domain_id.includes("-") && codes.has(r.domain_id.split("-")[0])));
}

export async function loadData(template: WilayahTemplate, kode: string): Promise<Data> {
  const prov = kode.slice(0, 2);
  const [pops, areas, districts, villageList, summary, villages, districtAreas] = await Promise.all([
    dukcapilApi.rank({ indicator: "jumlah_penduduk", level: "regency", prov, limit: "200" }),
    dukcapilApi.rank({ indicator: "luas_big", level: "regency", prov, limit: "200" }),
    dukcapilApi.rank({ indicator: "jumlah_penduduk", level: "district", kab: kode, limit: "500" }),
    dukcapilApi.regions({ level: "village", kab: kode }),
    dukcapilApi.summary(),
    template === "kepadatan"
      ? dukcapilApi.rank({ indicator: "pop_density_big", level: "village", kab: kode, limit: "10000" }).then((r) => r.results)
      : Promise.resolve([] as DukcapilRankRow[]),
    template === "wilayah"
      ? dukcapilApi.rank({ indicator: "luas_big", level: "district", kab: kode, limit: "500" }).then((r) => r.results)
      : Promise.resolve([] as DukcapilRankRow[]),
  ]);
  return {
    kab: kabInfo(kode, pops.results, areas.results),
    districts: withoutTwins(districts.results),
    districtAreas: withoutTwins(districtAreas),
    villageTotal: villageList.length,
    villageRegions: villageList,
    villages,
    period: summary.period ?? null,
  };
}

const json = (url: string) => fetch(url).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${url} -> ${r.status}`))));

/** Boundaries a card draws: desa (kepadatan) or kecamatan, plus the kabupaten outlines. */
export async function loadGeo(template: WilayahTemplate, kode: string): Promise<Geos> {
  const districts = `/dukcapil-districts-${kode.slice(0, 2)}.geojson`;
  const [inner, outline, kec] = await Promise.all([
    json(template === "kepadatan" || template === "desa" ? `/dukcapil-villages-${kode.slice(0, 2)}.geojson` : districts),
    json("/dukcapil-regencies.geojson"),
    template === "kepadatan" || template === "desa" ? json(districts) : Promise.resolve(null),
  ]);
  return { inner, outline, kec };
}

export function WilayahCard({
  template, kode, debug, tema = "malam", sorot = false, panel = 1, full = false,
}: { template: WilayahTemplate; kode: string; debug: boolean; tema?: Tema; sorot?: boolean; panel?: number; full?: boolean }) {
  // How many slides the desa map spreads over (AdminMap decides; the exporter reads data-card-panels).
  const [panels, setPanels] = useState<number | null>(null);
  const [data, setData] = useState<Data | null>(null);
  const [geo, setGeo] = useState<Geos | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [fontsReady, setFontsReady] = useState(false);

  useEffect(() => {
    if (kode.length !== 4) {
      setFatal("kartu ini untuk kabupaten/kota (kode 4 digit)");
      return;
    }
    loadData(template, kode).then(setData).catch((e) => setFatal(String(e.message ?? e)));
    loadGeo(template, kode).then(setGeo).catch((e) => setFatal(String(e.message ?? e)));
    document.fonts.ready.then(() => setFontsReady(true));
  }, [template, kode]);

  const issues = useMemo(() => (data && geo ? problems(template, kode, data, geo) : []), [template, kode, data, geo]);
  const error = fatal ?? (issues.length ? issues.join("; ") : null);
  // The desa map is ready once it has decided how many slides it spreads over.
  const ready = !error && !!data && !!geo && fontsReady && (template !== "desa" || panels !== null);

  return (
    <div
      id="card"
      data-card-ready={ready ? "1" : undefined}
      data-card-error={error ?? undefined}
      data-card-panels={template === "desa" && panels ? panels : undefined}
      className="nm-card relative overflow-hidden bg-coal-bg font-sans text-coal-text"
      style={{ width: W, height: H, ...temaStyle(template, tema) }}
    >
      {error ? (
        <div className="p-16 text-[28px] text-coal-text">Kartu tidak dibuat: {error}</div>
      ) : data && geo ? (
        template === "wilayah" ? (
          <KecamatanMapBody kode={kode} data={data} geo={geo} sorot={sorot} full={full} />
        ) : template === "desa" ? (
          <DesaMapBody kode={kode} data={data} geo={geo} panel={panel} onPanels={setPanels} full={full} />
        ) : template === "penutup" ? (
          <ClosingBody kode={kode} data={data} geo={geo} />
        ) : (
          <DensityBody kode={kode} data={data} geo={geo} />
        )
      ) : null}
      <CornerTag />
      {debug && <TikTokOverlay />}
    </div>
  );
}

/** Guardrails: no figure is drawn when the inputs don't add up. */
export function problems(template: WilayahTemplate, kode: string, data: Data, geo: Geos): string[] {
  const out: string[] = [];
  const inner = geo.inner.features.filter((f) => f.properties.domain_id.startsWith(kode));
  if (!inner.length) out.push(`tidak ada batas ${template === "kepadatan" || template === "desa" ? "desa" : "kecamatan"} untuk ${kode}`);
  if (!geo.outline.features.some((f) => f.properties.domain_id === kode)) out.push(`tidak ada batas kabupaten ${kode}`);
  if (!data.districts.length) out.push("tidak ada data kecamatan");
  if (template === "kepadatan") {
    if (data.villages.some((v) => v.value < 0)) out.push("kepadatan negatif");
    const withValue = data.villages.length;
    // More than a quarter of desa without a value would make the map mostly grey.
    if (withValue < data.villageTotal * 0.75) out.push(`hanya ${withValue} dari ${data.villageTotal} desa punya nilai`);
  }
  return out;
}

export function Fact({ value, label }: { value: string; label: string }) {
  return (
    <div className="min-w-0">
      <div className="whitespace-nowrap text-[48px] font-extrabold leading-none tracking-[-0.02em] tabular-nums">{value}</div>
      <div className="mt-2 text-[24px] leading-snug text-coal-muted">{label}</div>
    </div>
  );
}

export const DENSITY_RANGES = ["< 10", "10–50", "50–250", "250–1.000", "1.000–5.000", "≥ 5.000"];

/** The fixed density classes as a legend: a row under the map, a list beside it. */
export function DensityLegend({ note }: { note?: string }) {
  return (
    <>
      <div className="nm-legend flex gap-1">
        {classColors().map((c, i) => (
          <div key={c} className="flex-1">
            <div className="h-4 rounded-sm" style={{ background: c }} />
            <div className="mt-1 text-center font-mono text-[22px] text-coal-muted">{DENSITY_RANGES[i]}</div>
          </div>
        ))}
      </div>
      <div className="mt-1 text-right font-mono text-[22px] text-coal-muted">jiwa/km²{note ? ` · ${note}` : ""}</div>
    </>
  );
}

function DensityBody({ kode, data, geo }: { kode: string; data: Data; geo: Geos }) {
  const byId = useMemo(() => new Map(data.villages.map((v) => [v.domain_id, v])), [data.villages]);
  const { paths, kec, edge, vw, vh, offFrame } = useMemo(() => {
    const feats = geo.inner.features.filter((f) => f.properties.domain_id.startsWith(kode));
    const own = geo.outline.features.filter((f) => f.properties.domain_id === kode);
    const fit = framing(feats);
    const frame = fit.frame;
    const kecFeats = geo.kec?.features.filter((f) => f.properties.domain_id.startsWith(kode)) ?? [];
    return {
      ...project(feats, frame),
      kec: project(kecFeats, frame).paths,
      edge: own.length ? project(own, frame).paths : [],
      offFrame: fit.offFrame as OffFrame[],
    };
  }, [geo, kode]);

  const cls = (v: number) => BREAKS.findIndex((b) => v < b) === -1 ? BREAKS.length : BREAKS.findIndex((b) => v < b);
  const facts = useMemo(() => densityFacts(data.villages, data.districts), [data.villages, data.districts]);
  const missing = data.villageTotal - data.villages.length;

  return (
    <MapLayout
      aspect={vh / vw}
      headerH={HOOK_HEADER_H}
      header={
        <CardHeader kicker={`Penduduk · kepadatan per desa · ${data.kab.prov}`} title={data.kab.name}>
          {/* The hook: this card opens the profile, so its fact leads. */}
          <p className="mt-5 font-display text-[64px] leading-[1.02]">
            Separuh warga {shortName(data.kab.name)} tinggal di <span className="text-nm-sorot">{pct1(facts.halfAreaPct)}</span> wilayahnya.
          </p>
        </CardHeader>
      }
      info={
        <>
          <OffFrameNote items={offFrame} />
          <DensityLegend note={missing > 0 ? `abu-abu: ${missing} desa tanpa data` : undefined} />
          <div className="nm-facts mt-6 grid grid-cols-2 gap-6">
            <Fact value={compact(facts.pop)} label="penduduk di peta ini" />
            <Fact value={`${formatNumber(Math.round(facts.top.density))}/km²`} label={`kecamatan terpadat: ${facts.top.name}`} />
          </div>
          <Footer source={`Penduduk: Ditjen Dukcapil Kemendagri, data ${bulanTahun(data.period)} (penduduk terdaftar, bukan sensus); luas desa: BIG 1:10.000, dihitung NusaStats`} />
        </>
      }
      map={
        <svg viewBox={`0 0 ${vw.toFixed(0)} ${vh.toFixed(0)}`} preserveAspectRatio="xMidYMid meet" className="h-full w-full">
          {paths.map((p) => {
            const v = byId.get(p.id);
            return <path key={p.id} d={p.d} fill={v ? classColors()[cls(v.value)] : NO_DATA} stroke="var(--nm-seam)" strokeWidth={0.4} vectorEffect="non-scaling-stroke" />;
          })}
          {kec.map((p) => (
            <path key={`k-${p.id}`} d={p.d} fill="none" stroke="var(--nm-border-soft)" strokeWidth={0.8} vectorEffect="non-scaling-stroke" />
          ))}
          {edge.map((p) => (
            <path key={`e-${p.id}`} d={p.d} fill="none" stroke="var(--nm-edge)" strokeWidth={2.6} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          ))}
        </svg>
      }
    />
  );
}

/** Kecamatan names on a map (viewBox units; `k` = viewBox units per card px). */
export function MapLabels({ labels, numbered, k }: { labels: Label[]; numbered: Label[]; k: number }) {
  return (
    <>
            {labels.map((l) => (
              <text
                key={l.id}
                x={l.x}
                y={l.y}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={l.size}
                fontWeight={600}
                fill="var(--nm-edge)"
                stroke="var(--nm-bg)"
                strokeWidth={l.size * 0.18}
                paintOrder="stroke"
                style={{ fontFamily: "inherit" }}
              >
                {l.name}
              </text>
            ))}
            {numbered.map((l) => (
              <g key={l.id}>
                <circle cx={l.x} cy={l.y} r={17 * k} fill="var(--nm-edge)" />
                <text x={l.x} y={l.y} textAnchor="middle" dominantBaseline="central" fontSize={21 * k} fontWeight={800} fill="var(--nm-bg)">
                  {l.n}
                </text>
              </g>
            ))}
    </>
  );
}

/** The legend for kecamatan too small for their name on the map. */
export function LabelLegend({ numbered }: { numbered: Label[] }) {
  return (
    <>
    {numbered.length > 0 && (
      <ol className="nm-numbered shrink-0 columns-3 gap-6 text-[24px] leading-snug text-coal-muted">
        {numbered.map((l) => (
          <li key={l.id} className="break-inside-avoid">
            <span className="font-mono text-ink-gold">{l.n}</span> {l.name}
          </li>
        ))}
      </ol>
    )}
    </>
  );
}

/** "Kab. Barru" -> "Barru", "Kota Adm. Jakarta Timur" -> "Jakarta Timur" (for sentences). */
/** The closing slide: the province's kabupaten/kota with this one highlighted. */
function ClosingBody({ kode, data, geo }: { kode: string; data: Data; geo: Geos }) {
  const { paths, own, ring, vw, vh, offFrame } = useMemo(() => {
    const feats = geo.outline.features.filter((f) => f.properties.domain_id.startsWith(kode.slice(0, 2)));
    const fit = framing(feats);
    const { paths, vw, vh } = project(feats, fit.frame);
    // A ring around the highlighted kabupaten, at least ~44 card px, so a small
    // kota (Makassar) is findable on its province map.
    const ownFeat = feats.filter((f) => f.properties.domain_id === kode);
    const to = projector(fit.frame);
    const b = frameOf(ownFeat);
    const [x0, y0] = to([b.west, b.north]);
    const [x1, y1] = to([b.east, b.south]);
    const box = mapBoxFor(vh / vw, CLOSING_HEADER_H, 160);
    const k = 1 / Math.min(box.w / vw, box.h / vh);
    const ring = { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, r: Math.max(Math.hypot(x1 - x0, y1 - y0) / 2 + 10 * k, 44 * k), w: 4 * k };
    return { paths, own: paths.filter((p) => p.id === kode), ring, vw, vh, offFrame: fit.offFrame };
  }, [geo, kode]);
  return (
    <MapLayout
      aspect={vh / vw}
      headerH={CLOSING_HEADER_H}
      infoH={160}
      header={
        <CardHeader kicker="Kenali kabupatenmu" title="Kabupaten mana berikutnya?">
          <p className="mt-5 text-[36px] leading-snug text-coal-muted">Tulis di komentar. Daerah yang paling banyak disebut jadi peta berikutnya.</p>
        </CardHeader>
      }
      info={
        <>
          <OffFrameNote items={offFrame} />
          <p className="text-[40px] font-semibold leading-tight">
            <span className="text-nm-sorot">{data.kab.name}</span> di {data.kab.prov}
          </p>
          <p className="fixed text-[22px] leading-snug text-coal-muted" style={{ left: PAD, top: ZONE.sourceTop, width: CONTENT_W }}>
            Ikuti Nusantara Mapper untuk peta kabupaten berikutnya. Batas wilayah indikatif (BIG 1:10.000).
          </p>
        </>
      }
      map={
        <svg viewBox={`0 0 ${vw.toFixed(0)} ${vh.toFixed(0)}`} preserveAspectRatio="xMidYMid meet" className="h-full w-full">
          {paths.map((p) => (
            <path key={p.id} d={p.d} fill={p.id === kode ? "var(--nm-sorot)" : "var(--nm-prov)"} stroke="var(--nm-bg)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          ))}
          {own.map((p) => (
            <path key={`o-${p.id}`} d={p.d} fill="none" stroke="var(--nm-edge)" strokeWidth={2.6} vectorEffect="non-scaling-stroke" />
          ))}
          <circle cx={ring.cx} cy={ring.cy} r={ring.r} fill="none" stroke="var(--nm-sorot)" strokeWidth={ring.w} />
        </svg>
      }
    />
  );
}
