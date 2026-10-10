"""uv run python -m desa --kode 7371 [--kode …] | --prov 73

Per-desa lowland and night-lights shares for a kabupaten (desa/compute.py),
written to frontend/public/peta/{kode}/desa.json. Needs the terrain and
night-lights caches for the province (run those steps first); `--prov` runs
every kabupaten of a province that already has terrain.json.
"""
import argparse
import sys

from common.paths import PUBLIC_PETA

from .compute import DesaCheckFailed, compute, write

ap = argparse.ArgumentParser(description="Per-desa lowland + night-lights shares")
ap.add_argument("--kode", action="append", default=[], help="Kemendagri kabupaten kode (4 digits)")
ap.add_argument("--prov", help="every kabupaten of this province with terrain.json")
a = ap.parse_args()
kodes = list(a.kode)
if a.prov:
    kodes += sorted(p.name for p in PUBLIC_PETA.glob(f"{a.prov}??") if (p / "terrain.json").exists())
if not kodes:
    ap.error("give --kode or --prov")

failed = 0
for kode in kodes:
    try:
        r = compute(kode)
    except DesaCheckFailed as e:
        sys.stderr.write(f"desa: FAILED {e}\n")
        failed += 1
        continue
    write(kode, r)
    lit = [d["lit_pct"] for d in r["desa"].values() if d["lit_pct"] is not None]
    print(f"desa: {kode} {r['name']}: {r['desa_count']} desa, {len(lit)} with lights")
sys.exit(1 if failed else 0)
