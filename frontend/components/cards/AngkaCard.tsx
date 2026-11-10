"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { carouselApi, dukcapilApi, regionLabel, type CarouselMapValue, type CarouselPackResult } from "@/lib/api";
import { loadPeta, loadPetaMosaic, petaAsset, type Peta, type PetaBounds } from "@/lib/peta";
import { NO_DATA, cropBox, framing, insets, kindFor, project, projector, scaleFor, type Feature, type Geo } from "./geo";
import { InsetBoxes, composeMap, plainMap, type Composed } from "./insetMap";
import { temaStyle, type Tema } from "./brand";
import { CornerTag, Footer, OffFrameNote } from "./ShareCard";
import { CONTENT_W, CardHeader, H, MapLayout, PAD, TikTokOverlay, W, ZONE } from "./layout";

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
 * scope = Kemendagri province code, several joined by "-" (71-72-73), or 00 for all of Indonesia. Every number is
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
/** One Peta image and the lon/lat box it is stretched over. */
type Layer = { src: string; bounds: PetaBounds; multiply: boolean };
const LEVEL_NOUN = { provinsi: "provinsi", kabupaten: "kabupaten/kota", kecamatan: "kecamatan" } as const;

/** The provinces a scope covers: "73" -> ["73"], "71-72-73" -> three, "00" (Indonesia) -> none. */
const provsOf = (scope: string) => (scope === "00" ? [] : scope.split("-"));

/** Boundary files a card needs; kecamatan come one file per province, so several provinces load several. */
function geometryUrls(level: string, scope: string, focus: string | null): string[] {
  const g = focus ?? "";
  if (g.length === 2 || (!focus && level === "provinsi")) return ["/dukcapil-provinces.geojson"];
  if (focus) return [`/dukcapil-districts-${g.slice(0, 2)}.geojson`];
  if (level === "kecamatan") return provsOf(scope).map((p) => `/dukcapil-districts-${p}.geojson`);
  return ["/dukcapil-regencies.geojson"];
}

function selectFeatures(geo: Geo, level: string, scope: string, focus: string | null): Feature[] {
  if (focus) return geo.features.filter((f) => (focus.length === 2 ? f.properties.domain_id === focus : f.properties.domain_id.startsWith(focus)));
  if (level === "provinsi" || scope === "00") return geo.features;
  const provs = provsOf(scope);
  return geo.features.filter((f) => provs.includes(f.properties.domain_id.slice(0, 2)));
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
  // Kabupaten emblems for the ranking rows (public/emblems, data/emblems/fetch_emblems.py):
  // kab code -> image URL, preloaded; empty where none was downloaded.
  const [emblems, setEmblems] = useState<Map<string, string> | undefined>(undefined);
  const [fatal, setFatal] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(0);
  const [fontsReady, setFontsReady] = useState(false);

  // A province focus is drawn from its kabupaten's images (loadPetaMosaic).
  const wantsPeta = !!focus && (focus.length >= 4 || focus.length === 2) && bg !== "none";
  // Province scope, one or several ("71-72-73-74-75-76" = Sulawesi).
  const wantsKabs = !focus && view !== "top10" && scope !== "00" && query.get("level") !== "provinsi";

  useEffect(() => {
    carouselApi.pack(packQuery).then(setData).catch((e) => setFatal(String(e.message ?? e)));
    document.fonts.ready.then(() => setFontsReady(true));
  }, [packQuery]);

  useEffect(() => {
    if (!data) return;
    Promise.all(
      geometryUrls(data.map.level, scope, focus).map((url) =>
        fetch(url).then((r) => (r.ok ? (r.json() as Promise<Geo>) : Promise.reject(new Error(`batas wilayah ${url} -> ${r.status}`)))),
      ),
    )
      .then((geos) => setGeo({ features: geos.flatMap((g) => g.features) }))
      .catch((e) => setFatal(String(e.message ?? e)));
    if (wantsPeta && focus!.length === 2)
      dukcapilApi
        .regions({ level: "regency", prov: focus! })
        .then((rs) => loadPetaMosaic(rs.map((r) => r.code).filter((c) => /^\d{4}$/.test(c)).sort()))
        .then(setPeta)
        .catch(() => setPeta(null));
    else if (wantsPeta) loadPeta(focus!).then(setPeta).catch(() => setPeta(null));
    else setPeta(null);
    if (focus?.length === 4)
      fetch("/dukcapil-regencies.geojson")
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`batas kabupaten -> ${r.status}`))))
        .then(setOutline)
        .catch((e) => setFatal(String(e.message ?? e)));
    else setOutline(null);
    if (wantsKabs)
      Promise.all(provsOf(scope).map((prov) => dukcapilApi.regions({ level: "regency", prov })))
        // Box labels: the bare name for a kabupaten (the box says which one), "Kota X" for a city.
        .then((lists) => setKabs(new Map(lists.flat().map((r) => [r.code, /^Kota/.test(r.status) ? regionLabel(r.name, r.status) : r.name]))))
        .catch((e) => setFatal(`nama kabupaten: ${String(e.message ?? e)}`));
    else setKabs(null);
  }, [data, scope, focus, wantsPeta, wantsKabs]);

  useEffect(() => {
    if (!data) return;
    if (view !== "top10" || data.map.level === "provinsi") return setEmblems(new Map());
    loadEmblems(data.map.values.map((v) => v.geo.slice(0, 4)))
      .then(setEmblems)
      .catch((e) => setFatal(String(e.message ?? e)));
  }, [data, view]);

  const start = Math.max(1, Number(query.get("start")) || 1);
  const issues = data ? problems(data, focus) : [];
  if (data && view === "top10" && start > data.map.values.length) issues.push(`peringkat #${start} tidak ada (${data.map.values.length} wilayah)`);
  const error = fatal ?? (issues.length ? issues.join("; ") : null);

  // The Peta layer behind a focused region, when it exists on this machine.
  // One image per layer, or one per kabupaten tile of a province (all elevations, then
  // all hillshades multiplied over them).
  const tiles = peta?.tiles ?? (peta ? [{ kode: focus!, bounds: peta.bounds }] : []);
  const pick = (key: "elevation" | "hillshade" | "landcover", multiply = false): Layer[] =>
    tiles.map((t) => ({ src: petaAsset(t.kode, t.bounds.layers[key]!), bounds: t.bounds, multiply }));
  const layers: Layer[] =
    peta && wantsPeta
      ? bg === "terrain" && peta.present.elevation && peta.present.hillshade
        ? [...pick("elevation"), ...pick("hillshade", true)]
        : bg === "landcover" && peta.present.landcover
          ? pick("landcover")
          : []
      : [];
  const note = wantsPeta && peta !== undefined && !layers.length ? `lapisan ${bg} belum ada untuk ${focus}; siluet` : undefined;
  const ready =
    !error && !!data && !!geo && peta !== undefined && outline !== undefined && kabs !== undefined && emblems !== undefined && fontsReady && loaded === layers.length;

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
          emblems && <TopBody data={data} asc={asc} start={start} emblems={emblems} countdown={Number(query.get("countdown")) || 5} />
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

type EmblemManifest = { emblems: Record<string, { file: string }> };

/** The emblems the manifest lists for these kabupaten codes, each decoded before
 * the card says it's ready. No manifest = no emblems; a listed file that fails
 * to load is an error (the card would silently lose a column). */
async function loadEmblems(codes: string[]): Promise<Map<string, string>> {
  const r = await fetch("/emblems/manifest.json");
  if (!r.ok) return new Map();
  const { emblems } = (await r.json()) as EmblemManifest;
  const wanted = [...new Set(codes)].filter((c) => emblems[c]);
  const urls = new Map(wanted.map((c) => [c, `/emblems/${emblems[c].file}`]));
  await Promise.all(
    [...urls.values()].map(async (src) => {
      const img = new Image();
      img.src = src;
      await img.decode().catch(() => Promise.reject(new Error(`lambang gagal dimuat: ${src}`)));
    }),
  );
  return urls;
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

/** A box's label: "Selayar", "Pangkajene Kepulauan, pulau terluar", or several
 * kabupaten sharing one box: "Kep. Sangihe, Talaud dan Siau Tagulandang Biaro". */
function boxTitle(members: { name: string; whole: boolean }[]): string {
  const one = (m: { name: string; whole: boolean }) => (m.whole ? m.name : `${m.name}, pulau terluar`);
  if (members.length === 1) return one(members[0]);
  const isles = /^(Kepulauan|Kep\.) /;
  // All island kabupaten: "Kep." once ("Kep. Sangihe, Talaud dan Siau Tagulandang Biaro").
  const all = members.every((m) => isles.test(m.name));
  const names = members.map((m) => (all ? one(m).replace(isles, "") : one(m).replace(/^Kepulauan /, "Kep. ")));
  return `${all ? "Kep. " : ""}${names.slice(0, -1).join(", ")} dan ${names[names.length - 1]}`;
}

// The overview's facts below the map (legend, question, swipe hint, source), measured:
// the stacked map gets the rest, so the box text is sized for that map.
const OVERVIEW_INFO_H = 260;

/** The overview map: the mainland as large as the card allows and, when a
 * province has far islands (geo.insets), each kabupaten's far parts in a
 * labelled box (insetMap.composeMap). */
function overviewMap(feats: Feature[], kabs: Map<string, string> | null, several: boolean, area?: { w: number; h: number }): Composed {
  const found = kabs ? insets(feats, { cluster: several }) : null;
  // A box needs its kabupaten's name from this province's own list (Raja Ampat's
  // shapes still sit in Papua Barat's file); without one, no boxes at all.
  const split = found && found.groups.every((g) => g.members.every((m) => kabs!.has(m.kab))) ? found : null;
  const composed =
    split && composeMap(split, (g) => boxTitle(g.members.map((m) => ({ name: kabs!.get(m.kab)!, whole: m.whole }))), area, OVERVIEW_INFO_H);
  return composed ?? plainMap(feats);
}

function OverviewBody({ data, geo, scope, asc, kabs }: { data: CarouselPackResult; geo: Geo; scope: string; asc: boolean; kabs: Map<string, string> | null }) {
  const { map, pack } = data;
  const byGeo = useMemo(() => new Map(map.values.map((v) => [v.geo, v])), [map.values]);
  // The stacked map's real box on the card (the facts below vary in height), so box
  // text comes out at INSET_FONT px; measured before paint, the estimate until then.
  const holder = useRef<HTMLDivElement>(null);
  const [area, setArea] = useState<{ w: number; h: number } | undefined>(undefined);
  useLayoutEffect(() => {
    const el = holder.current;
    if (el && el.offsetWidth && el.offsetHeight && (area?.w !== el.offsetWidth || area?.h !== el.offsetHeight))
      setArea({ w: el.offsetWidth, h: el.offsetHeight });
  });
  const { main, ox, oy, vw, vh, boxes, unit, dropped } = useMemo(
    () => overviewMap(selectFeatures(geo, map.level, scope, null), kabs, provsOf(scope).length > 1, area),
    [geo, map.level, scope, kabs, area],
  );
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
          {!!dropped?.length && (
            <p className="mt-4 text-[22px] text-coal-muted">
              {`Tidak tergambar (pulau kecil terpencil): ${dropped.map((id) => byGeo.get(id)?.label ?? id).join(", ")}.`}
            </p>
          )}
          <Footer source={pack.source} />
        </>
      }
      map={
        // Stretched to the map slot, the svg laid over it: the slot's size, not the svg's, is what's measured.
        <div ref={holder} className="relative min-h-0 min-w-0 flex-1 self-stretch">
        <svg viewBox={`0 0 ${vw.toFixed(0)} ${vh.toFixed(0)}`} preserveAspectRatio="xMidYMid meet" className="absolute inset-0 h-full w-full">
          <g transform={`translate(${ox} ${oy})`}>
            {main.paths.map((p) => (
              <path key={p.id} d={p.d} fill={fill(p.id)} stroke="var(--nm-bg)" strokeWidth={0.6} vectorEffect="non-scaling-stroke" />
            ))}
          </g>
          <InsetBoxes boxes={boxes} unit={unit} fill={fill} />
        </svg>
        </div>
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
  layers: Layer[];
  onImage: () => void;
  onImageError: (src: string) => void;
}) {
  const { map, pack } = data;
  const v = map.values.find((x) => x.geo === focus) as CarouselMapValue;
  const { paths, edge, view, fit, to } = useMemo(() => {
    const feats = selectFeatures(geo, map.level, "", focus);
    const fit = framing(feats);
    const frame = peta ? peta.bounds : fit.frame;
    const own = outline?.features.filter((f) => f.properties.domain_id === focus) ?? [];
    const { paths, vw, vh } = project(feats, frame);
    const view = peta && fit.cropped ? cropBox(fit.frame, peta.bounds) : { x: 0, y: 0, w: vw, h: vh };
    return { paths, edge: own.length ? project(own, frame).paths : [], view, fit, to: projector(frame) };
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
      : /ESA WorldCover/.test(pack.source)
        ? "" // a land cover ranking: its source line already credits WorldCover
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
          {layers.map(({ src, bounds, multiply }) => {
            // Each image stretched over its own lon/lat box (a province: one per kabupaten).
            const [x0, y0] = to([bounds.west, bounds.north]);
            const [x1, y1] = to([bounds.east, bounds.south]);
            return (
              <image
                key={src}
                href={src}
                x={x0}
                y={y0}
                width={x1 - x0}
                height={y1 - y0}
                preserveAspectRatio="none"
                style={{ mixBlendMode: multiply ? "multiply" : "normal", imageRendering: bg === "terrain" ? "auto" : "pixelated" }}
                onLoad={() => done(src)}
                onError={() => onImageError(src)}
              />
            );
          })}
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
function TopBody({
  data, asc, start = 1, emblems, countdown = 5,
}: { data: CarouselPackResult; asc: boolean; start?: number; emblems: Map<string, string>; countdown?: number }) {
  const { map, pack } = data;
  // Regions without a map code (map.unmatched) are left out here as on the maps;
  // the guardrails above already refuse packs where that would matter.
  const ranked = [...map.values].sort((a, b) => (asc ? a.rank_asc - b.rank_asc : a.rank - b.rank) || a.code.localeCompare(b.code));
  const rows = ranked.slice(start - 1, start - 1 + TOP_N);
  const upto = ranked.slice(0, start - 1 + TOP_N);
  // The regions the deck counted down to (5, or 10 with countdown=10).
  // `ranked` is in the deck's order (value, then code), so its first rows are the ones counted down.
  const featured = new Set(ranked.slice(0, countdown).map((r) => r.code));
  const max = Math.max(...upto.map((r) => Math.abs(r.value)), 1e-9);
  const partial = partialNote(data);
  const word = asc ? "terendah" : "tertinggi";
  // The emblem column shows when any row has one; a row without keeps an empty slot.
  const withEmblems = rows.some((r) => emblems.has(r.geo.slice(0, 4)));

  return (
    <TextBody>
      <CardHeader kicker={map.kicker} title={start === 1 ? `${rows.length} ${word}` : `#${start}–${start + rows.length - 1} ${word}`}>
        <div className="mt-2 text-[30px] leading-snug text-coal-muted">{`${map.title} · ${scopeLabel(data)} · ${map.period_label}`}</div>
      </CardHeader>
      {/* Ten rows fill the slide: sized for a phone at arm's length. Each row:
          rank | kabupaten emblem | kecamatan over its kabupaten, a thin bar under | value. */}
      <ol className="mt-6 flex min-h-0 flex-1 flex-col justify-start gap-[10px]">
        {rows.map((r) => {
          const place = asc ? r.rank_asc : r.rank;
          const emblem = emblems.get(r.geo.slice(0, 4));
          return (
            <li key={r.code} className="flex items-center gap-4">
              <span className="w-[64px] shrink-0 font-mono text-[28px] text-ink-gold">#{place}</span>
              {withEmblems && (
                <span className="flex h-[64px] w-[56px] shrink-0 items-center justify-center">
                  {emblem && <img src={emblem} alt="" className="max-h-full max-w-full object-contain" />}
                </span>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-3">
                  <span className="min-w-0 flex-1 truncate text-[34px] font-semibold leading-tight">{r.name ?? r.label}</span>
                  <span className="whitespace-nowrap text-[34px] font-extrabold leading-tight tabular-nums">{r.display}</span>
                </div>
                {r.parent && <div className="truncate text-[23px] leading-tight text-coal-muted">{r.parent}</div>}
                <div className="mt-[6px] h-[6px] rounded-full bg-white/5">
                  <div
                    className="h-[6px] rounded-full"
                    style={{ width: `${Math.max(1, (Math.abs(r.value) / max) * 100)}%`, background: featured.has(r.code) ? "var(--nm-ink)" : "var(--nm-bar)" }}
                  />
                </div>
              </div>
            </li>
          );
        })}
      </ol>
      <div className="mt-6 shrink-0">
        {partial && <p className="mb-4 text-[22px] text-coal-muted">{partial}</p>}
        <Footer source={pack.source} />
      </div>
    </TextBody>
  );
}
