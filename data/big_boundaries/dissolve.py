#!/usr/bin/env python3
"""Derive smooth kecamatan / kabupaten / provinsi boundaries from the BIG desa
geometry by dissolving desa polygons up their code hierarchy
(code[:6]=kec, [:4]=kab, [:2]=prov), writing to
frontend/public/dukcapil-{districts,regencies,provinces}.geojson.

CORRECT PIPELINE — dissolve at FULL resolution, THEN simplify:
  The earlier version dissolved the *already-simplified* public desa files.
  Each desa had been RDP-simplified independently, so a border shared by two
  adjacent desa was simplified two different ways and the two copies no longer
  coincided. Unioning them left a tiny gap at every seam -> thousands of tiny
  interior holes ("dots/ants") on the kec/kab/prov maps.

  Here we read the FULL-RES BIG archive (data/big_boundaries/big-villages-*),
  where adjacent desa share identical boundary vertices, so the union is clean
  (no seam gaps). We also keep each level's dissolved geometry at full res as
  the input to the next level up (kec->kab->prov), and only simplify at write
  time — so higher levels never inherit a lower level's independent
  simplification. Sub-threshold holes are dropped as insurance (real enclaves,
  which are large, are kept).

Keys stay the Kemendagri codes the maps already use, so the choropleths join
unchanged. Names are copied from the current
dukcapil-{districts,regencies,provinces}.geojson (by code) before overwriting.

Province 96 (Papua Barat Daya) has no BIG archive; it falls back to the
already-simplified public desa file (best available for that one province).

Desa that BIG still files under a province they have left (Papua Barat's
pre-2022 kabupaten, see superseded.py) are dropped before dissolving, after a
check that the province they moved to covers them.

Offline (shapely) — no server needed.
Usage: python3 dissolve.py              # every province
       python3 dissolve.py --prov 92    # one province: its features are replaced
                                        # in place, the rest of each file is kept
"""
import argparse
import glob
import json
import os
import sys
from collections import defaultdict

import shapely
from shapely import make_valid
from shapely.geometry import MultiPolygon, Polygon, mapping, shape

from superseded import COVER_MIN, NOW_IN, SUPERSEDED, superseded

HERE = os.path.dirname(os.path.abspath(__file__))
PUB = os.path.join(HERE, "..", "..", "frontend", "public")
ND = 5

# 1 deg^2 ~ 12,300 km^2 near the equator. Convert km^2 hole thresholds to deg^2.
KM2_PER_DEG2 = 12300.0


def km2(deg2):
    return deg2 / KM2_PER_DEG2  # -> deg^2 threshold for a km^2 area


def names(path):
    fc = json.load(open(os.path.join(PUB, path)))
    return {f["properties"]["domain_id"]: f["properties"].get("name", "") for f in fc["features"]}


def round_coords(obj):
    if isinstance(obj, (list, tuple)):
        if obj and isinstance(obj[0], (int, float)):
            return [round(obj[0], ND), round(obj[1], ND)]
        return [round_coords(x) for x in obj]
    return obj


def _polys(g):
    gt = g.geom_type
    if gt == "Polygon":
        return [g]
    if gt == "MultiPolygon":
        return list(g.geoms)
    if gt == "GeometryCollection":
        return [p for x in g.geoms for p in _polys(x)]
    return []


def drop_small_holes(poly, hole_thr):
    """Remove interior rings (holes) smaller than hole_thr deg^2. Real enclaves
    (a kota inside a kabupaten, etc.) are large and kept; sub-threshold holes
    are residual tiling artifacts."""
    if hole_thr <= 0:
        return poly
    interiors = [r for r in poly.interiors if Polygon(r).area >= hole_thr]
    if len(interiors) == len(poly.interiors):
        return poly
    return Polygon(poly.exterior, interiors)


def dissolve(items, keylen, area_thr, hole_thr):
    """Union desa/kec/kab (grid-snapped so shared borders merge), keep the
    result at FULL resolution (no simplify here — callers simplify only at
    write time). Drop tiny islands/slivers and sub-threshold interior holes.
    Returns (code -> shapely geometry)."""
    groups = defaultdict(list)
    for code, geom in items:
        groups[code[:keylen]].append(geom)
    out = []
    for k, geoms in groups.items():
        try:
            g = shapely.union_all(geoms, grid_size=1e-8)
        except Exception:  # noqa
            g = shapely.union_all([make_valid(x) for x in geoms])
        g = make_valid(g)
        polys = sorted(_polys(g), key=lambda p: p.area, reverse=True)
        keep = [drop_small_holes(p, hole_thr) for p in polys if p.area > area_thr] or [
            drop_small_holes(polys[0], hole_thr)
        ]
        out.append((k, keep[0] if len(keep) == 1 else MultiPolygon(keep)))
    return out


def simplify_geom(g, tol, hole_thr):
    """Simplify a clean (valid) dissolved geometry for web display. The outline
    is valid here, so preserve_topology=True is safe and won't tear seams open.
    Re-drop holes that fall below threshold after simplification."""
    s = make_valid(g.simplify(tol, preserve_topology=True))
    polys = [drop_small_holes(p, hole_thr) for p in _polys(s)]
    if not polys:
        return g
    return polys[0] if len(polys) == 1 else MultiPolygon(polys)


def write(items, name_map, level_label, out_path, tol, hole_thr, only=None):
    """Write one level. With `only` (a province code), only that province's
    features are replaced; every other feature in the file is kept as is."""
    feats = []
    for k, g in items:
        gm = mapping(simplify_geom(g, tol, hole_thr))
        gm = {"type": gm["type"], "coordinates": round_coords(gm["coordinates"])}
        feats.append({"type": "Feature",
                      "properties": {"domain_id": k, "name": name_map.get(k, k)},
                      "geometry": gm})
    if only:
        old = json.load(open(os.path.join(PUB, out_path)))["features"]
        feats = [f for f in old if not f["properties"]["domain_id"].startswith(only)] + feats
    json.dump({"type": "FeatureCollection", "features": feats},
              open(os.path.join(PUB, out_path), "w"), ensure_ascii=False)
    sz = os.path.getsize(os.path.join(PUB, out_path)) // 1024
    print(f"{level_label}: {len(feats)} -> {out_path} ({sz}KB)")


def check_superseded(dropped):
    """Each dropped kabupaten must lie in the province it moved to (by the
    current provinsi outline): a wrong code in superseded.py would otherwise
    cut real land out of a province. Exits on failure."""
    if not dropped:
        return
    target = next(shape(f["geometry"]) for f in json.load(open(os.path.join(PUB, "dukcapil-provinces.geojson")))["features"]
                  if f["properties"]["domain_id"] == NOW_IN)
    target = make_valid(target)
    for kab, geoms in sorted(dropped.items()):
        g = make_valid(shapely.union_all(geoms, grid_size=1e-8))
        share = g.intersection(target).area / g.area
        print(f"  dropped {kab} {SUPERSEDED[kab]}: {len(geoms)} desa, {share:.1%} inside province {NOW_IN}")
        if share < COVER_MIN:
            sys.exit(f"stopping: {kab} is only {share:.1%} inside province {NOW_IN} (need {COVER_MIN:.0%})")


def load_desa(only=None):
    """Full-res BIG desa where available; fall back to the simplified public
    file for provinces with no BIG archive (currently only 96). `only`: one
    province code."""
    desa = []
    big_provs = set()
    dropped = defaultdict(list)
    for f in sorted(glob.glob(os.path.join(HERE, "big-villages-*.geojson"))):
        prov = os.path.basename(f).split("-")[-1].split(".")[0].strip()
        if not prov or (only and prov != only):
            continue
        big_provs.add(prov)
        for feat in json.load(open(f))["features"]:
            try:
                g = shape(feat["geometry"])
                g = g if g.is_valid else make_valid(g)
            except Exception:  # noqa
                continue
            code = feat["properties"]["domain_id"]
            if superseded(code):
                dropped[code[:4]].append(g)
            else:
                desa.append((code, g))
    print(f"  full-res BIG provinces: {len(big_provs)}")
    check_superseded(dropped)
    # Fallback: public simplified desa for provinces without BIG.
    for f in sorted(glob.glob(os.path.join(PUB, "dukcapil-villages-*.geojson"))):
        prov = os.path.basename(f).split("-")[-1].split(".")[0].strip()
        if not prov or prov in big_provs or (only and prov != only):
            continue
        print(f"  fallback (simplified) province: {prov}")
        for feat in json.load(open(f))["features"]:
            try:
                g = shape(feat["geometry"])
                desa.append((feat["properties"]["domain_id"], g if g.is_valid else make_valid(g)))
            except Exception:  # noqa
                pass
    return desa


def write_chunks(only=None):
    """Per-province kecamatan files (dukcapil-districts-<prov>.geojson), the
    ones the maps load, split from the nationwide file."""
    by_prov = defaultdict(list)
    for f in json.load(open(os.path.join(PUB, "dukcapil-districts.geojson")))["features"]:
        by_prov[f["properties"]["domain_id"][:2]].append(f)
    for prov, feats in sorted(by_prov.items()):
        if only and prov != only:
            continue
        json.dump({"type": "FeatureCollection", "features": feats},
                  open(os.path.join(PUB, f"dukcapil-districts-{prov}.geojson"), "w"), ensure_ascii=False)
        print(f"  dukcapil-districts-{prov}.geojson: {len(feats)}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--prov", help="rebuild one province only, e.g. 92")
    only = ap.parse_args().prov

    # Names first (before overwriting).
    kec_names = names("dukcapil-districts.geojson")
    kab_names = names("dukcapil-regencies.geojson")
    prov_names = names("dukcapil-provinces.geojson")

    print("loading full-res desa geometry…")
    desa = load_desa(only)
    print(f"  {len(desa)} desa total")

    # Hierarchical, full-res dissolve: desa->kec->kab->prov. Each level's
    # geometry is kept full-res as input to the next, so higher levels never
    # inherit a lower level's independent simplification (the seam-gap bug).
    # Simplification + hole cleanup happen only at write() time, tuned per zoom.
    print("dissolving desa -> kecamatan…")
    kec = dissolve(desa, 6, area_thr=km2(0.05), hole_thr=km2(0.3))
    del desa
    write(kec, kec_names, "kecamatan", "dukcapil-districts.geojson",
          tol=0.0004, hole_thr=km2(0.3), only=only)
    write_chunks(only)

    print("dissolving kecamatan -> kabupaten…")
    kab = dissolve(kec, 4, area_thr=km2(0.1), hole_thr=km2(0.8))
    write(kab, kab_names, "kabupaten", "dukcapil-regencies.geojson",
          tol=0.0009, hole_thr=km2(0.8), only=only)

    print("dissolving kabupaten -> provinsi…")
    prov = dissolve(kab, 2, area_thr=km2(0.5), hole_thr=km2(2.0))
    write(prov, prov_names, "provinsi", "dukcapil-provinces.geojson",
          tol=0.002, hole_thr=km2(2.0), only=only)
    print("DONE")
