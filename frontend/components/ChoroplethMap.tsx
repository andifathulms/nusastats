"use client";

import { useEffect, useMemo, useState } from "react";
import { titleCase } from "@/lib/api";

type Feature = {
  properties: { domain_id: string; name: string };
  geometry: { type: "Polygon" | "MultiPolygon"; coordinates: number[][][] | number[][][][] };
};
type FC = { features: Feature[] };

export type MapValue = { value: number; name: string };

// Sequential low->high scale — pale cream deepening to navy, readable on the paper shell.
const STOPS = ["#f3e4c9", "#b9b5a9", "#7f8788", "#445868", "#0a2947"];
const NO_DATA_FILL = "#e7e7dc";

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
  geojsonUrl = "/indonesia-provinces.geojson",
  provFilter,
}: {
  values: Map<string, MapValue>;
  min: number;
  max: number;
  unit?: string;
  geojsonUrl?: string;
  // 2-digit province codes; when set, only regions in those provinces render
  // (and the map zooms to them). Region codes are hierarchical, so a province
  // code is a prefix of its regencies'/districts' codes.
  provFilter?: string[];
}) {
  const [fc, setFc] = useState<FC | null>(null);
  const [hover, setHover] = useState<{ id: string; x: number; y: number } | null>(null);

  useEffect(() => {
    setFc(null);
    fetch(geojsonUrl)
      .then((r) => r.json())
      .then(setFc)
      .catch(() => setFc(null));
  }, [geojsonUrl]);

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

  if (!fc) return <div className="flex h-80 items-center justify-center text-sm text-ink-muted">Loading map…</div>;
  const span = max - min || 1;

  return (
    <div className="relative">
      <svg viewBox={vb} className="w-full" style={{ maxHeight: 520 }} preserveAspectRatio="xMidYMid meet">
        {paths.map((p) => {
          const v = values.get(p.id);
          const fill = v ? scale((v.value - min) / span) : NO_DATA_FILL;
          const isHover = hover?.id === p.id;
          return (
            <path
              key={p.id}
              d={p.d}
              fill={fill}
              stroke={isHover ? "#051220" : "#f3e4c9"}
              strokeWidth={isHover ? 1.5 : 0.5}
              onMouseEnter={(e) => setHover({ id: p.id, x: e.clientX, y: e.clientY })}
              onMouseMove={(e) => setHover({ id: p.id, x: e.clientX, y: e.clientY })}
              onMouseLeave={() => setHover(null)}
              style={{ cursor: "pointer" }}
            />
          );
        })}
      </svg>

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
          <span className="inline-block h-2 w-2 rounded-sm" style={{ background: NO_DATA_FILL }} /> no data
        </span>
      </div>

      {hover && (
        <div
          className="pointer-events-none fixed z-30 rounded-lg border border-ink-border bg-ink-panel px-3 py-1.5 text-xs shadow-xl shadow-black/50"
          style={{ left: hover.x + 12, top: hover.y + 12 }}
        >
          <div className="font-medium text-ink-text">{values.get(hover.id)?.name ?? nameById.get(hover.id)}</div>
          <div className="text-ink-muted">
            {values.has(hover.id) ? `${values.get(hover.id)!.value.toLocaleString()} ${unit ?? ""}` : "no data"}
          </div>
        </div>
      )}
    </div>
  );
}
