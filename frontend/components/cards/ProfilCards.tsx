"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { dukcapilApi, formatNumber, titleCase, type DukcapilRank, type DukcapilRankRow } from "@/lib/api";
import { loadPeta, petaAsset, type Peta } from "@/lib/peta";
import { NO_DATA, RAMP, cropBox, framing, placeLabels, project, rampColor, type Geo } from "./geo";
import { CornerTag, Footer, H, OffFrameNote, SafeZones, W } from "./ShareCard";
import { BREAKS, CLASS_COLORS, Column, Fact, LabelLegend, MapLabels, Title, bulanTahun, compact, kabInfo, pct1, type KabInfo } from "./WilayahCard";

/**
 * Kabupaten profile cards that join Dukcapil population with per-desa raster
 * shares (frontend/public/peta/{kode}/desa.json, data/peta_wilayah/desa) or show
 * a Dukcapil ratio per kecamatan. Same exporter contract as ShareCard.
 *
 *   /card/cahaya/{kab}                 registered residents per desa vs night lights
 *   /card/kecamatan/{kab}?indicator=…  one Dukcapil ratio per kecamatan (default median_age)
 *
 * The desa join is by Kemendagri code; a join covering under 98% of the
 * registered population is refused rather than drawn.
 */

export type ProfilTemplate = "cahaya" | "kecamatan";
export const PROFIL_TEMPLATES: ProfilTemplate[] = ["cahaya", "kecamatan"];
// Ratios that are meaningful per kecamatan (aggregates, never desa-level).
export const KECAMATAN_INDICATORS = ["median_age", "pct_elderly", "pct_productive", "sex_ratio", "pct_sarjana", "dependency_ratio"];
const MAJORITY = 50; // a desa is "mostly" lit at this share of its area

type DesaStats = {
  desa: Record<string, { area_km2: number; px: number; lt_5_pct: number | null; lt_10_pct: number | null; lit_pct: number | null; mean_nw: number | null }>;
  metadata: { lights: { year: number; lit_threshold_nw: number }; lowland: { note: string } };
};
type Loaded = {
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

async function load(template: ProfilTemplate, kode: string, indicator: string): Promise<Loaded> {
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
function problems(template: ProfilTemplate, kode: string, d: Loaded, indicator: string): string[] {
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
  if (!d.peta.present.nightlights) out.push("lapisan cahaya malam tidak ada di perangkat ini");
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
  // Raster images the card waits for: the night-lights layer.
  const images = !data?.peta || error ? 0 : template === "cahaya" ? 1 : 0;
  const ready = !error && !!data && fontsReady && loaded >= images;
  const onImage = () => setLoaded((n) => n + 1);
  const onImageError = (src: string) => setFatal(`gambar gagal dimuat: ${src}`);

  return (
    <div
      id="card"
      data-card-ready={ready ? "1" : undefined}
      data-card-error={error ?? undefined}
      className="relative overflow-hidden bg-coal-bg font-sans text-coal-text"
      style={{ width: W, height: H }}
    >
      {error ? (
        <div className="p-16 text-[28px] text-coal-text">Kartu tidak dibuat: {error}</div>
      ) : data ? (
        template === "cahaya" ? (
          <LightsBody kode={kode} d={data} onImage={onImage} onImageError={onImageError} />
        ) : (
          <KecamatanBody kode={kode} d={data} />
        )
      ) : null}
      <CornerTag />
      {debug && <SafeZones />}
    </div>
  );
}

/** Desa rows joined to Dukcapil population (code-for-code; the guardrail above checks coverage). */
function joinDesa(d: Loaded) {
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

  // Residents of desa where most of the area is lit at night (lit share >= 50%),
  // against the share of the whole kabupaten that is lit (area-weighted).
  const pop = rows.reduce((a, r) => a + r.pop, 0);
  const litPop = rows.filter((r) => (r.lit_pct ?? 0) >= MAJORITY).reduce((a, r) => a + r.pop, 0);
  const area = rows.reduce((a, r) => a + r.area_km2, 0);
  const litArea = rows.reduce((a, r) => a + (r.area_km2 * (r.lit_pct ?? 0)) / 100, 0);
  const darkDesa = rows.filter((r) => (r.lit_pct ?? 0) < MAJORITY).length;
  const popShare = (litPop / pop) * 100;
  const areaShare = (litArea / area) * 100;
  const year = d.desa!.metadata.lights.year;
  const outlineEls = edge.map((p) => <path key={`e-${p.id}`} d={p.d} fill="none" stroke="#F3ECDD" strokeWidth={2.2} vectorEffect="non-scaling-stroke" />);

  return (
    <Column>
      <Title eyebrow={`Penduduk vs cahaya malam ${year}`} kab={d.kab} />
      {/* Same frame for both maps; a tall kabupaten (Barru) sits side by side, a wide one stacks. */}
      <div className={`mt-4 grid min-h-0 flex-1 gap-4 ${view.h > view.w ? "grid-cols-2" : "grid-rows-2"}`}>
        <div className="flex min-h-0 flex-col">
          <div className="font-mono text-[18px] uppercase tracking-[0.12em] text-coal-muted">Penduduk terdaftar per desa</div>
          <div className="mt-2 min-h-0 flex-1">
            <RasterMap layers={[]} view={view} outer={outer} onImage={onImage} onImageError={onImageError}>
              {villagePaths.map((p) => {
                const r = byId.get(p.id);
                return <path key={p.id} d={p.d} fill={r ? CLASS_COLORS[cls(r.pop / r.area_km2)] : NO_DATA} stroke="rgba(11,26,51,0.5)" strokeWidth={0.4} vectorEffect="non-scaling-stroke" />;
              })}
              {outlineEls}
            </RasterMap>
          </div>
        </div>
        <div className="flex min-h-0 flex-col">
          <div className="font-mono text-[18px] uppercase tracking-[0.12em] text-coal-muted">Cahaya malam {year}</div>
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
      <OffFrameNote items={fit.offFrame} />
      <div className="mt-4 shrink-0">
        <p className="text-[32px] font-semibold leading-tight">
          <span className="text-ink-gold">{pct1(popShare)}</span> penduduk tinggal di desa yang terang malam hari
          {/* "padahal hanya" only when people are clearly more concentrated than light. */}
          {popShare - areaShare >= 20 ? <>, padahal hanya {pct1(areaShare)} wilayahnya bercahaya.</> : <>; {pct1(areaShare)} wilayahnya bercahaya.</>}
        </p>
        <div className="mt-5 grid grid-cols-2 gap-6">
          <Fact value={compact(litPop)} label="penduduk di desa terang" />
          <Fact value={formatNumber(darkDesa)} label={`dari ${formatNumber(rows.length)} desa sebagian besar gelap`} />
        </div>
        <p className="mt-4 text-[19px] text-coal-muted">
          Desa terang: separuh luasnya atau lebih bercahaya (≥ {d.desa!.metadata.lights.lit_threshold_nw} nW/cm²/sr). Cahaya malam
          menunjukkan permukiman dan aktivitas, bukan jumlah penduduk.
        </p>
        <Footer source={`Penduduk: Ditjen Dukcapil Kemendagri, data ${bulanTahun(d.period)} (terdaftar); cahaya: World Bank Light Every Night, VIIRS ${year} (CC BY 4.0); desa: BIG 1:10.000; dihitung NusaStats`} />
      </div>
    </Column>
  );
}

function KecamatanBody({ kode, d }: { kode: string; d: Loaded }) {
  const kec = d.kec!;
  const { paths, edge, labels, numbered, vw, vh, fit } = useMemo(() => {
    const feats = d.districts.features.filter((f) => f.properties.domain_id.startsWith(kode));
    const own = d.outline.features.filter((f) => f.properties.domain_id === kode);
    const fit = framing(feats);
    const { paths, vw, vh } = project(feats, fit.frame);
    const names = new Map(kec.results.map((r) => [r.domain_id, titleCase(r.domain_name)]));
    return { paths, vw, vh, fit, edge: project(own, fit.frame).paths, ...placeLabels(feats, fit.frame, vw, vh, names, 856, 760) };
  }, [d, kode, kec]);
  const byId = new Map(kec.results.map((r) => [r.domain_id, r]));
  const vals = kec.results.map((r) => r.value);
  const [min, max] = [Math.min(...vals), Math.max(...vals)];
  const unit = kec.unit ? ` ${kec.unit}` : "";
  const fmt = (v: number) => `${v.toLocaleString("id-ID", { maximumFractionDigits: 1 })}${unit === " %" ? "%" : unit}`;
  const sorted = [...kec.results].sort((a, b) => b.value - a.value);
  const k = 1 / Math.min(856 / vw, 760 / vh);

  return (
    <Column>
      <Title eyebrow={`${kec.indicator.label_id} per kecamatan`} kab={d.kab} />
      <div className="mt-6 flex min-h-0 flex-1 items-center justify-center">
        <svg viewBox={`0 0 ${vw.toFixed(0)} ${vh.toFixed(0)}`} preserveAspectRatio="xMidYMid meet" className="h-full w-full">
          {paths.map((p) => {
            const r = byId.get(p.id);
            return <path key={p.id} d={p.d} fill={r ? rampColor((r.value - min) / (max - min || 1)) : NO_DATA} stroke="rgba(11,26,51,0.6)" strokeWidth={0.8} vectorEffect="non-scaling-stroke" />;
          })}
          {edge.map((p) => <path key={`e-${p.id}`} d={p.d} fill="none" stroke="#F3ECDD" strokeWidth={2.4} vectorEffect="non-scaling-stroke" />)}
          <MapLabels labels={labels} numbered={numbered} k={k} />
        </svg>
      </div>
      <OffFrameNote items={fit.offFrame} />
      <LabelLegend numbered={numbered} />
      <div className="mt-4 shrink-0">
        <div className="flex items-center gap-4 font-mono text-[20px] text-coal-muted">
          <span className="whitespace-nowrap">{fmt(min)}</span>
          <div className="h-3 min-w-0 flex-1 rounded-full" style={{ background: `linear-gradient(90deg, ${RAMP.join(", ")})` }} />
          <span className="whitespace-nowrap">{fmt(max)}</span>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-6">
          <Fact value={fmt(sorted[0].value)} label={`tertinggi: ${titleCase(sorted[0].domain_name)}`} />
          <Fact value={fmt(sorted[sorted.length - 1].value)} label={`terendah: ${titleCase(sorted[sorted.length - 1].domain_name)}`} />
        </div>
        <Footer source={`Diolah dari Ditjen Dukcapil Kemendagri, data ${bulanTahun(d.period)} (penduduk terdaftar, bukan sensus)`} />
      </div>
    </Column>
  );
}
