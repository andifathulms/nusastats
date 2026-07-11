#!/usr/bin/env python3
"""Simplify the full-detail BIG desa archive (data/big_boundaries/) into
web-servable geojson, written to frontend/public/dukcapil-villages-<prov>.geojson
(same filenames + keys the map already uses -> zero code change).

Uses Douglas-Peucker (real line simplification) so curves stay smooth while
redundant vertices are dropped. At web zoom even a ~30 m epsilon is sub-pixel,
so the result looks identical to full-res but is ~10x smaller.

Usage: python3 simplify_big.py <eps_degrees> [prov ...]
       eps ~0.0003 ≈ 33 m.  No prov args = all.
"""
import glob
import json
import os
import sys

sys.setrecursionlimit(1000000)
SRC = os.path.dirname(os.path.abspath(__file__))
DST = os.path.join(SRC, "..", "..", "frontend", "public")
ND = 5


def rdp(pts, eps):
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
        return rdp(pts[: idx + 1], eps)[:-1] + rdp(pts[idx:], eps)
    return [pts[0], pts[-1]]


def ring(r, eps):
    # Rings are closed (r[0]==r[-1]), which makes a single RDP degenerate
    # (baseline has zero length). Split at the point farthest from r[0] into
    # two open polylines, RDP each, rejoin — the classic closed-ring fix.
    if len(r) < 4:
        return None
    ax, ay = r[0]
    far = max(range(1, len(r) - 1), key=lambda i: (r[i][0] - ax) ** 2 + (r[i][1] - ay) ** 2)
    s = rdp(r[: far + 1], eps)[:-1] + rdp(r[far:], eps)
    s = [[round(x, ND), round(y, ND)] for x, y in s]
    return s if len(s) >= 4 else None


def simp(geom, eps):
    t = geom["type"]
    if t == "Polygon":
        geom["coordinates"] = [rr for rr in (ring(r, eps) for r in geom["coordinates"]) if rr]
    elif t == "MultiPolygon":
        geom["coordinates"] = [pp for pp in ([rr for rr in (ring(r, eps) for r in poly) if rr]
                                             for poly in geom["coordinates"]) if pp]
    return geom


def process(path, eps):
    fc = json.load(open(path))
    out = []
    for f in fc["features"]:
        g = simp(f["geometry"], eps)
        if g["coordinates"]:
            out.append({"type": "Feature", "properties": f["properties"], "geometry": g})
    prov = os.path.basename(path).split("-")[-1].split(".")[0]
    dst = os.path.join(DST, f"dukcapil-villages-{prov}.geojson")
    json.dump({"type": "FeatureCollection", "features": out}, open(dst, "w"), ensure_ascii=False)
    return prov, len(out), os.path.getsize(dst)


if __name__ == "__main__":
    eps = float(sys.argv[1])
    provs = sys.argv[2:]
    files = ([os.path.join(SRC, f"big-villages-{p}.geojson") for p in provs] if provs
             else sorted(glob.glob(os.path.join(SRC, "big-villages-*.geojson"))))
    total = 0
    for path in files:
        prov, n, sz = process(path, eps)
        total += sz
        sys.stderr.write(f"prov {prov}: {n} desa -> {sz//1024}KB\n")
    sys.stderr.write(f"TOTAL: {total//1024//1024}MB\n")
