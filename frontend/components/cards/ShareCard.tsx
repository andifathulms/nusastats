"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { formatNumber, regionLabel, titleCase } from "@/lib/api";
import { litGrowth, loadPeta, MIN_BASE_LIT_KM2, petaAsset, type Peta } from "@/lib/peta";
import { themeVar } from "./brand";
import { cropBox, framing, type Feature, type OffFrame } from "./geo";

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

export type Template = "terrain" | "landcover" | "nightlights" | "lowland" | "relief";
export const TEMPLATES: Template[] = ["terrain", "landcover", "nightlights", "lowland", "relief"];

/** One raster in a card's stack, drawn in order (as on the Peta Wilayah page). */
type Layer = { src: string; blend?: "multiply"; opacity?: number; pixelated?: boolean };

// Canvas and zones live in layout.tsx (one rule for text, a looser one for maps).
import { CONTENT_W, CardHeader, H, MapLayout, PAD, SAFE, TikTokOverlay, W, ZONE } from "./layout";
export { CONTENT_W, H, PAD, SAFE, W };

type Outline = { id: string; d: string };
const NO_FEATURES = { features: [] };
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
  } else if (template === "lowland" || template === "relief") {
    const t = peta.terrain;
    if (!t) return ["terrain.json tidak ada"];
    if (template === "lowland") {
      if (!peta.present.lowland || !t.lowland_pct || !t.metadata.lowland_colors) out.push("lapisan dataran rendah tidak ada");
      else if (t.lowland_pct.lt_5 > t.lowland_pct.lt_10 || t.lowland_pct.lt_10 > 100) out.push("porsi <5 m melebihi porsi <10 m");
    } else {
      const lr = t.local_relief;
      if (!peta.present.relief || !lr || !t.metadata.relief_colors) out.push("lapisan relief tidak ada");
      else {
        const sum = Object.values(lr.classes_pct).reduce((a, b) => a + b, 0);
        if (Math.abs(sum - 100) > 0.5) out.push(`kelas relief berjumlah ${sum.toFixed(2)}%`);
      }
    }
  } else if (template === "nightlights") {
    const nl = peta.nightlights;
    if (!nl) return ["nightlights.json tidak ada"];
    if (!peta.present.nightlights) out.push("gambar cahaya malam tidak ada di perangkat ini");
    const ys = Object.values(nl.years);
    if (!nl.years[String(nl.base_year)] || !nl.years[String(nl.latest_year)] || nl.growth.lit_km2_x === null)
      out.push("tahun dasar/terakhir tidak lengkap; perbandingan tidak sebanding");
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
  // A kabupaten's own boundary (null for a kecamatan card, which has no inner lines).
  const [regGeo, setRegGeo] = useState<Geo | null | undefined>(undefined);
  const [fatal, setFatal] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(0);
  const [fontsReady, setFontsReady] = useState(false);

  useEffect(() => {
    loadPeta(kode).then(setPeta).catch((e) => setFatal(String(e)));
    fetch(`/dukcapil-districts-${kode.slice(0, 2)}.geojson`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`batas kecamatan -> ${r.status}`))))
      .then(setGeo)
      .catch((e) => setFatal(String(e)));
    if (kode.length === 4)
      fetch("/dukcapil-regencies.geojson")
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`batas kabupaten -> ${r.status}`))))
        .then(setRegGeo)
        .catch((e) => setFatal(String(e)));
    else setRegGeo(null);
    document.fonts.ready.then(() => setFontsReady(true));
  }, [kode]);

  const issues = peta === undefined ? [] : problems(peta, template);
  // "Not computed" explains everything else that 404s, so it wins.
  const error = peta === null ? issues.join("; ") : fatal ?? (issues.length ? issues.join("; ") : null);

  const asset = (k: keyof Peta["bounds"]["layers"]) => petaAsset(kode, peta!.bounds.layers[k]!);
  const shade = peta?.present.hillshade;
  const layers: Layer[] =
    peta && !error
      ? template === "terrain"
        ? [{ src: asset("elevation") }, { src: asset("hillshade"), blend: "multiply" }]
        : template === "nightlights"
          ? [{ src: asset("nightlights"), pixelated: true }]
          : template === "lowland"
            ? [...(shade ? [{ src: asset("hillshade"), opacity: 0.55 }] : []), { src: asset("lowland"), pixelated: true }]
            : template === "relief"
              ? [{ src: asset("relief"), pixelated: true }, ...(shade ? [{ src: asset("hillshade"), blend: "multiply" as const }] : [])]
              : [{ src: asset("landcover"), pixelated: true }]
      : [];
  const ready = !error && !!peta && !!geo && regGeo !== undefined && fontsReady && loaded === layers.length;

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
      ) : peta && geo ? (
        <CardBody
          template={template}
          kode={kode}
          peta={peta}
          geo={geo}
          layers={layers}
          regGeo={regGeo ?? null}
          onImage={() => setLoaded((n) => n + 1)}
          onImageError={(src) => setFatal(`gambar gagal dimuat: ${src}`)}
        />
      ) : null}
      <CornerTag />
      {debug && <TikTokOverlay />}
    </div>
  );
}

export function CornerTag({ label = "Nusantara Mapper" }: { label?: string }) {
  // The wordmark, fixed position and style on every card (spec §6.2), inside the
  // safe area: a framed grid square with a dot in the card's theme colour.
  return (
    <div className="absolute flex items-center gap-[14px]" style={{ left: PAD, top: ZONE.wordmarkTop }}>
      <svg width="40" height="40" viewBox="0 0 40 40" aria-hidden="true">
        <rect x="3" y="3" width="34" height="34" rx="4" fill="none" stroke="currentColor" strokeWidth="3" />
        <path d="M3 20h34M20 3v34" stroke="currentColor" strokeWidth="2" opacity=".5" />
        <circle cx="26" cy="14" r="5" style={{ fill: "var(--nm-theme)" }} />
      </svg>
      <span className="text-[28px] font-extrabold uppercase leading-none tracking-[0.06em]" style={{ fontVariationSettings: '"wdth" 68' }}>
        {label}
      </span>
    </div>
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
  regGeo,
  onImage,
  onImageError,
}: {
  template: Template;
  kode: string;
  peta: Peta;
  geo: Geo;
  layers: Layer[];
  regGeo: Geo | null;
  onImage: () => void;
  onImageError: (src: string) => void;
}) {
  const { title, sub } = areaTitle(peta, kode);
  const { paths, vw, vh } = useOutlines(geo, kode, peta.bounds);
  // Frame the main landmass; far-off islands are named under the map instead.
  const fit = useMemo(() => framing(geo.features.filter((f) => f.properties.domain_id.startsWith(kode)) as Feature[]), [geo, kode]);
  const view = fit.cropped ? cropBox(fit.frame, peta.bounds) : { x: 0, y: 0, w: vw, h: vh };
  const outline = useOutlines(regGeo ?? NO_FEATURES, kode, peta.bounds).paths;
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
        : template === "lowland"
          ? "Dataran sangat rendah"
          : template === "relief"
            ? "Relief lokal"
            : `Tutupan lahan ${peta.landcover?.year ?? ""}`;
  const facts =
    template === "terrain" ? (
      <TerrainFacts peta={peta} />
    ) : template === "nightlights" ? (
      <NightlightsFacts peta={peta} />
    ) : template === "lowland" ? (
      <LowlandFacts peta={peta} />
    ) : template === "relief" ? (
      <ReliefFacts peta={peta} />
    ) : (
      <LandcoverFacts peta={peta} />
    );

  return (
    <MapLayout
      aspect={view.h / view.w}
      header={<CardHeader kicker={`${eyebrow} · ${sub}`} title={title} />}
      info={
        <>
          <OffFrameNote items={fit.offFrame} />
          {facts}
        </>
      }
      map={
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
              onLoad={() => done(l.src)}
              onError={() => onImageError(l.src)}
            />
          ))}
          {/* A kabupaten: kecamatan as faint hairlines under its own strong outline. */}
          {paths.map((p) => (
            <path
              key={p.id}
              d={p.d}
              fill="none"
              stroke={outline.length ? "rgba(243,236,221,0.22)" : "rgba(243,236,221,0.85)"}
              strokeWidth={outline.length ? 0.6 : kode.length === 4 ? 1.6 : 2.4}
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {outline.map((p) => (
            <path key={`o-${p.id}`} d={p.d} fill="none" stroke="#F3ECDD" strokeWidth={2.6} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          ))}
        </svg>
      }
    />
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
    <div className="shrink-0">
      <div className="flex items-center gap-4 font-mono text-[26px] text-coal-muted">
        <span>0</span>
        <div className="h-3 min-w-0 flex-1 rounded-full" style={{ background: `linear-gradient(90deg, ${gradient})` }} />
        <span className="whitespace-nowrap">{formatNumber(top)} m</span>
      </div>
      <div className="mt-6 flex flex-wrap items-baseline gap-x-4 gap-y-2">
        <span className="font-display text-[64px] font-medium leading-none">{t.terrain_class_label}</span>
        <span className="rounded-full border border-coal-border px-4 py-1 text-[26px] text-coal-muted">klasifikasi NusaStats</span>
      </div>
      {/* The profile's one terrain slide also carries local relief (the relief card stays as an extra). */}
      {t.local_relief && (
        <p className="mt-3 text-[28px] text-coal-muted">
          Relief lokal:{" "}
          {(
            [["datar", t.local_relief.classes_pct.datar], ["bergelombang", t.local_relief.classes_pct.bergelombang], ["berbukit", t.local_relief.classes_pct.berbukit], ["bergunung", t.local_relief.classes_pct.bergunung]] as [string, number][]
          )
            .sort((a, b) => b[1] - a[1])
            .slice(0, 2)
            .map(([l, v]) => `${pctInt(v)} ${l}`)
            .join(", ")}
        </p>
      )}
      <div className="mt-6 nm-facts grid grid-cols-3 gap-6">
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
    <div className="shrink-0">
      <ul className="flex flex-wrap gap-x-6 gap-y-2 text-[24px] text-coal-muted">
        {legend.map((c) => (
          <li key={c.code} className="inline-flex items-center gap-2">
            <span className="inline-block h-5 w-5 rounded" style={{ background: c.color }} />
            {c.label}
          </li>
        ))}
      </ul>
      <div className="mt-6 nm-facts grid grid-cols-3 gap-6">
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
        <p className="mt-6 text-[26px] text-coal-muted">Tutupan pohon termasuk hutan dan perkebunan (sawit, akasia).</p>
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
  const x = litGrowth(nl);
  return (
    <div className="shrink-0">
      <div className="nm-years flex h-[86px] items-end gap-3">
        {years.map((y) => (
          <div key={y} className="flex min-w-0 flex-1 flex-col items-center gap-2">
            <div className="w-full rounded-t-md bg-kunyit-light" style={{ height: Math.max(4, (nl.years[y].lit_pct / max) * 60) }} />
            <span className="whitespace-nowrap font-mono text-[24px] text-coal-muted">{y}</span>
          </div>
        ))}
      </div>
      <div className="mt-6 nm-facts grid grid-cols-3 gap-6">
        <Fact value={pctInt(base.lit_pct)} label={`bercahaya ${nl.base_year}`} />
        <Fact value={pctInt(last.lit_pct)} label={`bercahaya ${nl.latest_year}`} />
        {x ? (
          <Fact value={`×${formatNumber(Math.round(x * 10) / 10)}`} label="luas bercahaya" />
        ) : (
          <Fact value={`${formatNumber(Math.round(last.lit_km2))} km²`} label={`bercahaya ${nl.latest_year} (dari <${MIN_BASE_LIT_KM2} km²)`} />
        )}
      </div>
      <p className="mt-6 text-[26px] text-coal-muted">Cahaya malam menunjukkan permukiman dan aktivitas, bukan jumlah penduduk.</p>
      <Footer source={`World Bank Light Every Night, VIIRS ${nl.base_year}–${nl.latest_year} (CC BY 4.0)`} />
    </div>
  );
}

function LowlandFacts({ peta }: { peta: Peta }) {
  const t = peta.terrain!;
  const [c5, c10] = t.metadata.lowland_colors!;
  const lp = t.lowland_pct!;
  return (
    <div className="shrink-0">
      <ul className="flex flex-wrap gap-x-6 gap-y-2 text-[24px] text-coal-muted">
        <li className="inline-flex items-center gap-2"><span className="inline-block h-5 w-5 rounded" style={{ background: c5 }} />di bawah 5 m</li>
        <li className="inline-flex items-center gap-2"><span className="inline-block h-5 w-5 rounded" style={{ background: c10 }} />5–10 m</li>
      </ul>
      <div className="mt-6 nm-facts grid grid-cols-3 gap-6">
        <Fact value={pctInt(lp.lt_10)} label="luas di bawah 10 m" />
        <Fact value={pctInt(lp.lt_5)} label="luas di bawah 5 m" />
        <Fact value={pctInt(t.metrics_pct.share_elev_lt_100)} label="luas di bawah 100 m" />
      </div>
      {/* Same caveat as the Peta Wilayah page: the surface model reads canopy and roofs. */}
      <p className="mt-6 text-[26px] text-coal-muted">
        Batas bawah: hutan, mangrove dan bangunan terbaca lebih tinggi dari tanahnya, jadi daratan rendah yang sebenarnya bisa lebih luas.
      </p>
      <Footer source="Copernicus DEM GLO-30, data 2011–2015 (© DLR e.V., © Airbus DS; Copernicus/EU/ESA)" />
    </div>
  );
}

function ReliefFacts({ peta }: { peta: Peta }) {
  const t = peta.terrain!;
  const lr = t.local_relief!;
  const colors = t.metadata.relief_colors!;
  const b = lr.breaks_m;
  const classes: [string, string, number][] = [
    ["Datar", `< ${b[0]} m`, lr.classes_pct.datar],
    ["Bergelombang", `${b[0]}–${b[1]} m`, lr.classes_pct.bergelombang],
    ["Berbukit", `${b[1]}–${b[2]} m`, lr.classes_pct.berbukit],
    ["Bergunung", `≥ ${b[2]} m`, lr.classes_pct.bergunung],
  ];
  return (
    <div className="shrink-0">
      <div className="text-[26px] text-coal-muted">Beda tinggi dalam {formatNumber(lr.window_m / 1000)} km · klasifikasi NusaStats</div>
      <div className="mt-6 nm-facts grid grid-cols-4 gap-4">
        {classes.map(([label, range, pct], i) => (
          <div key={label}>
            <div className="flex items-center gap-2">
              <span className="inline-block h-5 w-5 shrink-0 rounded" style={{ background: colors[i] }} />
              <span className="whitespace-nowrap text-[44px] font-extrabold leading-none tabular-nums">{pctInt(pct)}</span>
            </div>
            <div className="mt-2 text-[26px] text-coal-muted">{label}</div>
            <div className="font-mono text-[24px] text-coal-muted">{range}</div>
          </div>
        ))}
      </div>
      <Footer source="Copernicus DEM GLO-30, data 2011–2015 (© DLR e.V., © Airbus DS; Copernicus/EU/ESA)" />
    </div>
  );
}

/** Names the parts of a region left outside a cropped frame, so nothing vanishes silently. */
export function OffFrameNote({ items }: { items: OffFrame[] }) {
  if (!items.length) return null;
  const shown = items.slice(0, 3).map((o) => `${titleCase(o.name)} (± ${formatNumber(o.km)} km ${o.dir})`);
  const more = items.length > 3 ? ` dan ${items.length - 3} lainnya` : "";
  return <p className="mb-4 shrink-0 text-[24px] leading-snug text-coal-muted">Di luar bingkai: {shown.join(", ")}{more}.</p>;
}

/** The source line: 22 px in the band just under the text zone (y 1514), the
 * same spot on every card whatever the layout. It's attribution, repeated in the
 * caption, so it may sit where TikTok's caption starts. Fixed to the card's own
 * 1080×1920 viewport (the /card page is exactly the card). */
export function Footer({ source }: { source: string }) {
  return (
    <p className="fixed text-[22px] leading-snug text-coal-muted" style={{ left: PAD, top: ZONE.sourceTop, width: CONTENT_W }}>
      Sumber: {source}. Batas wilayah indikatif (BIG).
    </p>
  );
}
