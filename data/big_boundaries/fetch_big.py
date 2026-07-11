#!/usr/bin/env python3
"""Fetch BIG (Badan Informasi Geospasial) authoritative 1:10K desa/kelurahan
boundaries per province, keyed by the Kemendagri code (KDEPUM without dots =
our kode_desa_spatial), so they join directly to the Dukcapil village data.

BIG's polygons carry the full 1:10K vertex detail (much smoother than the
generalized copy Dukcapil serves), so we keep all vertices and only round
coordinates to nd=5 (~1 m) to trim the 13-decimal noise. Output is one geojson
per province in this folder + manifest.json.

Usage: python3 fetch_big.py            # all provinces
       python3 fetch_big.py 33 34      # specific province codes
"""
import json
import os
import sys
import time
import urllib.parse
import urllib.request

SVC = ("https://geoservices.big.go.id/rbi/rest/services/BATASWILAYAH/"
       "Administrasi_AR_KelDesa_10K/MapServer/0")
OUT = os.path.dirname(os.path.abspath(__file__))
ND = 5  # decimals kept (~1 m); vertices preserved (no line simplification)
UA = {"User-Agent": "Mozilla/5.0 (nusastats)"}


def get(u, tries=4):
    last = None
    for i in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=240) as r:
                return json.load(r)
        except Exception as e:  # noqa
            last = e
            sys.stderr.write(f"  retry {i+1}: {e}\n")
            time.sleep(3 * (i + 1))
    raise last


def round_ring(r):
    out = []
    for pt in r:
        p = [round(pt[0], ND), round(pt[1], ND)]
        if not out or out[-1] != p:
            out.append(p)
    return out if len(out) >= 4 else None


def round_geom(g):
    t = g["type"]
    if t == "Polygon":
        g["coordinates"] = [rr for rr in (round_ring(r) for r in g["coordinates"]) if rr]
    elif t == "MultiPolygon":
        g["coordinates"] = [[rr for rr in (round_ring(r) for r in poly) if rr] for poly in g["coordinates"]]
        g["coordinates"] = [p for p in g["coordinates"] if p]
    return g


def distinct_provs():
    qs = urllib.parse.urlencode({"where": "1=1", "outFields": "KDPKAB",
                                 "returnDistinctValues": "true", "returnGeometry": "false", "f": "json"})
    d = get(f"{SVC}/query?{qs}")
    kabs = {f["attributes"]["KDPKAB"] for f in d.get("features", []) if f["attributes"].get("KDPKAB")}
    return sorted({k.split(".")[0] for k in kabs})  # province 2-digit prefixes


def fetch_prov(pp, page=1000):
    feats, offset = [], 0
    where = urllib.parse.quote(f"KDPKAB LIKE '{pp}.%'")
    while True:
        qs = (f"where={where}&outFields=KDEPUM,WADMKD,WADMKK,LUASWH&returnGeometry=true"
              f"&outSR=4326&f=geojson&resultOffset={offset}&resultRecordCount={page}")
        d = get(f"{SVC}/query?{qs}")
        rows = d.get("features", [])
        for f in rows:
            p = f.get("properties", {})
            code = (p.get("KDEPUM") or "").replace(".", "")
            if not code or not f.get("geometry"):
                continue
            g = round_geom(f["geometry"])
            if not g["coordinates"]:
                continue
            feats.append({"type": "Feature",
                          "properties": {"domain_id": code, "name": p.get("WADMKD") or code},
                          "geometry": g})
        if len(rows) < page and not d.get("exceededTransferLimit"):
            break
        if not rows:
            break
        offset += page
        time.sleep(0.4)
    path = os.path.join(OUT, f"big-villages-{pp}.geojson")
    json.dump({"type": "FeatureCollection", "features": feats}, open(path, "w"), ensure_ascii=False)
    sys.stderr.write(f"prov {pp}: {len(feats)} desa -> {path} ({os.path.getsize(path)//1024}KB)\n")
    return {"prov": pp, "count": len(feats), "bytes": os.path.getsize(path)}


if __name__ == "__main__":
    provs = sys.argv[1:] or distinct_provs()
    sys.stderr.write(f"provinces: {provs}\n")
    manifest = []
    for pp in provs:
        if os.path.exists(os.path.join(OUT, f"big-villages-{pp}.geojson")):
            sys.stderr.write(f"prov {pp}: exists, skip\n")
            continue
        try:
            manifest.append(fetch_prov(pp))
        except Exception as e:  # noqa
            sys.stderr.write(f"prov {pp}: FAILED {e}\n")
            manifest.append({"prov": pp, "error": str(e)})
    mpath = os.path.join(OUT, "manifest.json")
    existing = json.load(open(mpath)) if os.path.exists(mpath) else []
    json.dump(existing + manifest, open(mpath, "w"), indent=2)
    sys.stderr.write("DONE\n")
