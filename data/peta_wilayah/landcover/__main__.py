"""uv run python -m landcover --kode 6409 [--kode …]

One command from an empty cache (BIG desa archive assumed present): outline,
WorldCover tile index + tiles, stats, and frontend/public/peta/{kode}/landcover.*
"""
import argparse
import json
import sys

from .compute import LandcoverCheckFailed, compute, write

ap = argparse.ArgumentParser(description="Land cover stats + coloured layer for an area")
ap.add_argument("--kode", action="append", required=True, help="Kemendagri kode (2/4/6 digits)")
a = ap.parse_args()

failed = 0
for kode in a.kode:
    try:
        r = compute(kode)
    except LandcoverCheckFailed as e:
        sys.stderr.write(f"landcover: FAILED {e}\n")
        failed += 1
        continue
    write(kode, r)
    st = r["stats"]
    print(json.dumps({"kode": st["kode"], "name": st["name"], "dominant": st["dominant"],
                      "classes": [(c["label"], c["share_pct"], c["area_km2"]) for c in st["classes"]],
                      "checks": st["checks"]}, ensure_ascii=False, indent=2))
sys.exit(1 if failed else 0)
