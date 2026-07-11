#!/usr/bin/env python3
"""Fetch raw Dukcapil ArcGIS data (new themed layers + historical population)
to JSON files, for later ingest. No app integration — just the data.

Skips huge village-level layers (count > SKIP_ABOVE) to stay quick; fetch those
separately per-province if needed. Writes a manifest.json describing everything.
"""
import json
import os
import sys
import time
import urllib.parse
import urllib.request

BASE = "https://gis.dukcapil.kemendagri.go.id/arcgis/rest/services"
OUT = os.path.dirname(os.path.abspath(__file__))
SKIP_ABOVE = 20000  # skip village-level (~83k) here; fetch per-province later

# (service, folder). New themed layers we don't already have, + historical pop.
NEW_THEMED = [
    "AGR_AKTALAHIR_202401", "AGR_AKTAKAWIN_202401", "AGR_AKTACERAI_202401",
    "AGR_ANGKA_PERKAWINAN_202401", "AGR_ANGKA_PERCERAIAN_202401",
    "AGR_IMR_202401", "Penyebab_Kematian", "KEPEMILIKAN_KIA",
    "Monitoring_Pendaftaran_IKD", "AGR_PINDAH_DATANG_202401",
]
HISTORICAL = [
    "AGR_VISUAL_PROP_202302", "giskemendagri_sde_AGR_VISUAL_PROP_202401",
    "AGR_VISUAL_KAB_202401", "giskemendagri_sde_AGR_VISUAL_KEC_202401",
    "AGR_VISUAL_KEL_202401",  # historical village population (~83k)
]


def get(u, tries=4):
    last = None
    for i in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": "nusastats/1.0"}), timeout=180) as r:
                return json.load(r)
        except Exception as e:  # noqa
            last = e
            sys.stderr.write(f"  retry {i+1}: {e}\n")
            time.sleep(2 * (i + 1))
    raise last


def fetch_layer(base, lid, out_path, page=2000):
    feats, off = [], 0
    while True:
        qs = urllib.parse.urlencode({
            "where": "1=1", "outFields": "*", "returnGeometry": "false",
            "f": "json", "resultOffset": off, "resultRecordCount": page,
        })
        d = get(f"{base}/{lid}/query?{qs}")
        fs = d.get("features", [])
        feats += [f["attributes"] for f in fs]
        if len(fs) < page and not d.get("exceededTransferLimit"):
            break
        if not fs:
            break
        off += page
        time.sleep(0.4)
    json.dump(feats, open(out_path, "w"), ensure_ascii=False)
    return len(feats)


def run(services, tag, skip_above=SKIP_ABOVE):
    manifest = []
    for svc in services:
        base = f"{BASE}/{svc}/MapServer"
        try:
            meta = get(base + "?f=json")
        except Exception as e:  # noqa
            sys.stderr.write(f"{svc}: SERVICE ERR {e}\n")
            manifest.append({"service": svc, "error": str(e)})
            continue
        for L in meta.get("layers", []):
            lid, lname = L["id"], L.get("name", "")
            try:
                cnt = get(f"{base}/{lid}/query?where=1%3D1&returnCountOnly=true&f=json").get("count")
            except Exception as e:  # noqa
                sys.stderr.write(f"{svc}/L{lid}: count ERR {e}\n")
                continue
            if not cnt:
                continue
            fn = f"{svc}_L{lid}_n{cnt}.json"
            fpath = os.path.join(OUT, fn)
            if os.path.exists(fpath):  # already fetched
                sys.stderr.write(f"{svc}/L{lid}: exists, skip\n")
                continue
            lmeta = get(f"{base}/{lid}?f=json")
            fields = [f["name"] for f in lmeta.get("fields", []) if "shape" not in f["name"].lower()]
            entry = {"tag": tag, "service": svc, "layer_id": lid, "layer_name": lname,
                     "count": cnt, "fields": fields}
            if cnt > skip_above:
                entry["skipped"] = f"large ({cnt}) — run 'village' mode to fetch"
                sys.stderr.write(f"{svc}/L{lid}: SKIP large n={cnt}\n")
            else:
                # Large layers page bigger to cut round-trips (attrs are light).
                n = fetch_layer(base, lid, fpath, page=10000 if cnt > 5000 else 2000)
                entry["file"] = fn
                sys.stderr.write(f"{svc}/L{lid}: saved {n} -> {fn}\n")
            manifest.append(entry)
    return manifest


if __name__ == "__main__":
    which = sys.argv[1] if len(sys.argv) > 1 else "all"
    man = []
    if which == "kel":
        # Historical village population (83k) fetched PER PROVINCE (small,
        # robust to the flaky network — one nationwide pull kept truncating).
        base = f"{BASE}/AGR_VISUAL_KEL_202401/MapServer/0/query"
        cnt = get(f"{base}?where=1%3D1&returnCountOnly=true&f=json").get("count")
        feats, page = [], 2000
        for pp in range(11, 97):
            off = 0
            while True:
                qs = urllib.parse.urlencode({
                    "where": f"no_prop={pp}", "outFields": "*", "returnGeometry": "false",
                    "f": "json", "resultOffset": off, "resultRecordCount": page,
                })
                d = get(f"{base}?{qs}")
                fs = d.get("features", [])
                feats += [f["attributes"] for f in fs]
                if len(fs) < page and not d.get("exceededTransferLimit"):
                    break
                if not fs:
                    break
                off += page
                time.sleep(0.3)
            if any(f.get("no_prop") == pp for f in feats[-1:]):
                sys.stderr.write(f"  prov {pp}: {len(feats)} cumulative\n")
        fn = f"AGR_VISUAL_KEL_202401_L0_n{cnt}.json"
        json.dump(feats, open(os.path.join(OUT, fn), "w"), ensure_ascii=False)
        sys.stderr.write(f"KEL: saved {len(feats)} / {cnt} -> {fn}\n")
        raise SystemExit
    if which == "village":
        # Fetch every layer including the big village ones (skip nothing);
        # existing files are skipped, so this only pulls what's missing.
        man += run(NEW_THEMED + HISTORICAL, "village-full", skip_above=10 ** 9)
    if which in ("all", "themed"):
        man += run(NEW_THEMED, "new-themed")
    if which in ("all", "historical"):
        man += run(HISTORICAL, "historical")
    # merge with any existing manifest
    mpath = os.path.join(OUT, "manifest.json")
    existing = json.load(open(mpath)) if os.path.exists(mpath) else []
    json.dump(existing + man, open(mpath, "w"), indent=2, ensure_ascii=False)
    sys.stderr.write(f"DONE {which}: {len(man)} layers\n")
