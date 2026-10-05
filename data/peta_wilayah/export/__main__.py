"""uv run python -m export

Collect every computed area in frontend/public/peta/{kode}/ into one compact,
committed file for the backend: backend/peta/data/peta_export.json. Same
precedent as data/big_boundaries/compute_area.py -> backend/dukcapil/data/
big_area.json: the backend container cannot see frontend/public, and the
loader (`manage.py load_peta`) must work from committed data alone.

Carries the values plus their provenance: per area the boundary hash, config
hashes, computed_at and the tiles (by key) used; at top level the dataset
descriptions and the sha256 of each of those tiles from sources.json.
Deterministic: areas sorted by kode, keys sorted.
"""
import hashlib
import json
import sys

from common import manifest
from common.paths import PUBLIC_PETA, REPO

OUT = REPO / "backend" / "peta" / "data" / "peta_export.json"
LEVEL = {2: "province", 4: "regency", 6: "district"}


def _terrain(t):
    m = t["metadata"]
    return {
        "area_km2": t["area_km2"], "elevation_m": t["elevation_m"], "relief_m": t["relief_m"],
        "highest_point": t["highest_point"], "elevation_bands_pct": t["elevation_bands_pct"],
        "slope_deg": t["slope_deg"], "slope_classes_pct": t["slope_classes_pct"],
        "metrics_pct": t["metrics_pct"], "terrain_class": t["terrain_class"],
        "lowland_pct": t.get("lowland_pct"), "local_relief": t.get("local_relief"),
        "terrain_class_label": t["terrain_class_label"], "terrain_class_reason": t["terrain_class_reason"],
        "provenance": {"dataset": "copernicus_dem_glo30", "tiles": sorted(m["tiles"]),
                       "boundary_sha256": m["boundary"]["sha256"], "config_sha256": m["config_sha256"],
                       "rules_sha256": t["classification"]["rules_sha256"], "crs_stats": m["crs_stats"],
                       "computed_at": m["computed_at"]},
    }


def _landcover(lc):
    m = lc["metadata"]
    return {
        "area_km2": lc["area_km2"], "year": lc["year"], "dominant": lc["dominant"],
        "classes": [{"code": c["code"], "share_pct": c["share_pct"], "area_km2": c["area_km2"]} for c in lc["classes"]],
        "provenance": {"dataset": "esa_worldcover_2021_v200", "tiles": sorted(m["tiles"]),
                       "boundary_sha256": m["boundary"]["sha256"], "config_sha256": m["config_sha256"],
                       "crs_stats": m["crs_stats"], "computed_at": m["computed_at"]},
    }


def _nightlights(nl):
    m = nl["metadata"]
    records = sorted({r for p in m["provenance"].values() for r in p["source_records"]})
    return {
        "unit": nl["unit"], "lit_threshold_nw": nl["lit_threshold_nw"], "base_year": nl["base_year"],
        "latest_year": nl["latest_year"], "years": nl["years"], "growth": nl["growth"],
        "provenance": {"dataset": "wb_len_viirs_monthly", "source_records": records,
                       "annual_sha256": {y: p["annual_sha256"] for y, p in m["provenance"].items()},
                       "boundary_sha256": m["boundary"]["sha256"], "config_sha256": m["config_sha256"],
                       "computed_at": m["computed_at"]},
    }


def main():
    src = manifest.load()
    areas, used = [], {}
    for d in sorted(p for p in PUBLIC_PETA.iterdir() if p.is_dir()):
        kode = d.name
        tf, lf, nf = d / "terrain.json", d / "landcover.json", d / "nightlights.json"
        if not tf.exists() and not lf.exists():
            continue
        rec = {"kode": kode, "level": LEVEL[len(kode)], "prov_code": kode[:2]}
        if tf.exists():
            t = json.loads(tf.read_text())
            rec["name"] = t["name"]
            rec["terrain"] = _terrain(t)
            used.setdefault("copernicus_dem_glo30", set()).update(t["metadata"]["tiles"])
        if lf.exists():
            lc = json.loads(lf.read_text())
            rec.setdefault("name", lc["name"])
            rec["landcover"] = _landcover(lc)
            used.setdefault("esa_worldcover_2021_v200", set()).update(lc["metadata"]["tiles"])
        if nf.exists():
            nl = json.loads(nf.read_text())
            rec["nightlights"] = _nightlights(nl)
            used.setdefault("wb_len_viirs_monthly", set()).update(rec["nightlights"]["provenance"]["source_records"])
        areas.append(rec)

    files = {}
    for ds, keys in used.items():
        files[ds] = {}
        for k in sorted(keys):
            if k not in src["files"][ds]:
                sys.exit(f"export: tile {ds}/{k} used by an area but missing from sources.json")
            files[ds][k] = src["files"][ds][k]
    datasets = {ds: src["datasets"][ds] for ds in used}
    body = {"datasets": datasets, "files": files, "areas": areas}
    raw = json.dumps(body, sort_keys=True, ensure_ascii=False, separators=(",", ":"))
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(raw + "\n")
    digest = hashlib.sha256(OUT.read_bytes()).hexdigest()  # same bytes load_peta hashes
    print(f"export: {len(areas)} areas -> {OUT} ({OUT.stat().st_size // 1024} KB, sha256 {digest[:12]})")


if __name__ == "__main__":
    main()
