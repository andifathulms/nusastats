"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { carouselApi, type CarouselMapValue, type CarouselPackResult } from "@/lib/api";
import { loadPeta, petaAsset, type Peta } from "@/lib/peta";
import { NO_DATA, RAMP, cropBox, frameOf, framing, project, rampColor, type Feature, type Geo } from "./geo";
import { CONTENT_W, CornerTag, Footer, H, OffFrameNote, PAD, SAFE, SafeZones, W } from "./ShareCard";

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
 * scope = Kemendagri province code, or 00 for all of Indonesia. Every number is
 * the pack's, already formatted by the backend (`display`), so the card shows
 * exactly what the deck text says. When a Peta layer hasn't been computed for a
 * region, the card draws its silhouette instead and says so in data-card-note.
 */

type Bg = "terrain" | "landcover" | "none";

// A focused region without its Peta layer: one fixed sea fill. Its value is in
// the big number, and a ramp colour without a legend would only hide the lowest
// values against the coal surface.
const SILHOUETTE = "#3F73CC";
// The TikTok account these carousels are posted on.
const BRAND = "Nusantara Mapper";
const TOP_N = 10;
const PACK_KEYS = ["source", "metric", "level", "period", "prov", "turvar", "th", "unit", "label_metric", "notes",
  "top", "bottom", "allow_partial"];
const LEVEL_NOUN = { provinsi: "provinsi", kabupaten: "kabupaten/kota", kecamatan: "kecamatan" } as const;

function geometryUrl(level: string, scope: string, focus: string | null): string {
  const g = focus ?? "";
  if (g.length === 2 || (!focus && level === "provinsi")) return "/dukcapil-provinces.geojson";
  if (focus) return `/dukcapil-districts-${g.slice(0, 2)}.geojson`;
  if (level === "kecamatan") return `/dukcapil-districts-${scope}.geojson`;
  return "/dukcapil-regencies.geojson";
}

function selectFeatures(geo: Geo, level: string, scope: string, focus: string | null): Feature[] {
  if (focus) return geo.features.filter((f) => (focus.length === 2 ? f.properties.domain_id === focus : f.properties.domain_id.startsWith(focus)));
  if (level === "provinsi" || scope === "00") return geo.features;
  return geo.features.filter((f) => f.properties.domain_id.startsWith(scope));
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

export function AngkaCard({ scope, query, debug }: { scope: string; query: URLSearchParams; debug: boolean }) {
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
  const [fatal, setFatal] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(0);
  const [fontsReady, setFontsReady] = useState(false);

  const wantsPeta = !!focus && focus.length >= 4 && bg !== "none";

  useEffect(() => {
    carouselApi.pack(packQuery).then(setData).catch((e) => setFatal(String(e.message ?? e)));
    document.fonts.ready.then(() => setFontsReady(true));
  }, [packQuery]);

  useEffect(() => {
    if (!data) return;
    const url = geometryUrl(data.map.level, scope, focus);
    fetch(url)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`batas wilayah ${url} -> ${r.status}`))))
      .then(setGeo)
      .catch((e) => setFatal(String(e.message ?? e)));
    if (wantsPeta) loadPeta(focus!).then(setPeta).catch(() => setPeta(null));
    else setPeta(null);
    if (focus?.length === 4)
      fetch("/dukcapil-regencies.geojson")
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`batas kabupaten -> ${r.status}`))))
        .then(setOutline)
        .catch((e) => setFatal(String(e.message ?? e)));
    else setOutline(null);
  }, [data, scope, focus, wantsPeta]);

  const issues = data ? problems(data, focus) : [];
  const error = fatal ?? (issues.length ? issues.join("; ") : null);

  // The Peta layer behind a focused region, when it exists on this machine.
  const layers =
    peta && wantsPeta
      ? bg === "terrain" && peta.present.elevation && peta.present.hillshade
        ? [petaAsset(focus!, peta.bounds.layers.elevation!), petaAsset(focus!, peta.bounds.layers.hillshade!)]
        : bg === "landcover" && peta.present.landcover
          ? [petaAsset(focus!, peta.bounds.layers.landcover!)]
          : []
      : [];
  const note = wantsPeta && peta !== undefined && !layers.length ? `lapisan ${bg} belum ada untuk ${focus}; siluet` : undefined;
  const ready =
    !error && !!data && !!geo && peta !== undefined && outline !== undefined && fontsReady && loaded === layers.length;

  return (
    <div
      id="card"
      data-card-ready={ready ? "1" : undefined}
      data-card-error={error ?? undefined}
      data-card-note={note}
      className="relative overflow-hidden bg-coal-bg font-sans text-coal-text"
      style={{ width: W, height: H }}
    >
      {error ? (
        <div className="p-16 text-[28px] text-coal-text">Kartu tidak dibuat: {error}</div>
      ) : data && geo && peta !== undefined && outline !== undefined ? (
        view === "top10" ? (
          <TopBody data={data} asc={asc} />
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
          <OverviewBody data={data} geo={geo} scope={scope} asc={asc} />
        )
      ) : null}
      <CornerTag label={BRAND} />
      {debug && <SafeZones />}
    </div>
  );
}

function Column({ children }: { children: React.ReactNode }) {
  const top = SAFE.top + 100; // below the corner tag
  // Fixed-height column ending where the bottom UI zone starts; the map takes the rest.
  return (
    <div className="absolute flex flex-col" style={{ left: PAD, top, width: CONTENT_W, height: H - SAFE.bottom - top }}>
      {children}
    </div>
  );
}

function Header({ eyebrow, title, sub }: { eyebrow: string; title: string; sub?: string }) {
  const size = title.length > 34 ? 52 : title.length > 26 ? 60 : title.length > 18 ? 72 : 84;
  return (
    <>
      <div className="font-mono text-[24px] uppercase tracking-[0.14em] text-ink-gold">{eyebrow}</div>
      <h1 className="mt-3 font-display font-medium leading-[1.02] tracking-[-0.02em]" style={{ fontSize: size }}>
        {title}
      </h1>
      {sub && <div className="mt-2 text-[32px] text-coal-muted">{sub}</div>}
    </>
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

function OverviewBody({ data, geo, scope, asc }: { data: CarouselPackResult; geo: Geo; scope: string; asc: boolean }) {
  const { map, pack } = data;
  const byGeo = useMemo(() => new Map(map.values.map((v) => [v.geo, v])), [map.values]);
  const { paths, vw, vh } = useMemo(() => {
    const feats = selectFeatures(geo, map.level, scope, null);
    return project(feats, frameOf(feats));
  }, [geo, map.level, scope]);
  const span = map.max - map.min || 1;
  // The three the deck counts down to: highest, or lowest for a `terendah` deck (order=asc).
  const top3 = [...map.values].sort((a, b) => (asc ? a.rank_asc - b.rank_asc : a.rank - b.rank) || a.code.localeCompare(b.code)).slice(0, 3);
  const lowest = map.values.reduce((a, b) => (b.value < a.value ? b : a));
  const highest = map.values.reduce((a, b) => (b.value > a.value ? b : a));
  const partial = partialNote(data);

  return (
    <Column>
      <Header eyebrow={map.kicker} title={map.title} sub={`${scopeLabel(data)} · ${map.period_label}`} />
      <div className="mt-6 flex min-h-0 flex-1 items-center justify-center">
        <svg viewBox={`0 0 ${vw.toFixed(0)} ${vh.toFixed(0)}`} preserveAspectRatio="xMidYMid meet" className="h-full w-full">
          {paths.map((p) => {
            const v = byGeo.get(p.id);
            return (
              <path
                key={p.id}
                d={p.d}
                fill={v ? rampColor((v.value - map.min) / span) : NO_DATA}
                stroke="#0E1626"
                strokeWidth={0.6}
                vectorEffect="non-scaling-stroke"
              />
            );
          })}
        </svg>
      </div>
      <div className="mt-6 shrink-0">
        <div className="flex items-center gap-4 font-mono text-[20px] text-coal-muted">
          <span className="whitespace-nowrap">{lowest.display}</span>
          <div className="h-3 min-w-0 flex-1 rounded-full" style={{ background: `linear-gradient(90deg, ${RAMP.join(", ")})` }} />
          <span className="whitespace-nowrap">{highest.display}</span>
        </div>
        <div className="mt-6 font-mono text-[20px] uppercase tracking-[0.12em] text-coal-muted">{asc ? "Terendah" : "Tertinggi"}</div>
        <ol className="mt-3 space-y-3">
          {top3.map((v) => (
            <li key={v.geo} className="flex items-baseline gap-4">
              <span className="w-12 shrink-0 font-mono text-[28px] text-ink-gold">#{asc ? v.rank_asc : v.rank}</span>
              <span className="min-w-0 flex-1 truncate text-[34px] font-semibold">{v.label}</span>
              <span className="whitespace-nowrap text-[34px] font-extrabold tabular-nums">{v.display}</span>
            </li>
          ))}
        </ol>
        {partial && <p className="mt-4 text-[20px] text-coal-muted">{partial}</p>}
        <Footer source={pack.source} />
      </div>
    </Column>
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
  layers: string[];
  onImage: () => void;
  onImageError: (src: string) => void;
}) {
  const { map, pack } = data;
  const v = map.values.find((x) => x.geo === focus) as CarouselMapValue;
  const { paths, edge, view, fit } = useMemo(() => {
    const feats = selectFeatures(geo, map.level, "", focus);
    const fit = framing(feats);
    const frame = peta ? peta.bounds : fit.frame;
    const own = outline?.features.filter((f) => f.properties.domain_id === focus) ?? [];
    const { paths, vw, vh } = project(feats, frame);
    const view = peta && fit.cropped ? cropBox(fit.frame, peta.bounds) : { x: 0, y: 0, w: vw, h: vh };
    return { paths, edge: own.length ? project(own, frame).paths : [], view, fit };
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
      : `; peta: ESA WorldCover ${peta.landcover?.year ?? ""} v200 (CC BY 4.0)`;
  const partial = partialNote(data);

  return (
    <Column>
      <div className="flex items-center gap-4">
        <span className="rounded-full bg-kunyit-light px-5 py-1 font-mono text-[34px] font-bold text-laut-950">#{place}</span>
        <span className="font-mono text-[22px] uppercase tracking-[0.12em] text-coal-muted">
          {word} dari {map.n.toLocaleString("id-ID")} {scopeLabel(data)}
        </span>
      </div>
      <div className="mt-6">
        <Header eyebrow={map.kicker} title={v.label} />
      </div>
      <div className="mt-6 flex min-h-0 flex-1 items-center justify-center">
        <svg viewBox={`${view.x.toFixed(1)} ${view.y.toFixed(1)} ${vw.toFixed(1)} ${vh.toFixed(1)}`} preserveAspectRatio="xMidYMid meet" className="h-full w-full">
          {layers.map((src, i) => (
            <image
              key={src}
              href={src}
              x={0}
              y={0}
              width={vw}
              height={vh}
              preserveAspectRatio="none"
              style={{ mixBlendMode: i === 1 ? "multiply" : "normal", imageRendering: bg === "terrain" ? "auto" : "pixelated" }}
              onLoad={() => done(src)}
              onError={() => onImageError(src)}
            />
          ))}
          {/* Kecamatan as faint hairlines (or none on a silhouette), so the
              kabupaten's own outline and its terrain carry the map. */}
          {paths.map((p) => (
            <path
              key={p.id}
              d={p.d}
              fill={peta ? "none" : SILHOUETTE}
              stroke={edge.length ? "rgba(243,236,221,0.22)" : "rgba(243,236,221,0.85)"}
              strokeWidth={edge.length ? 0.6 : 1.6}
              strokeOpacity={peta || !edge.length ? 1 : 0.5}
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {edge.map((p) => (
            <path key={`edge-${p.id}`} d={p.d} fill="none" stroke="#F3ECDD" strokeWidth={2.6} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          ))}
        </svg>
      </div>
      <OffFrameNote items={fit.offFrame} />
      {peta && <LayerLegend peta={peta} bg={bg} />}
      <div className="mt-6 shrink-0">
        <div className="text-[96px] font-extrabold leading-none tracking-[-0.02em] tabular-nums">
          {v.display}
        </div>
        <div className="mt-3 text-[26px] text-coal-muted">
          {map.title}, {map.period_label}
        </div>
        {partial && <p className="mt-4 text-[20px] text-coal-muted">{partial}</p>}
        <Footer source={pack.source + layerSource} />
      </div>
    </Column>
  );
}

/** What the Peta layer's colours mean, so the map reads on its own (as on the Peta cards). */
function LayerLegend({ peta, bg }: { peta: Peta; bg: Bg }) {
  if (bg === "landcover" && peta.landcover) {
    const shown = peta.landcover.classes.filter((c) => c.share_pct >= 1).slice(0, 5);
    return (
      <ul className="mt-4 flex shrink-0 flex-wrap gap-x-6 gap-y-2 text-[22px] text-coal-muted">
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
      <div className="mt-4 flex shrink-0 items-center gap-4 font-mono text-[20px] text-coal-muted">
        <span>0</span>
        <div className="h-3 min-w-0 flex-1 rounded-full" style={{ background: `linear-gradient(90deg, ${gradient})` }} />
        <span className="whitespace-nowrap">{top.toLocaleString("id-ID")} m</span>
      </div>
    );
  }
  return null;
}

/** The tally after the countdown: the top (or bottom, order=asc) 10 as bars from
 * zero. The regions the deck counted down to are drawn in cream, the rest in sea. */
function TopBody({ data, asc }: { data: CarouselPackResult; asc: boolean }) {
  const { map, pack } = data;
  // Regions without a map code (map.unmatched) are left out here as on the maps;
  // the guardrails above already refuse packs where that would matter.
  const rows = [...map.values]
    .sort((a, b) => (asc ? a.rank_asc - b.rank_asc : a.rank - b.rank) || a.code.localeCompare(b.code))
    .slice(0, TOP_N);
  const featured = new Set(pack.rows.slice(0, 5).map((r) => r.code));
  if (asc) {
    featured.clear();
    pack.rows.slice(-5).forEach((r) => featured.add(r.code));
  }
  const max = Math.max(...rows.map((r) => Math.abs(r.value)), 1e-9);
  const partial = partialNote(data);
  const word = asc ? "terendah" : "tertinggi";

  return (
    <Column>
      <Header eyebrow={map.kicker} title={`${rows.length} ${word}`} sub={`${map.title} · ${scopeLabel(data)} · ${map.period_label}`} />
      <ol className="mt-10 flex min-h-0 flex-1 flex-col justify-center gap-5">
        {rows.map((r) => {
          const place = asc ? r.rank_asc : r.rank;
          return (
            <li key={r.code}>
              <div className="flex items-baseline gap-3">
                <span className="w-12 shrink-0 font-mono text-[24px] text-ink-gold">#{place}</span>
                <span className="min-w-0 flex-1 truncate text-[28px] font-semibold">{r.label}</span>
                <span className="whitespace-nowrap text-[28px] font-extrabold tabular-nums">{r.display}</span>
              </div>
              <div className="ml-[60px] mt-2 h-4 rounded-full bg-white/5">
                <div
                  className="h-4 rounded-full"
                  style={{ width: `${Math.max(1, (Math.abs(r.value) / max) * 100)}%`, background: featured.has(r.code) ? "#F3ECDD" : "#4F82DC" }}
                />
              </div>
            </li>
          );
        })}
      </ol>
      <div className="mt-8 shrink-0">
        {partial && <p className="mb-4 text-[20px] text-coal-muted">{partial}</p>}
        <Footer source={pack.source} />
      </div>
    </Column>
  );
}
