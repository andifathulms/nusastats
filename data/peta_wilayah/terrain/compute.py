"""Terrain stats + display layers for one area (docs/FEATURE-peta-wilayah.md §4.3, §5.1).

Two grids, each used for what it is good at:

* **UTM (equal-area, 30 m)** — every share, percentile and slope. Pixels have
  equal area, so a pixel share is an area share. Zone from the polygon centroid.
* **Native DEM lon/lat grid** — min / max / highest point, read from the source
  pixels themselves (resampling would shave peaks).
* **Display lon/lat grid** — hillshade + hypsometric tint, rendered on a regular
  EPSG:4326 grid because the frontend SVG map projects linearly in lon/lat, so
  the image stretched over `bounds.json` lines up with the outlines exactly.

Every guardrail failure raises before any output is written.
"""
import hashlib
import json
import math
import sys

import numpy as np
import rasterio
import yaml
from rasterio.features import geometry_mask
from rasterio.merge import merge
from rasterio.transform import from_origin
from rasterio.warp import Resampling, reproject
from shapely.geometry import mapping

from common import display, manifest, tiles
from common.outlines import get_area, province_name
from common.paths import CONFIG, PUBLIC_PETA
from common.raster import snap_bounds
from common.projection import geodesic_area_km2, to_crs, utm_epsg

from . import dem, rules

WGS84_A = 6378137.0
WGS84_E2 = 6.69437999014e-3


class TerrainCheckFailed(RuntimeError):
    pass


def _cfg():
    raw = (CONFIG / "terrain.yaml").read_bytes()
    return yaml.safe_load(raw), hashlib.sha256(raw).hexdigest()


def _m_per_deg(lat_deg):
    """Metres per degree of longitude and latitude on the WGS84 ellipsoid."""
    phi = np.radians(lat_deg)
    w = 1 - WGS84_E2 * np.sin(phi) ** 2
    lon = math.pi / 180 * WGS84_A * np.cos(phi) / np.sqrt(w)
    lat = math.pi / 180 * WGS84_A * (1 - WGS84_E2) / w ** 1.5
    return lon, lat


def _mosaic(names, bounds):
    srcs = [rasterio.open(p) for p in names]
    try:
        nod = srcs[0].nodata
        bounds = snap_bounds(srcs[0].transform, bounds)
        arr, transform = merge(srcs, bounds=bounds, nodata=nod if nod is not None else -32767.0,
                               dtype="float32")
        z = arr[0].astype(np.float32)
        if nod is not None:
            z[z == nod] = np.nan
        else:
            z[z == -32767.0] = np.nan
        return z, transform, srcs[0].crs, srcs[0].res, srcs[0].tags()
    finally:
        for s in srcs:
            s.close()


def _shares(values, breaks):
    """% of values in [-inf,b0), [b0,b1), …, [bn,inf)."""
    edges = [-np.inf, *breaks, np.inf]
    n = values.size
    return [float(np.count_nonzero((values >= lo) & (values < hi)) * 100.0 / n)
            for lo, hi in zip(edges[:-1], edges[1:])]


def _band_labels(breaks):
    labs = [f"<{breaks[0]}"]
    labs += [f"{a}-{b}" for a, b in zip(breaks[:-1], breaks[1:])]
    return labs + [f">={breaks[-1]}"]


def compute(kode: str) -> dict:
    cfg, cfg_sha = _cfg()
    rules_cfg, rules_sha = rules.load()
    sc, rc = cfg["stats"], cfg["render"]

    geom, name, level, outline_meta = get_area(kode)
    w, s, e, n = geom.bounds
    pad = sc["pad_deg"]
    data = manifest.load()

    # --- tiles -----------------------------------------------------------------
    index = tiles.tile_index(data)
    wanted = tiles.tiles_for_bounds(w - pad, s - pad, e + pad, n + pad)
    present = [t for t in wanted if t in index]
    ocean = [t for t in wanted if t not in index]
    if not present:
        raise TerrainCheckFailed(f"{kode}: no DEM tiles published for bbox {geom.bounds}")
    paths, tile_recs = [], {}
    for t in present:
        p, rec = tiles.fetch_tile(t, data)
        paths.append(p)
        tile_recs[t] = rec["sha256"]

    z, ztr, zcrs, _res, ztags = _mosaic(paths, (w - pad, s - pad, e + pad, n + pad))

    # --- native grid: true min / max / highest point ------------------------------
    m_nat = geometry_mask([mapping(geom)], out_shape=z.shape, transform=ztr, invert=True)
    nat = np.where(m_nat, z, np.nan)
    if not np.isfinite(nat).any():
        raise TerrainCheckFailed(f"{kode}: polygon has no DEM pixels")
    imax = np.unravel_index(np.nanargmax(nat), nat.shape)
    hx, hy = ztr * (imax[1] + 0.5, imax[0] + 0.5)

    # --- UTM equal-area grid: shares, percentiles, slope --------------------------
    c = geom.centroid
    epsg = utm_epsg(c.x, c.y)
    g_utm = to_crs(geom, epsg)
    px = float(sc["utm_pixel_m"])
    ux0, uy0, ux1, uy1 = g_utm.bounds
    x0 = math.floor(ux0 / px) * px - 2 * px
    y1 = math.ceil(uy1 / px) * px + 2 * px
    uw = int(math.ceil((ux1 - x0) / px)) + 2
    uh = int(math.ceil((y1 - uy0) / px)) + 2
    utr = from_origin(x0, y1, px, px)
    zu = np.full((uh, uw), np.nan, dtype=np.float32)
    reproject(z, zu, src_transform=ztr, src_crs=zcrs, src_nodata=np.nan,
              dst_transform=utr, dst_crs=f"EPSG:{epsg}", dst_nodata=np.nan,
              resampling=Resampling[sc["resampling"]])
    m_utm = geometry_mask([mapping(g_utm)], out_shape=zu.shape, transform=utr, invert=True)
    slope = dem.slope_deg(zu.astype(np.float64), px, px)

    n_poly = int(m_utm.sum())
    ev = zu[m_utm & np.isfinite(zu)].astype(np.float64)
    sv = slope[m_utm & np.isfinite(slope)]
    nodata_pct = (n_poly - ev.size) * 100.0 / n_poly

    # --- guardrails ------------------------------------------------------------------
    area_geod = geodesic_area_km2(geom)
    area_utm = g_utm.area / 1e6
    area_px = n_poly * px * px / 1e6
    d_utm = (area_utm - area_geod) / area_geod * 100
    d_px = (area_px - area_utm) / area_utm * 100
    problems = []
    if nodata_pct > sc["max_nodata_pct"]:
        problems.append(f"{nodata_pct:.3f}% of the polygon has no DEM value (max {sc['max_nodata_pct']}%)")
    if abs(d_utm) > sc["max_area_diff_pct"]:
        problems.append(f"UTM polygon area differs from geodesic by {d_utm:.2f}%")
    if abs(d_px) > sc["max_area_diff_pct"]:
        problems.append(f"pixel area differs from UTM polygon area by {d_px:.2f}%")
    if ev.size == 0 or sv.size == 0:
        problems.append("no valid elevation/slope pixels")
    if problems:
        raise TerrainCheckFailed(f"{kode}: " + "; ".join(problems))

    p5, p50, p95 = (float(v) for v in np.percentile(ev, [5, 50, 95]))
    relief = p95 - p5
    bands = _shares(ev, sc["elevation_bands_m"])
    slopes = _shares(sv, sc["slope_breaks_deg"])
    for label, sh in (("elevation bands", bands), ("slope classes", slopes)):
        if abs(sum(sh) - 100.0) > 0.01:
            raise TerrainCheckFailed(f"{kode}: {label} sum to {sum(sh):.3f}%")
    if relief < 0:
        raise TerrainCheckFailed(f"{kode}: negative relief {relief}")

    metrics = {
        "share_elev_ge_1000": float(np.count_nonzero(ev >= 1000) * 100.0 / ev.size),
        "share_elev_ge_200": float(np.count_nonzero(ev >= 200) * 100.0 / ev.size),
        "share_elev_lt_100": float(np.count_nonzero(ev < 100) * 100.0 / ev.size),
        "share_slope_ge_25": float(np.count_nonzero(sv >= 25) * 100.0 / sv.size),
        "share_slope_ge_8": float(np.count_nonzero(sv >= 8) * 100.0 / sv.size),
        "share_slope_lt_8": float(np.count_nonzero(sv < 8) * 100.0 / sv.size),
    }
    t_class, t_label, t_reason = rules.classify(metrics, rules_cfg)

    # --- display layers (shared EPSG:4326 grid, see common/display.py) -------------
    f = display.start_factor(kode, geom, rc["max_px"])
    hs_cfg = rc["hillshade"]
    while True:
        g = display.grid(geom, f)
        zd = np.full(g.shape, np.nan, dtype=np.float32)
        reproject(z, zd, src_transform=ztr, src_crs=zcrs, src_nodata=np.nan,
                  dst_transform=g.transform, dst_crs=zcrs, dst_nodata=np.nan,
                  resampling=Resampling.average)
        mlon, mlat = _m_per_deg(g.row_lats())
        hs = dem.hillshade(zd.astype(np.float64), mlon * g.pixel_deg, float(np.mean(mlat)) * g.pixel_deg,
                           hs_cfg["azimuth_deg"], hs_cfg["altitude_deg"], hs_cfg["z_factor"])
        m_d = geometry_mask([mapping(geom)], out_shape=g.shape, transform=g.transform, invert=True)
        alpha = np.where(m_d & np.isfinite(zd), 255, 0).astype(np.uint8)
        gray = np.round(np.nan_to_num(hs, nan=1.0) * 255).astype(np.uint8)
        hs_rgba = np.dstack([gray, gray, gray, np.where(np.isfinite(hs), alpha, 0)])
        el_rgba = np.dstack([dem.tint(zd, rc["tint"]), alpha])
        hs_bytes = display.webp(hs_rgba, quality=rc["webp_quality"])
        el_bytes = display.webp(el_rgba, quality=rc["webp_quality"])
        if max(len(hs_bytes), len(el_bytes)) <= rc["max_bytes"]:
            break
        f += 1

    r1 = lambda v: round(float(v), 1)  # noqa: E731
    r2 = lambda v: round(float(v), 2)  # noqa: E731
    ds = manifest.DATASETS[tiles.DATASET]
    stats = {
        "kode": kode, "name": name, "level": level,
        "provinsi": {"kode": kode[:2], "name": province_name(kode[:2])},
        "area_km2": r1(area_geod),
        "elevation_m": {"min": r1(np.nanmin(nat)), "max": r1(np.nanmax(nat)), "mean": r1(ev.mean()),
                        "median": r1(p50), "p5": r1(p5), "p95": r1(p95)},
        "relief_m": r1(relief),
        "highest_point": {"elevation_m": r1(nat[imax]), "lon": round(hx, 5), "lat": round(hy, 5)},
        "elevation_bands_pct": dict(zip(_band_labels(sc["elevation_bands_m"]), map(r2, bands))),
        "slope_deg": {"mean": r2(sv.mean())},
        "slope_classes_pct": dict(zip(_band_labels(sc["slope_breaks_deg"]), map(r2, slopes))),
        "metrics_pct": {k: r2(v) for k, v in metrics.items()},
        "terrain_class": t_class,
        "terrain_class_label": t_label,
        "terrain_class_reason": t_reason,
        "classification": {"official": False,
                           "note": "Klasifikasi NusaStats (aturan di config/terrain_rules.yaml), bukan klasifikasi resmi.",
                           "rules_sha256": rules_sha},
        "checks": {
            "area_geodesic_km2": r2(area_geod), "area_utm_polygon_km2": r2(area_utm),
            "area_utm_pixels_km2": r2(area_px), "utm_vs_geodesic_pct": round(d_utm, 3),
            "pixels_vs_utm_pct": round(d_px, 3), "nodata_pct": round(nodata_pct, 4),
            "polygon_pixels_utm": n_poly,
        },
        "metadata": {
            "dataset": ds["name"], "dataset_type": ds["type"], "vertical_datum": ds["vertical_datum"],
            "year": ds["year"], "attribution": ds["attribution"],
            "tile_version_tag": {k: v for k, v in ztags.items() if "version" in k.lower()} or None,
            "tiles": tile_recs, "ocean_tiles_absent": ocean,
            "boundary": {"source": outline_meta["source"], "sha256": outline_meta["source_sha256"],
                         "method": outline_meta["method"]},
            "crs_stats": f"EPSG:{epsg}", "pixel_size_m": px, "resampling_to_utm": sc["resampling"],
            "min_max_from": "native DEM pixels (EPSG:4326, 1 arc-second) inside the polygon",
            "shares_from": f"{px:g} m UTM pixels (EPSG:{epsg}) whose centre lies inside the polygon",
            "slope_method": "Horn 3x3 on the UTM grid",
            "hillshade": hs_cfg,
            "tint": rc["tint"],  # hypsometric stops [m, hex] used for elevation.webp (legend source)
            "config_sha256": cfg_sha,
            "computed_at": manifest.now_iso(),
        },
    }
    return {"stats": stats, "grid": g,
            "images": {"hillshade.webp": hs_bytes, "elevation.webp": el_bytes}}


def write(kode: str, result: dict):
    out = PUBLIC_PETA / kode
    out.mkdir(parents=True, exist_ok=True)
    (out / "terrain.json").write_text(json.dumps(result["stats"], indent=2, ensure_ascii=False) + "\n")
    for fn, b in result["images"].items():
        (out / fn).write_bytes(b)
    display.write_bounds(kode, result["grid"], {"hillshade": "hillshade.webp", "elevation": "elevation.webp"})
    sys.stderr.write(f"terrain: wrote {out}\n")
    return out
