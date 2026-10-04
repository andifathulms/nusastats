"""uv run python -m outlines --prov 64 [--prov 65 …] [--all] [--force]"""
import argparse
import sys

from common.outlines import ProvinceSkipped, build
from common.paths import BIG_DIR, PUBLIC

ap = argparse.ArgumentParser(description="Dissolve BIG desa into full-detail kec/kab/prov outlines")
ap.add_argument("--prov", action="append", default=[], help="2-digit provinsi code (repeatable)")
ap.add_argument("--all", action="store_true", help="every provinsi in the display province file")
ap.add_argument("--force", action="store_true")
a = ap.parse_args()

provs = a.prov
if a.all:
    import json
    fc = json.loads((PUBLIC / "dukcapil-provinces.geojson").read_text())
    provs = sorted(f["properties"]["domain_id"] for f in fc["features"])
if not provs:
    ap.error("give --prov or --all")
skipped = []
for p in provs:
    try:
        build(p, force=a.force)
    except ProvinceSkipped:
        skipped.append(p)
if skipped:
    sys.stderr.write(f"skipped provinsi: {', '.join(skipped)} (see cache/outlines/skipped.json)\n")
