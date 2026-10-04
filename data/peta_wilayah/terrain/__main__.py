"""uv run python -m terrain --kode 6409 [--kode …]

One command from an empty cache: builds the full-detail outline for the
province (if missing), fetches the tile index and the intersecting DEM tiles,
computes stats, and writes frontend/public/peta/{kode}/.
"""
import argparse
import json
import sys

from .compute import TerrainCheckFailed, compute, write

ap = argparse.ArgumentParser(description="Terrain stats + hillshade/elevation layers for an area")
ap.add_argument("--kode", action="append", required=True, help="Kemendagri kode (2/4/6 digits)")
a = ap.parse_args()

failed = 0
for kode in a.kode:
    try:
        r = compute(kode)
    except TerrainCheckFailed as e:
        sys.stderr.write(f"terrain: FAILED {e}\n")
        failed += 1
        continue
    write(kode, r)
    st = r["stats"]
    print(json.dumps({k: st[k] for k in ("kode", "name", "area_km2", "elevation_m", "relief_m",
                                         "terrain_class_reason", "checks")}, ensure_ascii=False, indent=2))
sys.exit(1 if failed else 0)
