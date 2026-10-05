"""Night-lights stats + display layer for one area (yearly series).

Per year, from the province's annual median raster (annual.py):
  * mean radiance (nW/cm²/sr), area-weighted;
  * lit share and lit area: pixels whose annual median is at least the
    threshold (default 1 nW) — robust to background drift;
  * sum of lights above the threshold (radiance × km², an index).
Weights are each ~460 m pixel's geodesic area times the fraction of it inside
the polygon (sub-pixel supersampling), so small kecamatan are not distorted
by pixels that only touch them. Growth is relative to the base year.
"""
import json
import sys

import numpy as np
import rasterio
from pyproj import Geod
from rasterio.features import geometry_mask
from rasterio.transform import Affine
from rasterio.warp import Resampling, reproject
from rasterio.windows import from_bounds
from shapely.geometry import mapping

from common import display, manifest
from common.outlines import get_area, province_name
from common.paths import PUBLIC_PETA
from common.projection import geodesic_area_km2

from . import annual, source

GEOD = Geod(ellps="WGS84")


class NightlightsCheckFailed(RuntimeError):
    pass


def coverage(geom, transform, shape, k: int) -> np.ndarray:
    """Fraction (0..1) of each pixel inside geom, by k x k sub-pixel centres."""
    fine = Affine(transform.a / k, transform.b, transform.c, transform.d, transform.e / k, transform.f)
    inside = geometry_mask([mapping(geom)], out_shape=(shape[0] * k, shape[1] * k), transform=fine, invert=True)
    return inside.reshape(shape[0], k, shape[1], k).mean(axis=(1, 3))


def row_areas_km2(transform, rows: int) -> np.ndarray:
    """Geodesic area of one pixel in each row (km²)."""
    x0, dx = transform.c, transform.a
    out = np.empty(rows)
    for r in range(rows):
        top = transform.f + r * transform.e
        bot = top + transform.e
        area, _ = GEOD.polygon_area_perimeter([x0, x0 + dx, x0 + dx, x0], [top, top, bot, bot])
        out[r] = abs(area) / 1e6
    return out


def _color(values, cfg):
    stops = cfg["render"]["colors"]
    t = np.log1p(np.clip(np.nan_to_num(values, nan=0.0), 0, None)) / np.log1p(cfg["render"]["max_radiance_nw"])
    t = np.clip(t, 0, 1)
    xs = np.linspace(0, 1, len(stops))
    rgb = np.array([[int(c[i:i + 2], 16) for i in (1, 3, 5)] for c in stops], dtype=np.float64)
    return np.round(np.stack([np.interp(t, xs, rgb[:, j]) for j in range(3)], axis=-1)).astype(np.uint8)


def compute(kode: str) -> dict:
    cfg, cfg_sha = annual.load_cfg()
    geom, name, level, outline_meta = get_area(kode)
    data = manifest.load()
    prov = kode[:2]
    thr = cfg["stats"]["lit_threshold_nw"]
    area_geod = geodesic_area_km2(geom)
    years, provenance = {}, {}
    for year in cfg["years"]:
        tif = annual.ensure(prov, year, data)
        meta = json.loads(tif.with_suffix(".json").read_text())
        with rasterio.open(tif) as src:
            w, s, e, n = geom.bounds
            win = from_bounds(w, s, e, n, src.transform).round_offsets().round_lengths()
            win = rasterio.windows.Window(win.col_off - 1, win.row_off - 1, win.width + 2, win.height + 2)
            r = src.read(1, window=win, boundless=True, fill_value=np.nan)
            tr = src.window_transform(win)
        frac = coverage(geom, tr, r.shape, cfg["stats"]["coverage_supersample"])
        wgt = frac * row_areas_km2(tr, r.shape[0])[:, None]
        total = wgt.sum()
        if total <= 0:
            raise NightlightsCheckFailed(f"{kode}: polygon covers no night-lights pixel")
        if abs(total - area_geod) / area_geod * 100 > cfg["stats"]["max_area_diff_pct"]:
            raise NightlightsCheckFailed(f"{kode}: covered pixel area {total:.2f} km² vs polygon {area_geod:.2f} km²")
        valid = np.isfinite(r)
        nod = wgt[~valid].sum() / total * 100
        if nod > cfg["stats"]["max_nodata_pct"]:
            raise NightlightsCheckFailed(f"{kode} {year}: {nod:.2f}% of the area has no cloud-free month")
        rv = np.where(valid, r, 0.0)
        wv = np.where(valid, wgt, 0.0)
        lit = valid & (r >= thr)
        if (rv < 0).any():
            raise NightlightsCheckFailed(f"{kode} {year}: negative radiance in an annual median")
        years[str(year)] = {
            "mean_nw": round(float((rv * wv).sum() / wv.sum()), 4),
            "lit_pct": round(float(wgt[lit].sum() / wv.sum() * 100), 3),
            "lit_km2": round(float(wgt[lit].sum()), 3),
            "sum_lit": round(float((rv * wgt)[lit].sum()), 2),
            "nodata_pct": round(float(nod), 3),
            "months": len(meta["months_used"]),
        }
        provenance[str(year)] = {"annual_sha256": meta["sha256_annual"], "months_used": meta["months_used"],
                                 "source_records": meta["source_records"]}
    base, latest = str(cfg["base_year"]), str(cfg["years"][-1])
    ratio = lambda a, b: round(a / b, 3) if b > 0 else None  # noqa: E731
    growth = {"lit_km2_x": ratio(years[latest]["lit_km2"], years[base]["lit_km2"]),
              "sum_lit_x": ratio(years[latest]["sum_lit"], years[base]["sum_lit"]),
              "lit_pct_change_pp": round(years[latest]["lit_pct"] - years[base]["lit_pct"], 3)}

    # Display layer: the latest year on the shared lon/lat grid (nearest: ~460 m blocks are honest).
    f = display.start_factor(kode, geom, 2048)
    g = display.grid(geom, f)
    with rasterio.open(annual.ensure(prov, int(latest), data)) as src:
        lat = np.full(g.shape, np.nan, dtype=np.float32)
        reproject(rasterio.band(src, 1), lat, dst_transform=g.transform, dst_crs="EPSG:4326",
                  dst_nodata=np.nan, resampling=Resampling.nearest)
    m_d = geometry_mask([mapping(geom)], out_shape=g.shape, transform=g.transform, invert=True)
    alpha = np.where(m_d & np.isfinite(lat), 255, 0).astype(np.uint8)
    img = display.webp(np.dstack([_color(lat, cfg), alpha]), quality=cfg["render"]["webp_quality"])

    ds = manifest.DATASETS[source.DATASET]
    stats = {
        "kode": kode, "name": name, "level": level,
        "provinsi": {"kode": prov, "name": province_name(prov)},
        "area_km2": round(area_geod, 1),
        "unit": "nW/cm²/sr", "lit_threshold_nw": thr,
        "base_year": int(base), "latest_year": int(latest),
        "years": years, "growth": growth,
        "metadata": {
            "dataset": ds["name"], "license": ds["license"], "attribution": ds["attribution"],
            "statistic": "per-pixel median of cloud-free monthly composites ('ops' processing)",
            "weights": "pixel geodesic area × fraction inside the polygon (supersampled)",
            "note": "Cahaya malam menunjukkan permukiman dan aktivitas, bukan jumlah penduduk atau pendapatan.",
            "colors": cfg["render"]["colors"], "max_radiance_nw": cfg["render"]["max_radiance_nw"],
            "boundary": {"source": outline_meta["source"], "sha256": outline_meta["source_sha256"]},
            "provenance": provenance, "config_sha256": cfg_sha, "computed_at": manifest.now_iso(),
        },
    }
    return {"stats": stats, "grid": g, "image": img}


def write(kode: str, result: dict):
    out = PUBLIC_PETA / kode
    out.mkdir(parents=True, exist_ok=True)
    (out / "nightlights.json").write_text(json.dumps(result["stats"], indent=2, ensure_ascii=False) + "\n")
    (out / "nightlights.webp").write_bytes(result["image"])
    display.write_bounds(kode, result["grid"], {"nightlights": "nightlights.webp"})
    sys.stderr.write(f"nightlights: wrote {out}\n")
    return out
