#!/usr/bin/env python3
"""Pre-project the Dukcapil province / kab-kota boundaries into compact SVG
path strings for decorative + overview maps (home hero map, Sorotan covers,
region silhouettes). The interactive ChoroplethMap keeps using the full
geojson; these are ~15x smaller and need no client-side projection.

Usage: python3 frontend/scripts/build_outline_paths.py frontend/public
Writes outline-provinces.json and outline-regencies.json:
  {"w": 1000, "h": <int>, "items": [{"c": code, "n": name, "d": "M..Z"}]}
Requires shapely.
"""
import json
import os
import sys

from shapely.geometry import MultiPolygon, shape

# Equirectangular frame around the archipelago (lon 94.6..141.3, lat 6.3..-11.2).
W = 1000
X0, X1, Y0, Y1 = 94.6, 141.3, 6.3, -11.2
SX = W / (X1 - X0)
H = round((Y0 - Y1) * SX)


def proj(lon, lat):
    return (lon - X0) * SX, (Y0 - lat) * SX


def build(src, dst, tolerance, min_area):
    fc = json.load(open(src))
    items = []
    for f in fc["features"]:
        props = f["properties"]
        geom = shape(f["geometry"]).simplify(tolerance, preserve_topology=True)
        polys = geom.geoms if isinstance(geom, MultiPolygon) else [geom]
        # Keep the largest polygon even if it is tiny, so no region vanishes.
        biggest = max(polys, key=lambda p: p.area)
        parts = []
        for p in polys:
            if p is not biggest and p.area < min_area:
                continue
            pts = [proj(*c) for c in p.exterior.coords]
            parts.append("M" + "L".join(f"{x:.1f},{y:.1f}" for x, y in pts) + "Z")
        items.append({"c": str(props["domain_id"]), "n": props.get("name", ""), "d": "".join(parts)})
    json.dump({"w": W, "h": H, "items": items}, open(dst, "w"), separators=(",", ":"))
    print(dst, len(items), os.path.getsize(dst), "bytes")


if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else "frontend/public"
    build(f"{out}/dukcapil-provinces.geojson", f"{out}/outline-provinces.json", 0.035, 0.004)
    build(f"{out}/dukcapil-regencies.geojson", f"{out}/outline-regencies.json", 0.005, 0.0004)
