"""Per-desa terrain and night-lights shares for one kabupaten/kecamatan, so
cards can weigh them by population ("penduduk di dataran rendah", "penduduk vs
cahaya malam"). Population itself is NOT stored here: it stays in Dukcapil and
is joined at render time by desa code.

Per desa (full-resolution BIG polygons, the same ones the outlines dissolve):
  * lowland: % of the desa under 5 m and under 10 m, on the same 30 m UTM
    equal-area grid and DEM resampling as the terrain step (so pixel share is
    area share; surface model, so canopy and roofs read high = a lower bound);
  * lights: % of the desa lit (annual median >= the night-lights threshold) and
    mean radiance in the latest year, weighted by pixel geodesic area x the
    fraction of the ~460 m pixel inside the desa (sub-pixel supersampling, as
    in the night-lights step).

Guardrails (raise before writing): every BIG desa of the area gets a row; the
desa pixels add up to the area's pixels; shares stay within 0..100.
"""
import json
import math

import numpy as np
import rasterio
from rasterio.features import rasterize
from rasterio.transform import from_origin
from rasterio.warp import Resampling, reproject
from rasterio.windows import from_bounds
from shapely.geometry import mapping

from common import manifest, tiles
from common.outlines import desa_of, get_area, province_name
from common.paths import PUBLIC_PETA
from common.projection import geodesic_area_km2, to_crs, utm_epsg
from nightlights import annual
from nightlights.compute import coverage, row_areas_km2
from terrain.compute import _cfg as terrain_cfg
from terrain.compute import _mosaic


class DesaCheckFailed(RuntimeError):
    pass


def label_shares(labels: np.ndarray, z: np.ndarray, n: int, breaks) -> dict:
    """For labels 1..n on a grid, per label: valid pixel count and the % of
    valid pixels below each break. Pure numpy (tested)."""
    valid = np.isfinite(z) & (labels > 0)
    lab = labels[valid]
    vals = z[valid]
    count = np.bincount(lab, minlength=n + 1)
    out = {"count": count}
    for b in breaks:
        below = np.bincount(lab[vals < b], minlength=n + 1)
        with np.errstate(invalid="ignore", divide="ignore"):
            out[b] = np.where(count > 0, below * 100.0 / np.maximum(count, 1), np.nan)
    return out


def _lowland(kode, geom, desa, data):
    cfg, cfg_sha = terrain_cfg()
    sc = cfg["stats"]
    lo5, lo10 = sc["lowland_m"]
    w, s, e, n = geom.bounds
    pad = sc["pad_deg"]
    index = tiles.tile_index(data)
    present = [t for t in tiles.tiles_for_bounds(w - pad, s - pad, e + pad, n + pad) if t in index]
    if not present:
        raise DesaCheckFailed(f"{kode}: no DEM tiles for the area")
    paths, tile_sha = [], {}
    for t in present:
        p, rec = tiles.fetch_tile(t, data)
        paths.append(p)
        tile_sha[t] = rec["sha256"]
    z, ztr, zcrs, _res, _tags = _mosaic(paths, (w - pad, s - pad, e + pad, n + pad))

    c = geom.centroid
    epsg = utm_epsg(c.x, c.y)
    px = float(sc["utm_pixel_m"])
    g_utm = to_crs(geom, epsg)
    ux0, uy0, ux1, uy1 = g_utm.bounds
    x0 = math.floor(ux0 / px) * px - 2 * px
    y1 = math.ceil(uy1 / px) * px + 2 * px
    uw = int(math.ceil((ux1 - x0) / px)) + 2
    uh = int(math.ceil((y1 - uy0) / px)) + 2
    utr = from_origin(x0, y1, px, px)
    zu = np.full((uh, uw), np.nan, dtype=np.float32)
    reproject(z, zu, src_transform=ztr, src_crs=zcrs, src_nodata=np.nan, dst_transform=utr,
              dst_crs=f"EPSG:{epsg}", dst_nodata=np.nan, resampling=Resampling[sc["resampling"]])
    shapes = [(mapping(to_crs(g, epsg)), i + 1) for i, (_c, g) in enumerate(desa)]
    labels = rasterize(shapes, out_shape=zu.shape, transform=utr, fill=0, dtype="int32")
    area_mask = rasterize([(mapping(g_utm), 1)], out_shape=zu.shape, transform=utr, fill=0, dtype="uint8")
    sh = label_shares(labels, zu, len(desa), [lo5, lo10])
    # Desa tile the area: their pixels must add up to the area's (rasterisation
    # of shared edges can differ by a few pixels; more means a gap or overlap).
    area_px = int(np.count_nonzero(area_mask & np.isfinite(zu)))
    desa_px = int(sh["count"][1:].sum())
    if area_px == 0 or abs(desa_px - area_px) / area_px > 0.01:
        raise DesaCheckFailed(f"{kode}: desa pixels {desa_px} vs area pixels {area_px}")
    rows = {code: {"px": int(sh["count"][i + 1]),
                   f"lt_{lo5}_pct": None if np.isnan(sh[lo5][i + 1]) else round(float(sh[lo5][i + 1]), 2),
                   f"lt_{lo10}_pct": None if np.isnan(sh[lo10][i + 1]) else round(float(sh[lo10][i + 1]), 2)}
            for i, (code, _g) in enumerate(desa)}
    meta = {"grid": f"UTM EPSG:{epsg}, {int(px)} m, {sc['resampling']}", "breaks_m": [lo5, lo10],
            "dem_tiles_sha256": tile_sha, "terrain_config_sha256": cfg_sha,
            "note": "Model permukaan: tajuk pohon dan bangunan terbaca lebih tinggi, jadi porsi dataran rendah adalah batas bawah."}
    return rows, meta


def _lights(kode, geom, desa, data):
    cfg, cfg_sha = annual.load_cfg()
    thr = cfg["stats"]["lit_threshold_nw"]
    k = cfg["stats"]["coverage_supersample"]
    year = cfg["years"][-1]
    tif = annual.ensure(kode[:2], year, data)
    tmeta = json.loads(tif.with_suffix(".json").read_text())
    rows = {}
    with rasterio.open(tif) as src:
        for code, g in desa:
            w, s, e, n = g.bounds
            win = from_bounds(w, s, e, n, src.transform).round_offsets().round_lengths()
            win = rasterio.windows.Window(win.col_off - 1, win.row_off - 1, win.width + 2, win.height + 2)
            r = src.read(1, window=win, boundless=True, fill_value=np.nan)
            tr = src.window_transform(win)
            wgt = coverage(g, tr, r.shape, k) * row_areas_km2(tr, r.shape[0])[:, None]
            valid = np.isfinite(r) & (wgt > 0)
            wv = wgt[valid].sum()
            if wv <= 0:
                rows[code] = {"lit_pct": None, "mean_nw": None}
                continue
            rv = np.clip(r[valid], 0.0, None)
            rows[code] = {"lit_pct": round(float(wgt[valid][r[valid] >= thr].sum() / wv * 100), 2),
                          "mean_nw": round(float((rv * wgt[valid]).sum() / wv), 3)}
    meta = {"year": year, "lit_threshold_nw": thr, "supersample": k, "annual_sha256": tmeta["sha256_annual"],
            "nightlights_config_sha256": cfg_sha}
    return rows, meta


def compute(kode: str) -> dict:
    geom, name, level, outline_meta = get_area(kode)
    desa, archive_sha = desa_of(kode)
    if not desa:
        raise DesaCheckFailed(f"{kode}: no BIG desa polygons")
    data = manifest.load()
    low, low_meta = _lowland(kode, geom, desa, data)
    lit, lit_meta = _lights(kode, geom, desa, data)
    rows = {}
    for code, g in desa:
        r = {"area_km2": round(geodesic_area_km2(g), 4), **low[code], **lit[code]}
        for key, v in r.items():
            if key.endswith("_pct") and v is not None and not (0 <= v <= 100):
                raise DesaCheckFailed(f"{kode}: desa {code} {key} = {v}")
        rows[code] = r
    return {
        "kode": kode, "name": name, "level": level,
        "provinsi": {"kode": kode[:2], "name": province_name(kode[:2])},
        "desa_count": len(rows), "desa": rows,
        "metadata": {
            "boundary": {"source": outline_meta["source"], "archive_sha256": archive_sha,
                         "note": "Full-resolution BIG desa polygons; desa codes = Kemendagri (Dukcapil) codes."},
            "lowland": low_meta, "lights": lit_meta, "computed_at": manifest.now_iso(),
        },
    }


def write(kode: str, result: dict):
    out = PUBLIC_PETA / kode
    out.mkdir(parents=True, exist_ok=True)
    (out / "desa.json").write_text(json.dumps(result, ensure_ascii=False, separators=(",", ":")) + "\n")
