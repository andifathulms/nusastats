"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CHART, titleCase } from "@/lib/api";
import { useIsDark } from "@/lib/theme";

type Feature = {
  properties: { domain_id: string; name: string };
  geometry: { type: "Polygon" | "MultiPolygon"; coordinates: number[][][] | number[][][][] };
};
type FC = { features: Feature[] };

export type MapValue = { value: number; name: string; sub?: string; extra?: string };

// A georeferenced image drawn under the outlines (e.g. Peta Wilayah's
// hillshade / land cover). It must be a regular lon/lat (EPSG:4326) raster:
// this map projects linearly in lon/lat, so stretching the image over the
// projected `frame` box lines it up with the outlines exactly.
export type MapLayer = { href: string; blend?: "normal" | "multiply"; opacity?: number; pixelated?: boolean };
export type MapFrame = { west: number; south: number; east: number; north: number };

// Sequential low->high scale: pale sea → deep sea. On the dark theme it
// runs the other way (dark sea → cream) so high values still read as "bright".
const STOPS_LIGHT = ["#E3EBFA", "#B5C9EE", "#6B96E6", "#2557BE", "#10264D"];
const STOPS_DARK = ["#1A2E55", "#2B57A3", "#4F82DC", "#A3BEF0", "#F3ECDD"];
// "No data" is a NEUTRAL gray, deliberately off the blue ramp: a blue-tinted
// fill here is unreadable against the ramp's lightest step and would let a gap
// pass as "lowest value" — the one thing this project must never do.
const NO_DATA_LIGHT = "#D6D3CA";
const NO_DATA_DARK = "#2E3442";

function lerpHex(a: string, b: string, t: number): string {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  const p = pa.map((v, i) => Math.round(v + (pb[i] - v) * t));
  return `#${p.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}
function scale(t: number, dark = false): string {
  const STOPS = dark ? STOPS_DARK : STOPS_LIGHT;
  const x = Math.max(0, Math.min(1, t)) * (STOPS.length - 1);
  const i = Math.min(STOPS.length - 2, Math.floor(x));
  return lerpHex(STOPS[i], STOPS[i + 1], x - i);
}

export function ChoroplethMap({
  values,
  min,
  max,
  unit,
  format,
  geojsonUrls = ["/indonesia-provinces.geojson"],
  provFilter,
  frame,
  layers = [],
  outlineOnly = false,
  outlineFill = "transparent",
  onSelect,
  selectHint,
  highlight,
  onHover,
  hideLegend = false,
  ariaLabel,
}: {
  values: Map<string, MapValue>;
  min: number;
  max: number;
  unit?: string;
  // Renders legend bounds and tooltip values. Defaults to a plain thousands
  // separator; pass one for scales that need it (e.g. compact rupiah), where
  // the raw digits would be unreadable.
  format?: (v: number) => string;
  // One or more geojson files to fetch and merge (villages load one per
  // selected province).
  geojsonUrls?: string[];
  // 2-digit province codes; when set, only regions in those provinces render
  // (and the map zooms to them). Region codes are hierarchical, so a province
  // code is a prefix of its regencies'/districts' codes.
  provFilter?: string[];
  // Fixed projection frame (lon/lat box). Required when `layers` are drawn:
  // the image and the outlines must share one projection. Defaults to the
  // bbox of the rendered features.
  frame?: MapFrame;
  // Images drawn under the outlines, in order, stretched over `frame`.
  layers?: MapLayer[];
  // Outlines only: no choropleth fill (so layers show through), no value legend.
  outlineOnly?: boolean;
  outlineFill?: string;
  // Click / Enter on a region. Regions become focusable links.
  onSelect?: (id: string) => void;
  selectHint?: string;
  // Linked list hover (Map + list pattern).
  highlight?: string | null;
  onHover?: (id: string | null) => void;
  hideLegend?: boolean;
  ariaLabel?: string;
}) {
  const [fc, setFc] = useState<FC | null>(null);
  const [failed, setFailed] = useState(false);
  const [hover, setHover] = useState<{ id: string; x: number; y: number } | null>(null);
  const dark = useIsDark();
  const NO_DATA_FILL = dark ? NO_DATA_DARK : NO_DATA_LIGHT;

  const urlKey = geojsonUrls.join(",");
  useEffect(() => {
    setFc(null);
    setFailed(false);
    if (!geojsonUrls.length) return;
    let cancelled = false;
    Promise.all(
      geojsonUrls.map((u) =>
        fetch(u).then((r) => {
          if (!r.ok) throw new Error(`${u} -> ${r.status}`);
          return r.json();
        })
      )
    )
      .then((fcs) => {
        if (!cancelled) setFc({ features: fcs.flatMap((f: FC) => f.features) });
      })
      // Without this the map sits on "Memuat peta…" forever and reads as a slow
      // load rather than a failure.
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlKey]);

  const filterKey = provFilter?.join(",") ?? "";
  const frameKey = frame ? `${frame.west},${frame.south},${frame.east},${frame.north}` : "";
  const { paths, vb, W, H } = useMemo(() => {
    if (!fc) return { paths: [] as { id: string; d: string }[], vb: "0 0 1000 400", W: 1000, H: 400 };
    const active = filterKey
      ? fc.features.filter((f) => filterKey.split(",").some((p) => f.properties.domain_id.startsWith(p)))
      : fc.features;
    if (!active.length) return { paths: [], vb: "0 0 1000 400", W: 1000, H: 400 };

    let lonMin = 180, lonMax = -180, latMin = 90, latMax = -90;
    const eachRing = (f: Feature, cb: (ring: number[][]) => void) => {
      const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
      (polys as number[][][][]).forEach((poly) => poly.forEach((ring) => cb(ring as number[][])));
    };
    if (frameKey) {
      [lonMin, latMin, lonMax, latMax] = frameKey.split(",").map(Number);
    } else {
      active.forEach((f) =>
        eachRing(f, (ring) =>
          ring.forEach(([lon, lat]) => {
            lonMin = Math.min(lonMin, lon);
            lonMax = Math.max(lonMax, lon);
            latMin = Math.min(latMin, lat);
            latMax = Math.max(latMax, lat);
          })
        )
      );
    }
    const W = 1000;
    const cosMid = Math.cos((((latMin + latMax) / 2) * Math.PI) / 180);
    const s = W / ((lonMax - lonMin) * cosMid);
    const H = (latMax - latMin) * s;
    const px = (lon: number) => (lon - lonMin) * s * cosMid;
    const py = (lat: number) => (latMax - lat) * s;

    const paths = active.map((f) => {
      let d = "";
      eachRing(f, (ring) => {
        d += ring.map(([lon, lat], i) => `${i === 0 ? "M" : "L"}${px(lon).toFixed(1)} ${py(lat).toFixed(1)}`).join("") + "Z";
      });
      return { id: f.properties.domain_id, d };
    });
    return { paths, vb: `0 0 ${W.toFixed(0)} ${H.toFixed(0)}`, W, H };
  }, [fc, filterKey, frameKey]);

  const nameById = useMemo(() => {
    const m = new Map<string, string>();
    fc?.features.forEach((f) => m.set(f.properties.domain_id, titleCase(f.properties.name)));
    return m;
  }, [fc]);

  // --- pan / zoom / fullscreen -------------------------------------------
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);
  // A drag that moved is a pan, not a click on the region under the cursor.
  const moved = useRef(false);
  const [t, setT] = useState({ k: 1, x: 0, y: 0 });
  const [isFull, setIsFull] = useState(false);

  // Reset the view when the map (geojson / filter) changes.
  useEffect(() => setT({ k: 1, x: 0, y: 0 }), [urlKey, filterKey]);

  useEffect(() => {
    const on = () => setIsFull(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", on);
    return () => document.removeEventListener("fullscreenchange", on);
  }, []);

  const toSvg = useCallback((cx: number, cy: number) => {
    const svg = svgRef.current!;
    const p = svg.createSVGPoint();
    p.x = cx;
    p.y = cy;
    return p.matrixTransform(svg.getScreenCTM()!.inverse());
  }, []);

  const zoomAt = useCallback(
    (cx: number, cy: number, factor: number) => {
      setT((cur) => {
        const k = Math.min(80, Math.max(1, cur.k * factor));
        const s = toSvg(cx, cy);
        const dataX = (s.x - cur.x) / cur.k;
        const dataY = (s.y - cur.y) / cur.k;
        return { k, x: s.x - k * dataX, y: s.y - k * dataY };
      });
    },
    [toSvg]
  );

  // Native (non-passive) wheel so we can preventDefault the page scroll.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const h = (e: WheelEvent) => {
      e.preventDefault();
      zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.15 : 1 / 1.15);
    };
    svg.addEventListener("wheel", h, { passive: false });
    return () => svg.removeEventListener("wheel", h);
  }, [zoomAt]);

  const zoomBtn = (factor: number) => {
    const r = svgRef.current?.getBoundingClientRect();
    if (r) zoomAt(r.left + r.width / 2, r.top + r.height / 2, factor);
  };
  const onDown = (e: React.MouseEvent) => {
    drag.current = { x: e.clientX, y: e.clientY };
    moved.current = false;
    setHover(null);
  };
  const onMove = (e: React.MouseEvent) => {
    if (!drag.current) return;
    const p0 = toSvg(drag.current.x, drag.current.y);
    const p1 = toSvg(e.clientX, e.clientY);
    if (Math.abs(e.clientX - drag.current.x) + Math.abs(e.clientY - drag.current.y) > 2) moved.current = true;
    setT((cur) => ({ ...cur, x: cur.x + (p1.x - p0.x), y: cur.y + (p1.y - p0.y) }));
    drag.current = { x: e.clientX, y: e.clientY };
  };
  const onUp = () => (drag.current = null);
  const toggleFull = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else wrapRef.current?.requestFullscreen();
  };

  if (failed)
    return (
      <div className="flex h-80 items-center justify-center px-6 text-center text-sm text-ink-muted">
        Gagal memuat batas wilayah peta. Muat ulang halaman untuk mencoba lagi.
      </div>
    );
  if (!fc) return <div className="flex h-80 items-center justify-center text-sm text-ink-muted">Memuat peta…</div>;
  const span = max - min || 1;
  const fmt = format ?? ((v: number) => v.toLocaleString());
  const btn =
    "grid h-8 w-8 place-items-center rounded-md border border-ink-border bg-ink-panel text-ink-text shadow-sm hover:border-ink-accent/60";

  return (
    <div ref={wrapRef} className={isFull ? "fixed inset-0 z-50 flex flex-col bg-ink-bg p-4" : "relative"}>
      <div className="relative flex-1">
        <svg
          ref={svgRef}
          viewBox={vb}
          className="w-full touch-none select-none"
          style={{ maxHeight: isFull ? "none" : 520, height: isFull ? "calc(100vh - 6rem)" : undefined, cursor: "grab" }}
          preserveAspectRatio="xMidYMid meet"
          onMouseDown={onDown}
          onMouseMove={onMove}
          onMouseUp={onUp}
          onMouseLeave={onUp}
          role="img"
          aria-label={ariaLabel}
        >
          <g transform={`translate(${t.x} ${t.y}) scale(${t.k})`}>
            {layers.map((l) => (
              <image
                key={l.href}
                href={l.href}
                x={0}
                y={0}
                width={W}
                height={H}
                preserveAspectRatio="none"
                opacity={l.opacity ?? 1}
                pointerEvents="none"
                style={{ mixBlendMode: l.blend ?? "normal", imageRendering: l.pixelated ? "pixelated" : "auto" }}
              />
            ))}
            {paths.map((p) => {
              const v = values.get(p.id);
              const fill = outlineOnly ? outlineFill : v ? scale((v.value - min) / span, dark) : NO_DATA_FILL;
              const isHover = hover?.id === p.id || highlight === p.id;
              const enter = (e: React.MouseEvent) => {
                if (drag.current) return;
                setHover({ id: p.id, x: e.clientX, y: e.clientY });
                onHover?.(p.id);
              };
              return (
                <path
                  key={p.id}
                  d={p.d}
                  fill={fill}
                  stroke={
                    outlineOnly
                      ? isHover ? "rgb(var(--ink-accent2))" : CHART.text
                      : isHover ? CHART.text : "rgb(var(--ink-panel))"
                  }
                  strokeWidth={outlineOnly ? (isHover ? 3 : 1.2) : isHover ? 1.5 : 0.5}
                  vectorEffect="non-scaling-stroke"
                  onMouseEnter={enter}
                  onMouseMove={enter}
                  onMouseLeave={() => {
                    setHover(null);
                    onHover?.(null);
                  }}
                  onClick={onSelect ? () => !moved.current && onSelect(p.id) : undefined}
                  onKeyDown={onSelect ? (e) => e.key === "Enter" && onSelect(p.id) : undefined}
                  tabIndex={onSelect ? 0 : undefined}
                  role={onSelect ? "link" : undefined}
                  aria-label={onSelect ? nameById.get(p.id) : undefined}
                  style={{ cursor: "pointer" }}
                />
              );
            })}
          </g>
        </svg>

        {/* Map controls */}
        <div className="absolute right-2 top-2 flex flex-col gap-1">
          <button onClick={() => zoomBtn(1.5)} title="Perbesar" className={btn}>＋</button>
          <button onClick={() => zoomBtn(1 / 1.5)} title="Perkecil" className={btn}>－</button>
          <button onClick={() => setT({ k: 1, x: 0, y: 0 })} title="Atur ulang" className={btn}>⟲</button>
          <button onClick={toggleFull} title={isFull ? "Keluar layar penuh" : "Layar penuh"} className={btn}>
            {isFull ? "✕" : "⛶"}
          </button>
        </div>
      </div>

      {/* Legend */}
      {/* flex-wrap: without it the legend's min-content width (a 160px ramp plus
          two formatted bounds) sets a floor that pushes its whole panel — and
          the page — wider than a phone viewport. */}
      {!hideLegend && !outlineOnly && (
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-ink-muted">
        <span className="tabular-nums">{fmt(min)}</span>
        <div
          className="h-2 w-40 rounded-full"
          style={{ background: `linear-gradient(90deg, ${(dark ? STOPS_DARK : STOPS_LIGHT).join(",")})` }}
        />
        <span className="tabular-nums">
          {fmt(max)} {unit}
        </span>
        <span className="ml-3 inline-flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-sm" style={{ background: NO_DATA_FILL }} /> tanpa data
        </span>
      </div>
      )}

      {hover && (
        <div
          className="pointer-events-none fixed z-30 rounded-lg border border-ink-border bg-ink-panel px-3 py-2 text-xs shadow-panel"
          style={{ left: hover.x + 12, top: hover.y + 12 }}
        >
          <div className="font-medium text-ink-text">{values.get(hover.id)?.name ?? nameById.get(hover.id)}</div>
          {values.get(hover.id)?.sub && (
            <div className="mt-0.5 text-ink-muted">{values.get(hover.id)!.sub}</div>
          )}
          {outlineOnly ? (
            selectHint && <div className="mt-0.5 text-ink-muted">{selectHint}</div>
          ) : (
            <div className="mt-1 tabular-nums text-ink-text">
              {values.has(hover.id) ? `${fmt(values.get(hover.id)!.value)} ${unit ?? ""}` : "tanpa data"}
            </div>
          )}
          {values.get(hover.id)?.extra && (
            <div className="mt-0.5 tabular-nums text-ink-muted">{values.get(hover.id)!.extra}</div>
          )}
        </div>
      )}
    </div>
  );
}
