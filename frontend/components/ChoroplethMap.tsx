"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CHART, titleCase } from "@/lib/api";

type Feature = {
  properties: { domain_id: string; name: string };
  geometry: { type: "Polygon" | "MultiPolygon"; coordinates: number[][][] | number[][][][] };
};
type FC = { features: Feature[] };

export type MapValue = { value: number; name: string; sub?: string };

// Sequential low->high scale — single-hue royal blue ramp.
const STOPS = ["#EAF0FD", "#B7CBF3", "#7CA0E8", "#3F6FD6", "#14264F"];
const NO_DATA_FILL = "#EEF2FB";

function lerpHex(a: string, b: string, t: number): string {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  const p = pa.map((v, i) => Math.round(v + (pb[i] - v) * t));
  return `#${p.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}
function scale(t: number): string {
  const x = Math.max(0, Math.min(1, t)) * (STOPS.length - 1);
  const i = Math.min(STOPS.length - 2, Math.floor(x));
  return lerpHex(STOPS[i], STOPS[i + 1], x - i);
}

export function ChoroplethMap({
  values,
  min,
  max,
  unit,
  geojsonUrls = ["/indonesia-provinces.geojson"],
  provFilter,
}: {
  values: Map<string, MapValue>;
  min: number;
  max: number;
  unit?: string;
  // One or more geojson files to fetch and merge (villages load one per
  // selected province).
  geojsonUrls?: string[];
  // 2-digit province codes; when set, only regions in those provinces render
  // (and the map zooms to them). Region codes are hierarchical, so a province
  // code is a prefix of its regencies'/districts' codes.
  provFilter?: string[];
}) {
  const [fc, setFc] = useState<FC | null>(null);
  const [hover, setHover] = useState<{ id: string; x: number; y: number } | null>(null);

  const urlKey = geojsonUrls.join(",");
  useEffect(() => {
    setFc(null);
    if (!geojsonUrls.length) return;
    let cancelled = false;
    Promise.all(geojsonUrls.map((u) => fetch(u).then((r) => r.json())))
      .then((fcs) => {
        if (!cancelled) setFc({ features: fcs.flatMap((f: FC) => f.features) });
      })
      .catch(() => !cancelled && setFc(null));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlKey]);

  const filterKey = provFilter?.join(",") ?? "";
  const { paths, vb } = useMemo(() => {
    if (!fc) return { paths: [] as { id: string; d: string }[], vb: "0 0 1000 400" };
    const active = filterKey
      ? fc.features.filter((f) => filterKey.split(",").some((p) => f.properties.domain_id.startsWith(p)))
      : fc.features;
    if (!active.length) return { paths: [], vb: "0 0 1000 400" };

    let lonMin = 180, lonMax = -180, latMin = 90, latMax = -90;
    const eachRing = (f: Feature, cb: (ring: number[][]) => void) => {
      const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
      (polys as number[][][][]).forEach((poly) => poly.forEach((ring) => cb(ring as number[][])));
    };
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
    return { paths, vb: `0 0 ${W.toFixed(0)} ${H.toFixed(0)}` };
  }, [fc, filterKey]);

  const nameById = useMemo(() => {
    const m = new Map<string, string>();
    fc?.features.forEach((f) => m.set(f.properties.domain_id, titleCase(f.properties.name)));
    return m;
  }, [fc]);

  // --- pan / zoom / fullscreen -------------------------------------------
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);
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
    setHover(null);
  };
  const onMove = (e: React.MouseEvent) => {
    if (!drag.current) return;
    const p0 = toSvg(drag.current.x, drag.current.y);
    const p1 = toSvg(e.clientX, e.clientY);
    setT((cur) => ({ ...cur, x: cur.x + (p1.x - p0.x), y: cur.y + (p1.y - p0.y) }));
    drag.current = { x: e.clientX, y: e.clientY };
  };
  const onUp = () => (drag.current = null);
  const toggleFull = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else wrapRef.current?.requestFullscreen();
  };

  if (!fc) return <div className="flex h-80 items-center justify-center text-sm text-ink-muted">Memuat peta…</div>;
  const span = max - min || 1;
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
        >
          <g transform={`translate(${t.x} ${t.y}) scale(${t.k})`}>
            {paths.map((p) => {
              const v = values.get(p.id);
              const fill = v ? scale((v.value - min) / span) : NO_DATA_FILL;
              const isHover = hover?.id === p.id;
              return (
                <path
                  key={p.id}
                  d={p.d}
                  fill={fill}
                  stroke={isHover ? CHART.text : "#FFFFFF"}
                  strokeWidth={isHover ? 1.5 : 0.5}
                  vectorEffect="non-scaling-stroke"
                  onMouseEnter={(e) => !drag.current && setHover({ id: p.id, x: e.clientX, y: e.clientY })}
                  onMouseMove={(e) => !drag.current && setHover({ id: p.id, x: e.clientX, y: e.clientY })}
                  onMouseLeave={() => setHover(null)}
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
      <div className="mt-3 flex items-center gap-3 text-xs text-ink-muted">
        <span className="tabular-nums">{min.toLocaleString()}</span>
        <div
          className="h-2 w-40 rounded-full"
          style={{ background: `linear-gradient(90deg, ${STOPS.join(",")})` }}
        />
        <span className="tabular-nums">
          {max.toLocaleString()} {unit}
        </span>
        <span className="ml-3 inline-flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-sm" style={{ background: NO_DATA_FILL }} /> tanpa data
        </span>
      </div>

      {hover && (
        <div
          className="pointer-events-none fixed z-30 rounded-lg border border-ink-border bg-ink-panel px-3 py-2 text-xs shadow-panel"
          style={{ left: hover.x + 12, top: hover.y + 12 }}
        >
          <div className="font-medium text-ink-text">{values.get(hover.id)?.name ?? nameById.get(hover.id)}</div>
          {values.get(hover.id)?.sub && (
            <div className="mt-0.5 text-ink-muted">{values.get(hover.id)!.sub}</div>
          )}
          <div className="mt-1 tabular-nums text-ink-text">
            {values.has(hover.id) ? `${values.get(hover.id)!.value.toLocaleString()} ${unit ?? ""}` : "tanpa data"}
          </div>
        </div>
      )}
    </div>
  );
}
