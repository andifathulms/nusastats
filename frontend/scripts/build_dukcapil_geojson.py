#!/usr/bin/env python3
"""Build Dukcapil province & kabupaten choropleth geojson from the Dukcapil
ArcGIS server, so the map keys match the data source exactly (all 38 provinces,
all 514 kab/kota). Geometry is simplified server-side (maxAllowableOffset) to
keep the static assets small.

Output props: {"domain_id": <code>, "name": <name>} to match ChoroplethMap.
"""
import json
import sys
import urllib.parse
import urllib.request

sys.setrecursionlimit(100000)  # RDP recurses per-vertex on long coastline rings

BASE = "https://gis.dukcapil.kemendagri.go.id/arcgis/rest/services"


def fetch(service, layer, fields, offset, offset_tol):
    qs = urllib.parse.urlencode({
        "where": "1=1", "outFields": fields, "returnGeometry": "true",
        "outSR": "4326", "maxAllowableOffset": offset_tol, "f": "geojson",
        "resultOffset": offset, "resultRecordCount": 2000,
    })
    url = f"{BASE}/{service}/MapServer/{layer}/query?{qs}"
    req = urllib.request.Request(url, headers={"User-Agent": "nusastats/1.0"})
    with urllib.request.urlopen(req, timeout=300) as r:
        return json.load(r)


def _rdp(pts, eps):
    """Ramer-Douglas-Peucker line simplification (the server ignores
    maxAllowableOffset, so we decimate vertices ourselves)."""
    if len(pts) < 3:
        return pts
    ax, ay = pts[0]
    bx, by = pts[-1]
    dx, dy = bx - ax, by - ay
    denom = (dx * dx + dy * dy) ** 0.5 or 1e-12
    dmax, idx = 0.0, 0
    for i in range(1, len(pts) - 1):
        px, py = pts[i]
        d = abs(dx * (ay - py) - (ax - px) * dy) / denom
        if d > dmax:
            dmax, idx = d, i
    if dmax > eps:
        left = _rdp(pts[: idx + 1], eps)
        right = _rdp(pts[idx:], eps)
        return left[:-1] + right
    return [pts[0], pts[-1]]


def simplify_geom(geom, eps, nd=3):
    """Round coords to nd decimals (~110m at nd=3) and drop consecutive
    duplicates. Fast, and enough at national choropleth scale; the server
    ignores maxAllowableOffset so this is where the shrink happens. (RDP is
    available via _rdp but is O(n^2) on long coastlines — too slow here.)
    Drops rings that collapse below a triangle (tiny islands)."""
    def ring(r):
        out = []
        for x, y in r:
            p = [round(x, nd), round(y, nd)]
            if not out or out[-1] != p:
                out.append(p)
        return out if len(out) >= 4 else None

    def polys(ps):
        out = []
        for poly in ps:
            rings = [rr for rr in (ring(r) for r in poly) if rr]
            if rings:
                out.append(rings)
        return out

    t = geom["type"]
    if t == "Polygon":
        geom["coordinates"] = [rr for rr in (ring(r) for r in geom["coordinates"]) if rr]
    elif t == "MultiPolygon":
        geom["coordinates"] = polys(geom["coordinates"])
    return geom


def build(service, layer, fields, offset_tol, eps, key_fn, name_field, out_path):
    feats, offset = [], 0
    while True:
        doc = fetch(service, layer, fields, offset, offset_tol)
        page = doc.get("features", [])
        for f in page:
            p = f["properties"]
            code = key_fn(p)
            if not code or not f.get("geometry"):
                continue
            geom = simplify_geom(f["geometry"], eps)
            if not geom["coordinates"]:
                continue
            feats.append({
                "type": "Feature",
                "properties": {"domain_id": code, "name": p.get(name_field) or code},
                "geometry": geom,
            })
        if len(page) < 2000 and not doc.get("exceededTransferLimit"):
            break
        if not page:
            break
        offset += 2000
    fc = {"type": "FeatureCollection", "features": feats}
    with open(out_path, "w") as fh:
        json.dump(fc, fh)
    sys.stderr.write(f"{out_path}: {len(feats)} features\n")


def prov_code(p):
    n = p.get("no_prop")
    return f"{int(n):02d}" if n is not None else ""


def kab_code(p):
    a, b = p.get("no_prop"), p.get("no_kab")
    if a is None or b is None:
        return ""
    return f"{int(a):02d}{int(b):02d}"


if __name__ == "__main__":
    which = sys.argv[1]
    out_dir = sys.argv[2]
    eps = float(sys.argv[3]) if len(sys.argv) > 3 else None
    if which == "prov":
        build("AGR_VISUAL_PROP_FIX", 1, "no_prop,nama_prop", 0.02, eps or 0.008,
              prov_code, "nama_prop", f"{out_dir}/dukcapil-provinces.geojson")
    else:
        build("AGR_VISUAL_KAB_FIX", 3, "no_prop,no_kab,nama_kab", 0.01, eps or 0.004,
              kab_code, "nama_kab", f"{out_dir}/dukcapil-regencies.geojson")
