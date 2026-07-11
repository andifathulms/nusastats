#!/usr/bin/env python3
"""Compute the true per-desa land area (km²) from the full-res BIG desa polygons
and write a compact {desa_code: km2} map to backend/dukcapil/data/big_area.json,
which the `load_big_area` management command ingests.

Why: Dukcapil's own `luas_wilayah` at desa level is the *kabupaten total* copied
onto every desa (verified nationally), so it's useless per-desa. The BIG 1:10k
polygons give real per-desa geometry; their KDEPUM code == Dukcapil
`kode_desa_spatial` == DukcapilRegion.code (village), so areas join directly.

Area is geodesic (spherical-excess on the WGS84 authalic sphere) — no pyproj
dependency; accurate to well under 1% at desa scale (validated: summed Pangkep
desa = 888.3 vs Dukcapil kab total 888.91). Kecamatan/kabupaten/province areas
are NOT stored here — the loader sums desa up the hierarchy (area is additive),
guaranteeing consistency with the app's own kec/kab/prov grouping.

Province 96 (Papua Barat Daya) has no BIG archive; it falls back to the already-
simplified public desa file (slightly less precise, only that one province).

Usage: python3 compute_area.py
"""
import glob
import json
import math
import os

HERE = os.path.dirname(os.path.abspath(__file__))
PUB = os.path.join(HERE, "..", "..", "frontend", "public")
OUT = os.path.join(HERE, "..", "..", "backend", "dukcapil", "data", "big_area.json")

R = 6371007.2  # WGS84 authalic (equal-area) radius, metres


def ring_area_m2(ring):
    """Signed geodesic area of a lon/lat ring (spherical excess), m²."""
    if len(ring) < 4:
        return 0.0
    tot = 0.0
    for i in range(len(ring) - 1):
        lon1, lat1 = ring[i]
        lon2, lat2 = ring[i + 1]
        tot += math.radians(lon2 - lon1) * (2 + math.sin(math.radians(lat1)) + math.sin(math.radians(lat2)))
    return tot * R * R / 2.0


def poly_area_km2(poly):
    """Polygon area (outer ring minus holes), km²."""
    if not poly:
        return 0.0
    outer = abs(ring_area_m2(poly[0]))
    holes = sum(abs(ring_area_m2(r)) for r in poly[1:])
    return max(outer - holes, 0.0) / 1e6


def feature_area_km2(geom):
    polys = [geom["coordinates"]] if geom["type"] == "Polygon" else geom["coordinates"]
    return sum(poly_area_km2(p) for p in polys)


def main():
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    area = {}
    big_provs = set()
    for f in sorted(glob.glob(os.path.join(HERE, "big-villages-*.geojson"))):
        prov = os.path.basename(f).split("-")[-1].split(".")[0].strip()
        if not prov:
            continue
        big_provs.add(prov)
        for feat in json.load(open(f))["features"]:
            code = feat["properties"]["domain_id"]
            area[code] = round(feature_area_km2(feat["geometry"]), 4)
    # Fallback: public simplified desa for provinces with no BIG archive (96).
    for f in sorted(glob.glob(os.path.join(PUB, "dukcapil-villages-*.geojson"))):
        prov = os.path.basename(f).split("-")[-1].split(".")[0].strip()
        if not prov or prov in big_provs:
            continue
        for feat in json.load(open(f))["features"]:
            code = feat["properties"]["domain_id"]
            area.setdefault(code, round(feature_area_km2(feat["geometry"]), 4))
        print(f"  fallback (simplified) province {prov}")
    json.dump(area, open(OUT, "w"))
    total = sum(area.values())
    print(f"BIG provinces: {len(big_provs)}  desa: {len(area)}  total land: {total:,.0f} km²")
    print(f"wrote {OUT} ({os.path.getsize(OUT) // 1024} KB)")


if __name__ == "__main__":
    main()
