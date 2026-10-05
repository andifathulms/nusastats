"""uv run python -m nightlights --kode 6409 [--kode …]

Yearly night-lights stats + latest-year layer. The first area of a province
builds that province's annual rasters (12 monthly remote windows per year).
"""
import argparse
import json
import sys

from .compute import NightlightsCheckFailed, compute, write

ap = argparse.ArgumentParser(description="Night lights (VIIRS, World Bank Light Every Night) for an area")
ap.add_argument("--kode", action="append", required=True)
a = ap.parse_args()
failed = 0
for kode in a.kode:
    try:
        r = compute(kode)
    except NightlightsCheckFailed as e:
        sys.stderr.write(f"nightlights: FAILED {e}\n")
        failed += 1
        continue
    write(kode, r)
    st = r["stats"]
    print(json.dumps({"kode": st["kode"], "name": st["name"], "years": st["years"], "growth": st["growth"]},
                     ensure_ascii=False, indent=1))
sys.exit(1 if failed else 0)
