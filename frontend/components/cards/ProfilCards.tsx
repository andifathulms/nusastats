"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { dukcapilApi, formatNumber, titleCase, type DukcapilRank, type DukcapilRankRow } from "@/lib/api";
import { loadPeta, petaAsset, type Peta } from "@/lib/peta";
import { NO_DATA, cropBox, framing, kindFor, placeLabels, project, scaleFor, type Geo } from "./geo";
import { themeVar } from "./brand";
import { CornerTag, Footer, H, OffFrameNote, W } from "./ShareCard";
import { BREAKS, CLASS_COLORS, Fact, LabelLegend, MapLabels, bulanTahun, compact, kabInfo, pct1, type KabInfo } from "./WilayahCard";
import { CardHeader, MapLayout, TikTokOverlay, mapBoxFor } from "./layout";
import { kecFacts, litFacts, lowFacts } from "./facts";

/**
 * Kabupaten profile cards that join Dukcapil population with per-desa raster
 * shares (frontend/public/peta/{kode}/desa.json, data/peta_wilayah/desa) or show
 * a Dukcapil ratio per kecamatan. Same exporter contract as ShareCard.
 *
 *   /card/cahaya/{kab}                 registered residents per desa vs night lights
 *   /card/rendah/{kab}                 residents of desa mostly under 10 m
 *   /card/kecamatan/{kab}?indicator=…  one Dukcapil ratio per kecamatan (default median_age)
 *
 * The desa join is by Kemendagri code; a join covering under 98% of the
 * registered population is refused rather than drawn.
 */

export type ProfilTemplate = "cahaya" | "rendah" | "kecamatan";
export const PROFIL_TEMPLATES: ProfilTemplate[] = ["cahaya", "rendah", "kecamatan"];
// Ratios that are meaningful per kecamatan (aggregates, never desa-level).
export const KECAMATAN_INDICATORS = ["median_age", "pct_elderly", "pct_productive", "sex_ratio", "pct_sarjana", "dependency_ratio"];

type DesaStats = {
  desa: Record<string, { area_km2: number; px: number; lt_5_pct: number | null; lt_10_pct: number | null; lit_pct: number | null; mean_nw: number | null }>;
  metadata: { lights: { year: number; lit_threshold_nw: number }; lowland: { note: string } };
};
export type Loaded = {
  kab: KabInfo;
  period: string | null;
  villages: DukcapilRankRow[];
  desa: DesaStats | null;
  peta: Peta | null;
  kec: DukcapilRank | null;
  districts: Geo;
  villagesGeo: Geo | null;
  outline: Geo;
};

const json = (url: string) => fetch(url).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${url} -> ${r.status}`))));

export async function load(template: ProfilTemplate, kode: string, indicator: string): Promise<Loaded> {
  const prov = kode.slice(0, 2);
  const needsDesa = template !== "kecamatan";
  const [pops, areas, summary, villages, desa, peta, kec, districts, villagesGeo, outline] = await Promise.all([
    dukcapilApi.rank({ indicator: "jumlah_penduduk", level: "regency", prov, limit: "200" }),
    dukcapilApi.rank({ indicator: "luas_big", level: "regency", prov, limit: "200" }),
    dukcapilApi.summary(),
    needsDesa
      ? dukcapilApi.rank({ indicator: "jumlah_penduduk", level: "village", kab: kode, limit: "10000" }).then((r) => r.results)
      : Promise.resolve([] as DukcapilRankRow[]),
    needsDesa ? fetch(`/peta/${kode}/desa.json`).then((r) => (r.ok ? r.json() : null)) : Promise.resolve(null),
    needsDesa ? loadPeta(kode) : Promise.resolve(null),
    template === "kecamatan"
      ? dukcapilApi.rank({ indicator, level: "district", kab: kode, limit: "500" })
      : Promise.resolve(null),
    json(`/dukcapil-districts-${prov}.geojson`),
    needsDesa ? json(`/dukcapil-villages-${prov}.geojson`) : Promise.resolve(null),
    json("/dukcapil-regencies.geojson"),
  ]);
  return { kab: kabInfo(kode, pops.results, areas.results), period: summary.period ?? null, villages, desa, peta, kec, districts, villagesGeo, outline };
}

/** Guardrails: any problem = no card (and no figures). */
export function problems(template: ProfilTemplate, kode: string, d: Loaded, indicator: string): string[] {
  const out: string[] = [];
  if (kode.length !== 4) return ["kartu ini untuk kabupaten/kota (kode 4 digit)"];
  if (template === "kecamatan") {
    if (!KECAMATAN_INDICATORS.includes(indicator)) return [`indikator ${indicator} tidak untuk peta kecamatan`];
    const kecs = d.districts.features.filter((f) => f.properties.domain_id.startsWith(kode)).length;
    const vals = d.kec?.results ?? [];
    if (vals.length < kecs) out.push(`hanya ${vals.length} dari ${kecs} kecamatan punya nilai`);
    if (d.kec?.unit === "%" && vals.some((v) => v.value < 0 || v.value > 100)) out.push("persentase di luar 0–100");
    return out;
  }
  if (!d.desa) return [`desa.json belum dihitung untuk ${kode} (data/peta_wilayah: python -m desa --kode ${kode})`];
  if (!d.peta) return ["area Peta belum dihitung"];
  const layer = template === "cahaya" ? d.peta.present.nightlights : d.peta.present.lowland;
  if (!layer) out.push(`lapisan ${template === "cahaya" ? "cahaya malam" : "dataran rendah"} tidak ada di perangkat ini`);
  const pop = d.villages.reduce((a, v) => a + v.value, 0);
  const joined = d.villages.filter((v) => d.desa!.desa[v.domain_id]).reduce((a, v) => a + v.value, 0);
  if (pop <= 0 || joined / pop < 0.98) out.push(`hanya ${pct1((joined / Math.max(pop, 1)) * 100)} penduduk tergabung ke data desa`);
  return out;
}

export function ProfilCard({ template, kode, query, debug }: { template: ProfilTemplate; kode: string; query: URLSearchParams; debug: boolean }) {
  const indicator = query.get("indicator") ?? "median_age";
  const [data, setData] = useState<Loaded | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [fontsReady, setFontsReady] = useState(false);
  const [loaded, setLoaded] = useState(0);

  useEffect(() => {
    load(template, kode, indicator).then(setData).catch((e) => setFatal(String(e.message ?? e)));
    document.fonts.ready.then(() => setFontsReady(true));
  }, [template, kode, indicator]);

  const issues = useMemo(() => (data ? problems(template, kode, data, indicator) : []), [template, kode, data, indicator]);
  const error = fatal ?? (issues.length ? issues.join("; ") : null);
  // Raster images the card waits for: night lights, or hillshade (if present) + lowland.
  const images = !data?.peta || error ? 0 : template === "cahaya" ? 1 : template === "rendah" ? (data.peta.present.hillshade ? 2 : 1) : 0;
  const ready = !error && !!data && fontsReady && loaded >= images;
  const onImage = () => setLoaded((n) => n + 1);
  const onImageError = (src: string) => setFatal(`gambar gagal dimuat: ${src}`);

  return (
    <div
      id="card"
      data-card-ready={ready ? "1" : undefined}
      data-card-error={error ?? undefined}
      className="nm-card relative overflow-hidden bg-coal-bg font-sans text-coal-text"
      style={{ width: W, height: H, ...themeVar(template) }}
    >
      {error ? (
        <div className="p-16 text-[28px] text-coal-text">Kartu tidak dibuat: {error}</div>
      ) : data ? (
        template === "cahaya" ? (
          <LightsBody kode={kode} d={data} onImage={onImage} onImageError={onImageError} />
        ) : template === "rendah" ? (
          <LowBody kode={kode} d={data} onImage={onImage} onImageError={onImageError} />
        ) : (
          <KecamatanBody kode={kode} d={data} />
        )
      ) : null}
      <CornerTag />
      {debug && <TikTokOverlay />}
    </div>
  );
}

/** Desa rows joined to Dukcapil population (code-for-code; the guardrail above checks coverage). */
export function joinDesa(d: Loaded) {
  return d.villages
    .filter((v) => d.desa!.desa[v.domain_id])
    .map((v) => ({ id: v.domain_id, name: titleCase(v.domain_name), pop: v.value, ...d.desa!.desa[v.domain_id] }));
}

function useFrame(kode: string, d: Loaded) {
  return useMemo(() => {
    const feats = d.districts.features.filter((f) => f.properties.domain_id.startsWith(kode));
    const own = d.outline.features.filter((f) => f.properties.domain_id === kode);
    const fit = framing(feats);
    const outer = d.peta!.bounds;
    const full = project([], outer);
    const view = fit.cropped ? cropBox(fit.frame, outer) : { x: 0, y: 0, w: full.vw, h: full.vh };
    return { feats, own, fit, outer, view };
  }, [kode, d]);
}

function RasterMap({
  layers, view, outer, children, onImage, onImageError,
}: {
  layers: { src: string; opacity?: number; blend?: "multiply"; pixelated?: boolean }[];
  view: { x: number; y: number; w: number; h: number };
  outer: { west: number; south: number; east: number; north: number };
  children?: React.ReactNode;
  onImage: () => void;
  onImageError: (src: string) => void;
}) {
  const { vw, vh } = project([], outer);
  const counted = useRef(new Set<string>());
  return (
    <svg viewBox={`${view.x.toFixed(1)} ${view.y.toFixed(1)} ${view.w.toFixed(1)} ${view.h.toFixed(1)}`} preserveAspectRatio="xMidYMid meet" className="h-full w-full">
      {layers.map((l) => (
        <image
          key={l.src}
          href={l.src}
          x={0}
          y={0}
          width={vw}
          height={vh}
          preserveAspectRatio="none"
          opacity={l.opacity ?? 1}
          style={{ mixBlendMode: l.blend ?? "normal", imageRendering: l.pixelated ? "pixelated" : "auto" }}
          onLoad={() => {
            if (!counted.current.has(l.src)) {
              counted.current.add(l.src);
              onImage();
            }
          }}
          onError={() => onImageError(l.src)}
        />
      ))}
      {children}
    </svg>
  );
}

function LightsBody({ kode, d, onImage, onImageError }: { kode: string; d: Loaded; onImage: () => void; onImageError: (s: string) => void }) {
  const { own, fit, outer, view } = useFrame(kode, d);
  const rows = useMemo(() => joinDesa(d), [d]);
  const villagePaths = useMemo(() => {
    const feats = d.villagesGeo!.features.filter((f) => f.properties.domain_id.startsWith(kode));
    return project(feats, outer).paths;
  }, [d, kode, outer]);
  const edge = useMemo(() => project(own, outer).paths, [own, outer]);
  const byId = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows]);
  const cls = (v: number) => (BREAKS.findIndex((b) => v < b) === -1 ? BREAKS.length : BREAKS.findIndex((b) => v < b));

  const { litPop, darkDesa, popShare, areaShare, contrast } = litFacts(rows);
  const year = d.desa!.metadata.lights.year;
  const outlineEls = edge.map((p) => <path key={`e-${p.id}`} d={p.d} fill="none" stroke="#F3ECDD" strokeWidth={2.2} vectorEffect="non-scaling-stroke" />);
  // Same frame for both maps: a tall kabupaten pairs them side by side, a wide one stacks them.
  const pairSide = view.h > view.w;
  const pairAspect = pairSide ? view.h / (2 * view.w) : (2 * view.h) / view.w;
  const label = "font-mono text-[22px] uppercase tracking-[0.1em] text-coal-muted";

  return (
    <MapLayout
      aspect={pairAspect}
      header={<CardHeader kicker={`Penduduk vs cahaya malam ${year} · ${d.kab.prov}`} title={d.kab.name} />}
      info={
        <>
          <OffFrameNote items={fit.offFrame} />
          <p className="text-[34px] font-semibold leading-tight">
            <span className="text-ink-gold">{pct1(popShare)}</span> penduduk tinggal di desa yang terang malam hari
            {contrast ? <>, padahal hanya {pct1(areaShare)} wilayahnya bercahaya.</> : <>; {pct1(areaShare)} wilayahnya bercahaya.</>}
          </p>
          <div className="nm-facts mt-5 grid grid-cols-2 gap-6">
            <Fact value={compact(litPop)} label="penduduk di desa terang" />
            <Fact value={formatNumber(darkDesa)} label={`dari ${formatNumber(rows.length)} desa sebagian besar gelap`} />
          </div>
          <p className="mt-4 text-[22px] leading-snug text-coal-muted">
            Desa terang: separuh luasnya atau lebih bercahaya (≥ {d.desa!.metadata.lights.lit_threshold_nw} nW/cm²/sr). Cahaya menunjukkan
            permukiman dan aktivitas, bukan jumlah penduduk.
          </p>
          <Footer source={`Penduduk: Ditjen Dukcapil Kemendagri, data ${bulanTahun(d.period)} (terdaftar); cahaya: World Bank Light Every Night, VIIRS ${year} (CC BY 4.0); desa: BIG 1:10.000; dihitung NusaStats`} />
        </>
      }
      map={
        <div className={`grid h-full w-full gap-4 ${pairSide ? "grid-cols-2" : "grid-rows-2"}`}>
          <div className="flex min-h-0 min-w-0 flex-col">
            <div className={label}>Penduduk per desa</div>
            <div className="mt-2 min-h-0 flex-1">
              <RasterMap layers={[]} view={view} outer={outer} onImage={onImage} onImageError={onImageError}>
                {villagePaths.map((p) => {
                  const r = byId.get(p.id);
                  return <path key={p.id} d={p.d} fill={r ? CLASS_COLORS[cls(r.pop / r.area_km2)] : NO_DATA} stroke="rgba(15,20,22,0.55)" strokeWidth={0.4} vectorEffect="non-scaling-stroke" />;
                })}
                {outlineEls}
              </RasterMap>
            </div>
          </div>
          <div className="flex min-h-0 min-w-0 flex-col">
            <div className={label}>Cahaya malam {year}</div>
            <div className="mt-2 min-h-0 flex-1">
              <RasterMap
                layers={[{ src: petaAsset(kode, d.peta!.bounds.layers.nightlights!), pixelated: true }]}
                view={view}
                outer={outer}
                onImage={onImage}
                onImageError={onImageError}
              >
                {outlineEls}
              </RasterMap>
            </div>
          </div>
        </div>
      }
    />
  );
}

function LowBody({ kode, d, onImage, onImageError }: { kode: string; d: Loaded; onImage: () => void; onImageError: (s: string) => void }) {
  const { own, fit, outer, view } = useFrame(kode, d);
  const rows = useMemo(() => joinDesa(d), [d]);
  const edge = useMemo(() => project(own, outer).paths, [own, outer]);
  // Desa where most of the area is under 10 m: drawn with a cream outline over the layer.
  const { low, lowPop, lowShare, top } = lowFacts(rows);
  const lowIds = new Set(low.map((r) => r.id));
  const t = d.peta!.terrain!;
  const [c5, c10] = t.metadata.lowland_colors!;
  const lowPaths = useMemo(
    () => project(d.villagesGeo!.features.filter((f) => lowIds.has(f.properties.domain_id)), outer).paths,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [d, outer, rows]
  );
  const shade = d.peta!.present.hillshade;

  return (
    <MapLayout
      aspect={view.h / view.w}
      header={<CardHeader kicker={`Penduduk di dataran rendah · ${d.kab.prov}`} title={d.kab.name} />}
      info={
        <>
          <OffFrameNote items={fit.offFrame} />
          <ul className="nm-legend flex flex-wrap gap-x-6 gap-y-2 text-[24px] text-coal-muted">
            <li className="inline-flex items-center gap-2"><span className="inline-block h-5 w-5 rounded" style={{ background: c5 }} />di bawah 5 m</li>
            <li className="inline-flex items-center gap-2"><span className="inline-block h-5 w-5 rounded" style={{ background: c10 }} />5–10 m</li>
          </ul>
          <p className="mt-5 text-[34px] font-semibold leading-tight">
            {low.length ? (
              <>
                <span className="text-ink-gold">{compact(lowPop)}</span> penduduk ({pct1(lowShare)}) tinggal di {formatNumber(low.length)} desa yang
                sebagian besar wilayahnya di bawah 10 m.
              </>
            ) : (
              <>Tidak ada desa yang sebagian besar wilayahnya di bawah 10 m.</>
            )}
          </p>
          {top.length > 0 && (
            <p className="mt-3 text-[24px] leading-snug text-coal-muted">
              Terbanyak: {top.map((r) => `${r.name} (${compact(r.pop)})`).join(", ")}.
            </p>
          )}
          <p className="mt-3 text-[22px] leading-snug text-coal-muted">Batas bawah: tajuk pohon dan atap terbaca lebih tinggi dari tanah.</p>
          <Footer source={`Penduduk: Ditjen Dukcapil Kemendagri, data ${bulanTahun(d.period)} (terdaftar); ketinggian: Copernicus DEM GLO-30 (© DLR e.V., © Airbus DS; Copernicus/EU/ESA); desa: BIG 1:10.000; dihitung NusaStats`} />
        </>
      }
      map={
        <RasterMap
          layers={[
            ...(shade ? [{ src: petaAsset(kode, d.peta!.bounds.layers.hillshade!), opacity: 0.55 }] : []),
            { src: petaAsset(kode, d.peta!.bounds.layers.lowland!), pixelated: true },
          ]}
          view={view}
          outer={outer}
          onImage={onImage}
          onImageError={onImageError}
        >
          {lowPaths.map((p) => <path key={p.id} d={p.d} fill="none" stroke="#F3ECDD" strokeWidth={1.4} vectorEffect="non-scaling-stroke" />)}
          {edge.map((p) => <path key={`e-${p.id}`} d={p.d} fill="none" stroke="#F3ECDD" strokeWidth={2.4} vectorEffect="non-scaling-stroke" />)}
        </RasterMap>
      }
    />
  );
}

function KecamatanBody({ kode, d }: { kode: string; d: Loaded }) {
  const kec = d.kec!;
  const { paths, edge, labels, numbered, vw, vh, fit, box } = useMemo(() => {
    const feats = d.districts.features.filter((f) => f.properties.domain_id.startsWith(kode));
    const own = d.outline.features.filter((f) => f.properties.domain_id === kode);
    const fit = framing(feats);
    const { paths, vw, vh } = project(feats, fit.frame);
    const box = mapBoxFor(vh / vw);
    const names = new Map(kec.results.map((r) => [r.domain_id, titleCase(r.domain_name)]));
    return { paths, vw, vh, fit, box, edge: project(own, fit.frame).paths, ...placeLabels(feats, fit.frame, vw, vh, names, box.w, box.h) };
  }, [d, kode, kec]);
  const byId = new Map(kec.results.map((r) => [r.domain_id, r]));
  const vals = kec.results.map((r) => r.value);
  const [min, max] = [Math.min(...vals), Math.max(...vals)];
  // Ratios get the cool palette; sex ratio is diverging around 100, so a
  // kabupaten where every kecamatan has more women reads as one side.
  const { kind, mid } = kindFor(kec.unit, kec.indicator.field);
  const scale = scaleFor(kind, min, max, mid);
  const { fmt, hi, lo } = kecFacts(kec);
  const k = 1 / Math.min(box.w / vw, box.h / vh);

  return (
    <MapLayout
      aspect={vh / vw}
      side={box.side}
      header={<CardHeader kicker={`${kec.indicator.label_id} per kecamatan · ${d.kab.prov}`} title={d.kab.name} />}
      info={
        <>
          <OffFrameNote items={fit.offFrame} />
          <LabelLegend numbered={numbered} />
          <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 font-mono text-[22px] text-coal-muted">
            <span className="whitespace-nowrap">{fmt(scale.lo)}</span>
            <div className="relative h-3 min-w-[120px] flex-1 rounded-full" style={{ background: `linear-gradient(90deg, ${scale.gradient})` }}>
              {scale.mid !== undefined && <span className="absolute left-1/2 top-5 -translate-x-1/2 whitespace-nowrap">{fmt(scale.mid)}</span>}
            </div>
            <span className="whitespace-nowrap">{fmt(scale.hi)}</span>
          </div>
          <div className={`nm-facts ${scale.mid !== undefined ? "mt-12" : "mt-5"} grid grid-cols-2 gap-6`}>
            <Fact value={fmt(hi.value)} label={`tertinggi: ${titleCase(hi.domain_name)}`} />
            <Fact value={fmt(lo.value)} label={`terendah: ${titleCase(lo.domain_name)}`} />
          </div>
          <Footer source={`Diolah dari Ditjen Dukcapil Kemendagri, data ${bulanTahun(d.period)} (penduduk terdaftar, bukan sensus)`} />
        </>
      }
      map={
        <svg viewBox={`0 0 ${vw.toFixed(0)} ${vh.toFixed(0)}`} preserveAspectRatio="xMidYMid meet" className="h-full w-full">
          {paths.map((p) => {
            const r = byId.get(p.id);
            return <path key={p.id} d={p.d} fill={r ? scale.color(r.value) : NO_DATA} stroke="rgba(15,20,22,0.6)" strokeWidth={0.8} vectorEffect="non-scaling-stroke" />;
          })}
          {edge.map((p) => <path key={`e-${p.id}`} d={p.d} fill="none" stroke="#F3ECDD" strokeWidth={2.4} vectorEffect="non-scaling-stroke" />)}
          <MapLabels labels={labels} numbered={numbered} k={k} />
        </svg>
      }
    />
  );
}
