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


def fetch(service, layer, fields, offset, offset_tol, where="1=1", page=2000):
    qs = urllib.parse.urlencode({
        "where": where, "outFields": fields, "returnGeometry": "true",
        "outSR": "4326", "maxAllowableOffset": offset_tol, "f": "geojson",
        "resultOffset": offset, "resultRecordCount": page,
    })
    url = f"{BASE}/{service}/MapServer/{layer}/query?{qs}"
    req = urllib.request.Request(url, headers={"User-Agent": "nusastats/1.0"})
    last = None
    for attempt in range(4):  # the geometry payloads are big; retry on timeouts
        try:
            with urllib.request.urlopen(req, timeout=180) as r:
                return json.load(r)
        except Exception as exc:  # noqa: BLE001
            last = exc
            sys.stderr.write(f"  retry {attempt + 1} ({where} off={offset}): {exc}\n")
    raise last


def distinct_provs(service, layer):
    qs = urllib.parse.urlencode({
        "where": "1=1", "outFields": "no_prop", "returnGeometry": "false",
        "returnDistinctValues": "true", "f": "json",
    })
    url = f"{BASE}/{service}/MapServer/{layer}/query?{qs}"
    req = urllib.request.Request(url, headers={"User-Agent": "nusastats/1.0"})
    with urllib.request.urlopen(req, timeout=120) as r:
        doc = json.load(r)
    vals = sorted({f["attributes"]["no_prop"] for f in doc["features"] if f["attributes"].get("no_prop") is not None})
    return vals


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


def build(service, layer, fields, offset_tol, eps, key_fn, name_field, out_path,
          wheres=None, page=2000, nd=3):
    """Fetch (optionally per `wheres` clause, to keep dense levels' payloads
    small), simplify, and write. `wheres` defaults to one nationwide query.
    `nd` = coordinate decimals kept (higher preserves small polygons)."""
    feats = []
    for where in (wheres or ["1=1"]):
        offset = 0
        while True:
            doc = fetch(service, layer, fields, offset, offset_tol, where=where, page=page)
            rows = doc.get("features", [])
            for f in rows:
                p = f["properties"]
                code = key_fn(p)
                if not code or not f.get("geometry"):
                    continue
                geom = simplify_geom(f["geometry"], eps, nd=nd)
                if not geom["coordinates"]:
                    continue
                feats.append({
                    "type": "Feature",
                    "properties": {"domain_id": code, "name": p.get(name_field) or code},
                    "geometry": geom,
                })
            if len(rows) < page and not doc.get("exceededTransferLimit"):
                break
            if not rows:
                break
            offset += page
        if wheres:
            sys.stderr.write(f"  {where}: {len(feats)} cumulative\n")
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


def kec_code(p):
    a, b, c = p.get("no_prop"), p.get("no_kab"), p.get("no_kec")
    if a is None or b is None or c is None:
        return ""
    return f"{int(a):02d}{int(b):02d}{int(c):02d}"


def desa_code(p):
    k = p.get("kode_desa_spatial")
    return str(int(k)) if k is not None else ""


def build_villages(out_dir, eps, only=None):
    """One geojson per province (83k villages nationwide is too much for a
    single file/request). nd=4 keeps small village polygons from collapsing."""
    provs = only or distinct_provs("AGR_VISUAL_KEL_FIX", 0)
    for p in provs:
        build("AGR_VISUAL_KEL_FIX", 0, "no_prop,kode_desa_spatial,nama_kel", 0.004, eps or 0.0015,
              desa_code, "nama_kel", f"{out_dir}/dukcapil-villages-{int(p):02d}.geojson",
              wheres=[f"no_prop={p}"], page=1000, nd=4)
        sys.stderr.write(f"province {p} done\n")


if __name__ == "__main__":
    which = sys.argv[1]
    out_dir = sys.argv[2]
    eps = float(sys.argv[3]) if len(sys.argv) > 3 else None
    if which == "prov":
        build("AGR_VISUAL_PROP_FIX", 1, "no_prop,nama_prop", 0.02, eps or 0.008,
              prov_code, "nama_prop", f"{out_dir}/dukcapil-provinces.geojson")
    elif which == "kec":
        # 7,285 kecamatan is too much geometry for one query — fetch per province.
        provs = distinct_provs("AGR_VISUAL_KEC_FIX", 2)
        sys.stderr.write(f"kecamatan across {len(provs)} provinces\n")
        build("AGR_VISUAL_KEC_FIX", 2, "no_prop,no_kab,no_kec,nama_kec", 0.008, eps or 0.003,
              kec_code, "nama_kec", f"{out_dir}/dukcapil-districts.geojson",
              wheres=[f"no_prop={p}" for p in provs], page=1000)
    elif which == "desa":
        # One file per province. Optional 4th+ args = specific province numbers.
        only = [int(x) for x in sys.argv[4:]] or None
        build_villages(out_dir, eps, only=only)
    else:
        build("AGR_VISUAL_KAB_FIX", 3, "no_prop,no_kab,nama_kab", 0.01, eps or 0.004,
              kab_code, "nama_kab", f"{out_dir}/dukcapil-regencies.geojson")
