#!/usr/bin/env python3
"""Derive smooth kecamatan / kabupaten / provinsi boundaries from the BIG desa
geometry (already in frontend/public/dukcapil-villages-*.geojson) by dissolving
desa polygons up their code hierarchy (code[:6]=kec, [:4]=kab, [:2]=prov).

Keys stay the Kemendagri codes the maps already use, so the province/kabupaten/
kecamatan choropleths join unchanged. Names are copied from the current
dukcapil-{districts,regencies,provinces}.geojson (by code) before overwriting.

Offline (shapely) — no server needed.
"""
import glob
import json
import os
from collections import defaultdict

import shapely
from shapely import make_valid
from shapely.geometry import MultiPolygon, mapping, shape

PUB = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "frontend", "public")
ND = 5


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


def dissolve(items, keylen, tol, area_thr):
    """Union desa (grid-snapped so shared borders merge), then simplify and
    drop tiny islands/slivers per zoom level. The union is invalid (self-
    touching), so simplify with preserve_topology=False (True refuses to
    reduce invalid geometry) and make_valid the result."""
    groups = defaultdict(list)
    for code, geom in items:
        groups[code[:keylen]].append(geom)
    out = []
    for k, geoms in groups.items():
        try:
            g = shapely.union_all(geoms, grid_size=1e-7)
        except Exception:  # noqa
            g = shapely.union_all([make_valid(x) for x in geoms])
        g = make_valid(g.simplify(tol, preserve_topology=False))
        polys = sorted(_polys(g), key=lambda p: p.area, reverse=True)
        keep = [p for p in polys if p.area > area_thr] or polys[:1]
        out.append((k, keep[0] if len(keep) == 1 else MultiPolygon(keep)))
    return out


def write(items, name_map, level_label, out_path):
    feats = []
    for k, g in items:
        gm = mapping(g)
        gm = {"type": gm["type"], "coordinates": round_coords(gm["coordinates"])}
        feats.append({"type": "Feature",
                      "properties": {"domain_id": k, "name": name_map.get(k, k)},
                      "geometry": gm})
    json.dump({"type": "FeatureCollection", "features": feats},
              open(os.path.join(PUB, out_path), "w"), ensure_ascii=False)
    print(f"{level_label}: {len(feats)} -> {out_path} ({os.path.getsize(os.path.join(PUB, out_path))//1024}KB)")


if __name__ == "__main__":
    # Names first (before overwriting).
    kec_names = names("dukcapil-districts.geojson")
    kab_names = names("dukcapil-regencies.geojson")
    prov_names = names("dukcapil-provinces.geojson")

    print("loading desa geometry…")
    desa = []
    for f in sorted(glob.glob(os.path.join(PUB, "dukcapil-villages-*.geojson"))):
        for feat in json.load(open(f))["features"]:
            try:
                desa.append((feat["properties"]["domain_id"], shape(feat["geometry"]).buffer(0)))
            except Exception:  # noqa
                pass
    print(f"  {len(desa)} desa")

    # (tol, area_thr) tuned per zoom level: kecamatan viewed at province zoom
    # keeps most detail; kab/prov are national-scale so simplify harder + drop
    # tiny islands. Dissolve hierarchically (desa->kec->kab->prov).
    kec = dissolve(desa, 6, 0.0013, 0.00002)
    write(kec, kec_names, "kecamatan", "dukcapil-districts.geojson")
    kab = dissolve([(k, g) for k, g in kec], 4, 0.003, 0.00004)
    write(kab, kab_names, "kabupaten", "dukcapil-regencies.geojson")
    prov = dissolve([(k, g) for k, g in kab], 2, 0.008, 0.0002)
    write(prov, prov_names, "provinsi", "dukcapil-provinces.geojson")
    print("DONE")
