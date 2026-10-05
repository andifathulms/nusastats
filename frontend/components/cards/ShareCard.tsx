"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { formatNumber, regionLabel, titleCase } from "@/lib/api";
import { loadPeta, petaAsset, type Peta } from "@/lib/peta";

/**
 * 1080×1920 share card (docs/FEATURE-peta-wilayah.md §6.2), rendered for the PNG
 * exporter in scripts/card. Contract with the exporter:
 *   - #card is exactly 1080×1920;
 *   - when fonts, data and every image have loaded, #card gets data-card-ready;
 *   - if any guardrail fails (§8), #card gets data-card-error and NO card content,
 *     so a wrong number can never be exported.
 * Fixed colours on the coal (deep-sea) surface, which is dark in both themes, so
 * the image does not depend on the viewer's theme. No animation.
 */

export type Template = "terrain" | "landcover" | "nightlights";
export const TEMPLATES: Template[] = ["terrain", "landcover", "nightlights"];

const W = 1080;
const H = 1920;
// TikTok UI zones (spec §6.2): keep text and key content out of them.
const SAFE = { top: 220, bottom: 420, right: 160 };
const PAD = 64; // left margin
const CONTENT_W = W - PAD - SAFE.right; // 856

type Outline = { id: string; d: string };
type Geo = { features: { properties: { domain_id: string }; geometry: { type: string; coordinates: unknown } }[] };

const pctInt = (v: number) => (v > 0 && v < 1 ? "<1%" : `${formatNumber(Math.round(v))}%`);
const metres = (v: number) => `${formatNumber(Math.round(v))} m`;
// Peak heights are model pixels (30 m, surface model): round to 10 m, never quote to the metre.
const peak = (v: number) => `${formatNumber(Math.round(v / 10) * 10)} m`;

function areaTitle(peta: Peta, kode: string): { title: string; sub: string } {
  const name = peta.terrain?.name ?? peta.landcover?.name ?? peta.nightlights?.name ?? kode;
  const provName = titleCase((peta.terrain ?? peta.landcover ?? peta.nightlights)?.provinsi.name ?? "");
  const t = titleCase(name);
  if (kode.length === 4) return { title: /^kota /i.test(name) ? t : regionLabel(t, "Kabupaten"), sub: provName };
  if (kode.length === 6) return { title: `Kec. ${t}`, sub: provName };
  return { title: t, sub: "Indonesia" };
}

/** §8 guardrails. Returns the problems; any problem = no card. */
function problems(peta: Peta | null, template: Template): string[] {
  if (!peta) return ["area belum dihitung (tidak ada bounds.json)"];
  const out: string[] = [];
  if (template === "terrain") {
    const t = peta.terrain;
    if (!t) return ["terrain.json tidak ada"];
    if (!peta.present.elevation || !peta.present.hillshade) out.push("gambar elevasi/hillshade tidak ada di perangkat ini");
    if (t.relief_m < 0) out.push(`relief negatif (${t.relief_m})`);
    if (t.elevation_m.max < t.elevation_m.mean || t.elevation_m.mean < t.elevation_m.min) out.push("min/rata-rata/maks tidak urut");
    const bands = Object.values(t.elevation_bands_pct).reduce((a, b) => a + b, 0);
    if (Math.abs(bands - 100) > 0.5) out.push(`pita elevasi berjumlah ${bands.toFixed(2)}%`);
    if (t.classification.official !== false) out.push("klasifikasi medan tidak ditandai sebagai klasifikasi NusaStats");
  } else if (template === "nightlights") {
    const nl = peta.nightlights;
    if (!nl) return ["nightlights.json tidak ada"];
    if (!peta.present.nightlights) out.push("gambar cahaya malam tidak ada di perangkat ini");
    const ys = Object.values(nl.years);
    if (!nl.years[String(nl.base_year)] || !nl.years[String(nl.latest_year)]) out.push("tahun dasar/terakhir tidak ada");
    if (ys.some((y) => y.lit_pct < 0 || y.lit_pct > 100 || y.mean_nw < 0)) out.push("nilai cahaya malam di luar rentang");
  } else {
    const lc = peta.landcover;
    if (!lc) return ["landcover.json tidak ada"];
    if (!peta.present.landcover) out.push("gambar tutupan lahan tidak ada di perangkat ini");
    const sum = lc.classes.reduce((a, c) => a + c.share_pct, 0);
    if (Math.abs(sum - 100) > 0.5) out.push(`porsi kelas berjumlah ${sum.toFixed(2)}%`);
    if (lc.classes.length === 0) out.push("tidak ada kelas tutupan lahan");
  }
  return out;
}

export function ShareCard({ template, kode, debug }: { template: Template; kode: string; debug: boolean }) {
  const [peta, setPeta] = useState<Peta | null | undefined>(undefined);
  const [geo, setGeo] = useState<Geo | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(0);
  const [fontsReady, setFontsReady] = useState(false);

  useEffect(() => {
    loadPeta(kode).then(setPeta).catch((e) => setFatal(String(e)));
    fetch(`/dukcapil-districts-${kode.slice(0, 2)}.geojson`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`batas kecamatan -> ${r.status}`))))
      .then(setGeo)
      .catch((e) => setFatal(String(e)));
    document.fonts.ready.then(() => setFontsReady(true));
  }, [kode]);

  const issues = peta === undefined ? [] : problems(peta, template);
  // "Not computed" explains everything else that 404s, so it wins.
  const error = peta === null ? issues.join("; ") : fatal ?? (issues.length ? issues.join("; ") : null);

  const layers =
    peta && !error
      ? template === "terrain"
        ? [petaAsset(kode, peta.bounds.layers.elevation!), petaAsset(kode, peta.bounds.layers.hillshade!)]
        : template === "nightlights"
          ? [petaAsset(kode, peta.bounds.layers.nightlights!)]
          : [petaAsset(kode, peta.bounds.layers.landcover!)]
      : [];
  const ready = !error && !!peta && !!geo && fontsReady && loaded === layers.length;

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
      ) : peta && geo ? (
        <CardBody
          template={template}
          kode={kode}
          peta={peta}
          geo={geo}
          layers={layers}
          onImage={() => setLoaded((n) => n + 1)}
          onImageError={(src) => setFatal(`gambar gagal dimuat: ${src}`)}
        />
      ) : null}
      <CornerTag />
      {debug && <SafeZones />}
    </div>
  );
}

function CornerTag() {
  // Fixed position and style on every card (spec §6.2), inside the safe area.
  return (
    <div
      className="absolute rounded-full bg-kunyit-light px-5 py-2 font-mono text-[24px] font-semibold tracking-[0.04em] text-laut-950"
      style={{ left: PAD, top: SAFE.top + 24 }}
    >
      Fathul · Dev
    </div>
  );
}

function SafeZones() {
  const z = "absolute flex items-center justify-center bg-red-600/35 font-mono text-[22px] text-white outline outline-2 outline-red-500";
  return (
    <>
      <div className={z} style={{ left: 0, top: 0, width: W, height: SAFE.top }}>UI atas {SAFE.top}px</div>
      <div className={z} style={{ left: 0, bottom: 0, width: W, height: SAFE.bottom }}>UI bawah {SAFE.bottom}px</div>
      <div className={z} style={{ right: 0, top: SAFE.top, width: SAFE.right, height: H - SAFE.top - SAFE.bottom }}>
        <span className="-rotate-90 whitespace-nowrap">UI kanan {SAFE.right}px</span>
      </div>
    </>
  );
}

function useOutlines(geo: Geo, kode: string, bounds: Peta["bounds"]) {
  return useMemo(() => {
    const cosMid = Math.cos((((bounds.south + bounds.north) / 2) * Math.PI) / 180);
    const vw = 1000;
    const s = vw / ((bounds.east - bounds.west) * cosMid);
    const vh = (bounds.north - bounds.south) * s;
    const px = (lon: number) => (lon - bounds.west) * s * cosMid;
    const py = (lat: number) => (bounds.north - lat) * s;
    const paths: Outline[] = geo.features
      .filter((f) => f.properties.domain_id.startsWith(kode))
      .map((f) => {
        const polys = (f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates) as number[][][][];
        const d = polys
          .map((poly) => poly.map((ring) => ring.map(([x, y], i) => `${i ? "L" : "M"}${px(x).toFixed(1)} ${py(y).toFixed(1)}`).join("") + "Z").join(""))
          .join("");
        return { id: f.properties.domain_id, d };
      });
    return { paths, vw, vh };
  }, [geo, kode, bounds]);
}

function CardBody({
  template,
  kode,
  peta,
  geo,
  layers,
  onImage,
  onImageError,
}: {
  template: Template;
  kode: string;
  peta: Peta;
  geo: Geo;
  layers: string[];
  onImage: () => void;
  onImageError: (src: string) => void;
}) {
  const { title, sub } = areaTitle(peta, kode);
  const { paths, vw, vh } = useOutlines(geo, kode, peta.bounds);
  const counted = useRef(new Set<string>());
  const done = (src: string) => {
    if (counted.current.has(src)) return;
    counted.current.add(src);
    onImage();
  };
  const eyebrow =
    template === "terrain"
      ? "Peta medan"
      : template === "nightlights"
        ? `Cahaya malam ${peta.nightlights?.base_year}–${peta.nightlights?.latest_year}`
        : `Tutupan lahan ${peta.landcover?.year ?? ""}`;
  const titleSize = title.length > 26 ? 60 : title.length > 18 ? 72 : 84;
  const top = SAFE.top + 100; // below the corner tag

  // A fixed-height column that ends exactly where the bottom UI zone starts:
  // the map takes whatever height is left, so text can never spill into a zone.
  return (
    <div className="absolute flex flex-col" style={{ left: PAD, top, width: CONTENT_W, height: H - SAFE.bottom - top }}>
      <div className="font-mono text-[24px] uppercase tracking-[0.14em] text-ink-gold">{eyebrow}</div>
      <h1 className="mt-3 font-display font-medium leading-[1.02] tracking-[-0.02em]" style={{ fontSize: titleSize }}>
        {title}
      </h1>
      <div className="mt-2 text-[34px] text-coal-muted">{sub}</div>

      <div className="mt-6 flex min-h-0 flex-1 items-center justify-center">
        <svg viewBox={`0 0 ${vw.toFixed(0)} ${vh.toFixed(0)}`} preserveAspectRatio="xMidYMid meet" className="h-full w-full">
          {layers.map((src, i) => (
            <image
              key={src}
              href={src}
              x={0}
              y={0}
              width={vw}
              height={vh}
              preserveAspectRatio="none"
              style={{ mixBlendMode: i === 1 ? "multiply" : "normal", imageRendering: template === "terrain" ? "auto" : "pixelated" }}
              onLoad={() => done(src)}
              onError={() => onImageError(src)}
            />
          ))}
          {paths.map((p) => (
            <path key={p.id} d={p.d} fill="none" stroke="rgba(243,236,221,0.85)" strokeWidth={kode.length === 4 ? 1.6 : 2.4} vectorEffect="non-scaling-stroke" />
          ))}
        </svg>
      </div>

      {template === "terrain" ? (
        <TerrainFacts peta={peta} />
      ) : template === "nightlights" ? (
        <NightlightsFacts peta={peta} />
      ) : (
        <LandcoverFacts peta={peta} />
      )}
    </div>
  );
}

function Fact({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <div className="whitespace-nowrap text-[54px] font-extrabold leading-none tracking-[-0.02em] tabular-nums">{value}</div>
      <div className="mt-2 text-[24px] text-coal-muted">{label}</div>
    </div>
  );
}

function TerrainFacts({ peta }: { peta: Peta }) {
  const t = peta.terrain!;
  const stops = t.metadata.tint;
  const topIdx = stops.findIndex(([m]) => m >= t.elevation_m.max);
  const shown = stops.slice(0, topIdx === -1 ? stops.length : topIdx + 1);
  const top = shown[shown.length - 1][0] || 1;
  const gradient = shown.map(([m, c]) => `${c} ${((m / top) * 100).toFixed(2)}%`).join(", ");
  return (
    <div className="mt-6 shrink-0">
      <div className="flex items-center gap-4 font-mono text-[20px] text-coal-muted">
        <span>0</span>
        <div className="h-3 min-w-0 flex-1 rounded-full" style={{ background: `linear-gradient(90deg, ${gradient})` }} />
        <span className="whitespace-nowrap">{formatNumber(top)} m</span>
      </div>
      <div className="mt-6 flex items-baseline gap-4">
        <span className="font-display text-[64px] font-medium leading-none">{t.terrain_class_label}</span>
        <span className="rounded-full border border-coal-border px-4 py-1 text-[20px] text-coal-muted">klasifikasi NusaStats</span>
      </div>
      <div className="mt-6 grid grid-cols-3 gap-6">
        <Fact value={metres(t.elevation_m.mean)} label="rata-rata elevasi" />
        <Fact value={peak(t.highest_point.elevation_m)} label="titik tertinggi" />
        <Fact value={pctInt(t.metrics_pct.share_elev_ge_1000)} label="luas di atas 1.000 m" />
      </div>
      <Footer source={`Copernicus DEM GLO-30, data 2011–2015 (© DLR e.V., © Airbus DS; Copernicus/EU/ESA)`} />
    </div>
  );
}

function LandcoverFacts({ peta }: { peta: Peta }) {
  const lc = peta.landcover!;
  const top3 = lc.classes.slice(0, 3);
  // Legend: only classes the area actually has at a visible share.
  const legend = lc.classes.filter((c) => c.share_pct >= 0.1);
  return (
    <div className="mt-6 shrink-0">
      <ul className="flex flex-wrap gap-x-6 gap-y-2 text-[22px] text-coal-muted">
        {legend.map((c) => (
          <li key={c.code} className="inline-flex items-center gap-2">
            <span className="inline-block h-5 w-5 rounded" style={{ background: c.color }} />
            {c.label}
          </li>
        ))}
      </ul>
      <div className="mt-6 grid grid-cols-3 gap-6">
        {top3.map((c) => (
          <div key={c.code}>
            <div className="flex items-center gap-3">
              <span className="inline-block h-6 w-6 shrink-0 rounded" style={{ background: c.color }} />
              <span className="whitespace-nowrap text-[54px] font-extrabold leading-none tracking-[-0.02em] tabular-nums">{pctInt(c.share_pct)}</span>
            </div>
            <div className="mt-2 text-[24px] text-coal-muted">{c.label.toLowerCase()}</div>
          </div>
        ))}
      </div>
      {top3.some((c) => c.code === 10) && (
        <p className="mt-6 text-[20px] text-coal-muted">Tutupan pohon termasuk hutan dan perkebunan (sawit, akasia).</p>
      )}
      <Footer source={`ESA WorldCover ${lc.year} v200 (CC BY 4.0)`} />
    </div>
  );
}

function NightlightsFacts({ peta }: { peta: Peta }) {
  const nl = peta.nightlights!;
  const years = Object.keys(nl.years).sort();
  const base = nl.years[String(nl.base_year)];
  const last = nl.years[String(nl.latest_year)];
  const max = Math.max(...years.map((y) => nl.years[y].lit_pct), 0.1);
  const x = nl.growth.lit_km2_x;
  return (
    <div className="mt-6 shrink-0">
      <div className="flex h-[86px] items-end gap-3">
        {years.map((y) => (
          <div key={y} className="flex flex-1 flex-col items-center gap-2">
            <div className="w-full rounded-t-md bg-kunyit-light" style={{ height: Math.max(4, (nl.years[y].lit_pct / max) * 60) }} />
            <span className="font-mono text-[18px] text-coal-muted">{y}</span>
          </div>
        ))}
      </div>
      <div className="mt-6 grid grid-cols-3 gap-6">
        <Fact value={pctInt(base.lit_pct)} label={`bercahaya ${nl.base_year}`} />
        <Fact value={pctInt(last.lit_pct)} label={`bercahaya ${nl.latest_year}`} />
        <Fact value={x ? `×${formatNumber(Math.round(x * 10) / 10)}` : "–"} label="luas bercahaya" />
      </div>
      <p className="mt-6 text-[20px] text-coal-muted">Cahaya malam menunjukkan permukiman dan aktivitas, bukan jumlah penduduk.</p>
      <Footer source={`World Bank Light Every Night, VIIRS ${nl.base_year}–${nl.latest_year} (CC BY 4.0)`} />
    </div>
  );
}

function Footer({ source }: { source: string }) {
  return (
    <p className="mt-6 border-t border-coal-border pt-4 text-[19px] leading-snug text-coal-muted">
      Sumber: {source}. Batas wilayah indikatif (BIG).
    </p>
  );
}
