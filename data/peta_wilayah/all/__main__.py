"""Batch run (spec §4.4, Phase 4):

    uv run python -m all --level kabupaten --prov 61 --prov 62 [--layer terrain] [--force] [--evict-tiles]

Resumable: an area is skipped when its outputs exist and record the same boundary
and config hashes as now (stricter than the spec's "newer than inputs": a changed
config or boundary always re-runs, a touched-but-identical file never does).
Every area's outcome goes to cache/logs/batch-<UTC>.jsonl; a guardrail failure or
error is logged and the run moves on. The run stops (logged) only when upstream
bytes changed (SourceChanged) or the disk is near full (DiskLow).

--evict-tiles deletes a cached tile as soon as no remaining area of this run needs
it, bounding disk use to the working set. Hashes stay in sources.json, so a later
download is still verified byte for byte.
"""
import argparse
import hashlib
import json
import sys
import time
import traceback
from datetime import datetime, timezone

from shapely.geometry import shape

from common import cache, manifest, tiles, worldcover
from common.outlines import LEVELS, OUT, ProvinceSkipped, build
from common.paths import CACHE, CONFIG, PUBLIC_PETA
from landcover import compute as lc
from nightlights import compute as nc
from terrain import compute as tc

MODULES = {"terrain": tc, "landcover": lc, "nightlights": nc}
CONFIG_FILE = {"terrain": "terrain.yaml", "landcover": "landcover.yaml", "nightlights": "nightlights.yaml"}
IMAGES = {"terrain": ["hillshade.webp", "elevation.webp", "lowland.webp", "relief.webp"],
          "landcover": ["landcover.webp"], "nightlights": ["nightlights.webp"]}

LEVEL_LEN = {v: k for k, v in LEVELS.items()}  # kabupaten -> 4, kecamatan -> 6
PAD = 0.01


def _sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def areas(prov: str, level: str, log):
    """(kode, name, bounds) for every outline of `level` in `prov` that has a
    Kemendagri name. Nameless codes (stale BIG codes, e.g. 9201) are logged."""
    build(prov)
    fc = json.loads((OUT / prov / f"{level}.geojson").read_text())
    out = []
    for f in fc["features"]:
        k, name = f["properties"]["domain_id"], f["properties"]["name"]
        if not name or name == k:
            log({"kode": k, "layer": "-", "status": "skipped_no_name",
                 "message": "outline code has no Kemendagri name (stale BIG code?)"})
            continue
        out.append((k, name, shape(f["geometry"]).bounds))
    return out


def up_to_date(kode: str, layer: str, boundary_sha: str) -> bool:
    d = PUBLIC_PETA / kode
    js = d / f"{layer}.json"
    if not js.exists() or not (d / "bounds.json").exists():
        return False
    meta = json.loads(js.read_text())
    if meta["metadata"].get("boundary", {}).get("sha256") != boundary_sha:
        return False
    ok = meta["metadata"].get("config_sha256") == _sha(CONFIG / CONFIG_FILE[layer])
    if layer == "terrain":
        ok = ok and meta["classification"].get("rules_sha256") == _sha(CONFIG / "terrain_rules.yaml")
    return ok and all((d / i).exists() for i in IMAGES[layer])


def needed_tiles(bounds, layer):
    w, s, e, n = bounds
    if layer == "terrain":
        return {("copdem", t) for t in tiles.tiles_for_bounds(w - PAD, s - PAD, e + PAD, n + PAD)}
    if layer == "nightlights":
        return set()  # remote windows; the per-province annual rasters are small and kept
    return {("worldcover", t) for t in worldcover.tiles_for_bounds(w, s, e, n)}


def tile_path(kind, name):
    if kind == "copdem":
        return CACHE / "copdem" / f"{name}.tif"
    return CACHE / "worldcover" / f"ESA_WorldCover_10m_2021_v200_{name}_Map.tif"


def main():
    ap = argparse.ArgumentParser(description="Batch terrain/land cover for every area of a level")
    ap.add_argument("--level", choices=["kabupaten", "kecamatan"], required=True)
    ap.add_argument("--prov", action="append", required=True, help="2-digit provinsi (repeatable)")
    ap.add_argument("--layer", action="append", choices=list(MODULES),
                    help="default: terrain and landcover (nightlights must be asked for)")
    ap.add_argument("--force", action="store_true", help="recompute even if up to date")
    ap.add_argument("--evict-tiles", action="store_true", help="delete tiles once no remaining area needs them")
    a = ap.parse_args()
    layers = a.layer or ["terrain", "landcover"]

    logdir = CACHE / "logs"
    logdir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    logpath = logdir / f"batch-{stamp}.jsonl"
    counts = {}

    def log(rec):
        rec = {"at": manifest.now_iso(), **rec}
        with open(logpath, "a") as f:
            f.write(json.dumps(rec, ensure_ascii=False) + "\n")
        counts[rec["status"]] = counts.get(rec["status"], 0) + 1
        if rec["status"] not in ("ok", "up_to_date"):
            sys.stderr.write(f"  [{rec['status']}] {rec.get('kode')} {rec.get('layer')}: {rec.get('message', '')}\n")

    log({"kode": "-", "layer": "-", "status": "run_start",
         "message": json.dumps({"level": a.level, "prov": a.prov, "layers": layers, "force": a.force,
                                "evict_tiles": a.evict_tiles})})

    work = []
    for p in a.prov:
        try:
            meta = build(p)
        except ProvinceSkipped as e:
            log({"kode": p, "layer": "-", "status": "skipped_province", "message": str(e)})
            continue
        for kode, name, bounds in areas(p, a.level, log):
            for layer in layers:
                work.append((kode, name, bounds, layer, meta["source_sha256"]))
    # Tile locality: neighbouring areas share tiles, so evicted tiles are rarely re-fetched.
    work.sort(key=lambda w: (round((w[2][1] + w[2][3]) / 2), round((w[2][0] + w[2][2]) / 2), w[0], w[3]))
    remaining = {}
    for w in work:
        for t in needed_tiles(w[2], w[3]):
            remaining[t] = remaining.get(t, 0) + 1

    sys.stderr.write(f"batch: {len(work)} area-layer jobs, log {logpath}\n")
    stop = None
    for i, (kode, name, bounds, layer, bsha) in enumerate(work, 1):
        t0 = time.time()
        try:
            if not a.force and up_to_date(kode, layer, bsha):
                log({"kode": kode, "layer": layer, "status": "up_to_date"})
            else:
                mod = MODULES[layer]
                r = mod.compute(kode)
                mod.write(kode, r)
                log({"kode": kode, "name": name, "layer": layer, "status": "ok",
                     "seconds": round(time.time() - t0, 1)})
        except (tc.TerrainCheckFailed, lc.LandcoverCheckFailed, nc.NightlightsCheckFailed) as e:
            log({"kode": kode, "name": name, "layer": layer, "status": "failed_check", "message": str(e)})
        except (cache.SourceChanged, cache.DiskLow) as e:
            log({"kode": kode, "name": name, "layer": layer, "status": "run_stopped", "message": str(e)})
            stop = e
            break
        except Exception as e:  # noqa: BLE001 — log and continue with the next area
            log({"kode": kode, "name": name, "layer": layer, "status": "error",
                 "message": f"{type(e).__name__}: {e}",
                 "trace": traceback.format_exc(limit=3)})
        sys.stderr.write(f"batch: {i}/{len(work)} {kode} {layer} ({time.time() - t0:.0f}s)\n")
        for t in needed_tiles(bounds, layer):
            remaining[t] -= 1
            if a.evict_tiles and remaining[t] == 0:
                tile_path(*t).unlink(missing_ok=True)

    log({"kode": "-", "layer": "-", "status": "run_end", "message": json.dumps(counts)})
    sys.stderr.write(f"batch: done {counts} -> {logpath}\n")
    sys.exit(2 if stop else (1 if counts.get("error") or counts.get("failed_check") else 0))


if __name__ == "__main__":
    main()
