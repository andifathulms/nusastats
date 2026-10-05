"""Annual night-lights rasters per province: the per-pixel MEDIAN of the
cloud-free monthly composites of a year.

Why the median: Indonesian months often have 0-2 cloud-free nights per
pixel, and short-lived lights (fires, flaring, events) inflate a mean.
The median of the months that have at least one cloud-free night is
deterministic and drops those spikes. Pixels with no cloud-free month in
the year are NaN, never zero.

Cached (git-ignored) as cache/nightlights/{prov}/{year}.tif + .json; the JSON
lists every monthly window read (record keys into sources.json, each
holding the window's sha256) and the sha256 of the annual array itself.
"""
import hashlib
import json
import math
import sys
import warnings
from pathlib import Path

import numpy as np
import rasterio
import yaml
from rasterio.transform import Affine
from shapely.geometry import shape

from common import manifest
from common.outlines import OUT as OUTLINES, build
from common.paths import CACHE, CONFIG

from . import source

ANNUAL = CACHE / "nightlights"
# The global composites share one grid (checked on read): 15 arc-seconds,
# pixel-edge origin at -180.00208333335, 75.00208333335.
RES = 0.0041666667
ORIGIN_X, ORIGIN_Y = -180.00208333335, 75.00208333335


def load_cfg():
    raw = (CONFIG / "nightlights.yaml").read_bytes()
    return yaml.safe_load(raw), hashlib.sha256(raw).hexdigest()


def annual_key(cfg) -> str:
    """Cache key for annual rasters: only the settings that shape them (the
    `annual` section). Editing stats/render settings must not throw away hours
    of remote window reads."""
    return hashlib.sha256(json.dumps(cfg["annual"], sort_keys=True).encode()).hexdigest()


def province_bounds(prov: str, pad: float):
    build(prov)
    g = shape(json.loads((OUTLINES / prov / "provinsi.geojson").read_text())["features"][0]["geometry"])
    w, s, e, n = g.bounds
    w, s, e, n = w - pad, s - pad, e + pad, n + pad
    # Snap outward onto the source grid so every read is whole source pixels.
    return (ORIGIN_X + math.floor((w - ORIGIN_X) / RES) * RES, ORIGIN_Y - math.ceil((ORIGIN_Y - s) / RES) * RES,
            ORIGIN_X + math.ceil((e - ORIGIN_X) / RES) * RES, ORIGIN_Y - math.floor((ORIGIN_Y - n) / RES) * RES)


def annual_median(radiance: np.ndarray, cloud_free: np.ndarray):
    """(median, n_valid_months): median over months with >=1 cloud-free night."""
    valid = cloud_free > 0
    stack = np.where(valid, radiance.astype(np.float64), np.nan)
    n = valid.sum(axis=0)
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", RuntimeWarning)  # all-NaN pixels: handled just below
        med = np.nanmedian(stack, axis=0) if stack.shape[0] else np.full(radiance.shape[1:], np.nan)
    return np.where(n > 0, med, np.nan).astype(np.float32), n.astype(np.uint8)


def ensure(prov: str, year: int, data: dict, force: bool = False) -> Path:
    """Path to the annual raster for (prov, year), building it if missing or stale."""
    cfg, _cfg_sha = load_cfg()
    key = annual_key(cfg)
    d = ANNUAL / prov
    tif, meta_p = d / f"{year}.tif", d / f"{year}.json"
    if not force and tif.exists() and meta_p.exists():
        meta = json.loads(meta_p.read_text())
        if meta.get("annual_config_sha256") == key:
            return tif
    bounds = province_bounds(prov, cfg["annual"]["window_pad_deg"])
    month_dirs = source.months(year)
    plan, skipped = [], {}
    for mdir in month_dirs:
        k = source.keys(mdir)
        if k is None:
            skipped[mdir.split("_")[1]] = "no 'ecm-slcorr' product under that name (other naming scheme); not substituted"
        else:
            plan.append((mdir, k))
    if len(plan) < cfg["annual"]["min_months"]:
        raise ValueError(f"{year}: only {len(plan)} usable months (min {cfg['annual']['min_months']})")
    sys.stderr.write(f"nightlights: provinsi {prov} {year}: reading {len(plan)} months"
                     f"{f' (skipped {sorted(skipped)})' if skipped else ''}…\n")
    rads, cfs, used, tr = [], [], [], None
    for mdir, k in plan:
        ym = mdir.split("_")[1]
        r, t1 = source.read_window(k["avg_rade9"], bounds, f"{ym}/avg_rade9@{prov}", data)
        c, t2 = source.read_window(k["n_cf"], bounds, f"{ym}/n_cf@{prov}", data)
        if t1 != t2 or r.shape != c.shape or abs(t1.a - RES) > 1e-9:
            raise ValueError(f"{ym}: unexpected grid {t1} / {t2}")
        rads.append(r); cfs.append(c); used.append(ym); tr = t1
    med, n = annual_median(np.stack(rads), np.stack(cfs))
    d.mkdir(parents=True, exist_ok=True)
    profile = {"driver": "GTiff", "dtype": "float32", "count": 1, "width": med.shape[1], "height": med.shape[0],
               "crs": "EPSG:4326", "transform": Affine(*tr[:6]), "nodata": float("nan"), "compress": "deflate",
               "tiled": True}
    with rasterio.open(tif, "w", **profile) as dst:
        dst.write(med, 1)
    meta = {"prov": prov, "year": year, "months_used": used, "months_skipped": skipped,
            "statistic": cfg["annual"]["statistic"],
            "window_bounds": [round(b, 8) for b in bounds],
            "source_records": [f"{ym}/{b}@{prov}" for ym in used for b in ("avg_rade9", "n_cf")],
            "sha256_annual": hashlib.sha256(med.tobytes()).hexdigest(),
            "pixels_no_cloud_free_month_pct": round(float((n == 0).mean() * 100), 3),
            "annual_config_sha256": key, "built_at": manifest.now_iso()}
    meta_p.write_text(json.dumps(meta, indent=2) + "\n")
    return tif
