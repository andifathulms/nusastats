"""Land cover stats + display layer for one area (docs/FEATURE-peta-wilayah.md §4.3, §5.3).

* **Stats on a 10 m UTM grid** (zone from the polygon centroid), nearest-neighbour
  so class codes are never blended. Equal-area pixels make a pixel share an
  area share; class km² = share × the polygon's geodesic area, so the classes
  add up to `area_km2` exactly.
* **Display on the shared EPSG:4326 grid** (common/display.py), mode-resampled,
  coloured with the official palette and saved as *lossless* WebP; the decoded
  image is then checked pixel by pixel against the palette.

Every guardrail failure raises before any output is written.
"""
import hashlib
import io
import json
import math
import sys

import numpy as np
import rasterio
import yaml
from PIL import Image
from rasterio.features import geometry_mask
from rasterio.merge import merge
from rasterio.transform import from_origin
from rasterio.warp import Resampling, reproject
from shapely.geometry import mapping

from common import display, manifest, worldcover
from common.outlines import get_area, province_name
from common.paths import CONFIG, PUBLIC_PETA
from common.projection import geodesic_area_km2, to_crs, utm_epsg

NODATA = 0


class LandcoverCheckFailed(RuntimeError):
    pass


def _cfg():
    raw = (CONFIG / "landcover.yaml").read_bytes()
    return yaml.safe_load(raw), hashlib.sha256(raw).hexdigest()


def _hex(c: str):
    return tuple(int(c[k:k + 2], 16) for k in (1, 3, 5))


def lut(classes) -> np.ndarray:
    """256x4 RGBA lookup: class code -> official colour (code 0 / unknown -> transparent)."""
    t = np.zeros((256, 4), dtype=np.uint8)
    for c in classes:
        t[c["code"]] = (*_hex(c["color"]), 255)
    return t


def check_tile_palette(src, classes) -> None:
    cm = src.colormap(1)
    bad = [c["code"] for c in classes if tuple(cm[c["code"]][:3]) != _hex(c["color"])]
    if bad:
        raise LandcoverCheckFailed(f"tile colour table differs from config/landcover.yaml for classes {bad}")


def check_render_palette(webp_bytes: bytes, classes) -> int:
    """Every opaque pixel of the decoded image must be exactly a palette colour."""
    img = np.asarray(Image.open(io.BytesIO(webp_bytes)).convert("RGBA"))
    opaque = img[img[..., 3] > 0][:, :3]
    allowed = {_hex(c["color"]) for c in classes}
    found = {tuple(int(v) for v in px) for px in np.unique(opaque, axis=0)}
    if found - allowed:
        raise LandcoverCheckFailed(f"rendered colours outside the palette: {sorted(found - allowed)[:5]}")
    if not set(np.unique(img[..., 3])) <= {0, 255}:
        raise LandcoverCheckFailed("rendered alpha is not strictly 0/255")
    return len(found)


def compute(kode: str) -> dict:
    cfg, cfg_sha = _cfg()
    sc, rc, classes = cfg["stats"], cfg["render"], cfg["classes"]
    by_code = {c["code"]: c for c in classes}

    geom, name, level, outline_meta = get_area(kode)
    w, s, e, n = geom.bounds
    data = manifest.load()

    index = worldcover.tile_index(data)
    wanted = worldcover.tiles_for_bounds(w, s, e, n)
    present = [t for t in wanted if t in index]
    absent = [t for t in wanted if t not in index]
    if not present:
        raise LandcoverCheckFailed(f"{kode}: no WorldCover tiles published for bbox {geom.bounds}")
    paths, tile_recs = [], {}
    for t in present:
        p, rec = worldcover.fetch_tile(t, data)
        paths.append(p)
        tile_recs[t] = rec["sha256"]

    srcs = [rasterio.open(p) for p in paths]
    try:
        for src in srcs:
            check_tile_palette(src, classes)
        tags = srcs[0].tags()
        res = srcs[0].res[0]
        pad = 2 * res
        arr, ltr = merge(srcs, bounds=(w - pad, s - pad, e + pad, n + pad), nodata=NODATA)
        lc, lcrs = arr[0], srcs[0].crs
    finally:
        for src in srcs:
            src.close()

    # --- UTM equal-area grid -----------------------------------------------------------
    c = geom.centroid
    epsg = utm_epsg(c.x, c.y)
    g_utm = to_crs(geom, epsg)
    px = float(sc["utm_pixel_m"])
    ux0, uy0, ux1, uy1 = g_utm.bounds
    x0 = math.floor(ux0 / px) * px - px
    y1 = math.ceil(uy1 / px) * px + px
    uw = int(math.ceil((ux1 - x0) / px)) + 1
    uh = int(math.ceil((y1 - uy0) / px)) + 1
    utr = from_origin(x0, y1, px, px)
    lu = np.zeros((uh, uw), dtype=np.uint8)
    reproject(lc, lu, src_transform=ltr, src_crs=lcrs, src_nodata=NODATA,
              dst_transform=utr, dst_crs=f"EPSG:{epsg}", dst_nodata=NODATA,
              resampling=Resampling[sc["resampling"]])
    m_utm = geometry_mask([mapping(g_utm)], out_shape=lu.shape, transform=utr, invert=True)
    counts = np.bincount(lu[m_utm], minlength=256)
    n_poly = int(m_utm.sum())
    n_valid = n_poly - int(counts[NODATA])

    area_geod = geodesic_area_km2(geom)
    area_utm = g_utm.area / 1e6
    area_px = n_poly * px * px / 1e6
    d_utm = (area_utm - area_geod) / area_geod * 100
    d_px = (area_px - area_utm) / area_utm * 100
    nodata_pct = (n_poly - n_valid) * 100.0 / n_poly
    unknown = [int(k) for k in np.nonzero(counts)[0] if k != NODATA and k not in by_code]

    problems = []
    if unknown:
        problems.append(f"class codes not in the WorldCover legend: {unknown}")
    if nodata_pct > sc["max_nodata_pct"]:
        problems.append(f"{nodata_pct:.3f}% of the polygon has no class (max {sc['max_nodata_pct']}%)")
    if abs(d_utm) > sc["max_area_diff_pct"]:
        problems.append(f"UTM polygon area differs from geodesic by {d_utm:.2f}%")
    if abs(d_px) > sc["max_area_diff_pct"]:
        problems.append(f"pixel area differs from UTM polygon area by {d_px:.2f}%")
    if n_valid == 0:
        problems.append("no classified pixels")
    if problems:
        raise LandcoverCheckFailed(f"{kode}: " + "; ".join(problems))

    rows = []
    for cl in classes:
        k = int(counts[cl["code"]])
        if k == 0:
            continue
        share = k * 100.0 / n_valid
        rows.append({"code": cl["code"], "name": cl["name"], "label": cl["label"], "color": cl["color"],
                     "pixels": k, "share_pct": round(share, 2), "area_km2": round(share / 100 * area_geod, 2)})
    rows.sort(key=lambda r: (-r["pixels"], r["code"]))
    share_sum = sum(r["share_pct"] for r in rows)
    if abs(share_sum - 100.0) > sc["max_share_sum_error_pct"]:
        raise LandcoverCheckFailed(f"{kode}: class shares sum to {share_sum:.2f}%")

    # --- display layer on the shared grid ------------------------------------------
    f = display.start_factor(kode, geom, 2048)
    table = lut(classes)
    while True:
        g = display.grid(geom, f)
        ld = np.zeros(g.shape, dtype=np.uint8)
        reproject(lc, ld, src_transform=ltr, src_crs=lcrs, src_nodata=NODATA,
                  dst_transform=g.transform, dst_crs=lcrs, dst_nodata=NODATA,
                  resampling=Resampling[rc["resampling"]])
        m_d = geometry_mask([mapping(geom)], out_shape=g.shape, transform=g.transform, invert=True)
        rgba = table[np.where(m_d, ld, NODATA)]
        img = display.webp(rgba, lossless=True)
        if len(img) <= rc["max_bytes"]:
            break
        f += 1
    n_colours = check_render_palette(img, classes)

    top = rows[0]
    ds = manifest.DATASETS[worldcover.DATASET]
    stats = {
        "kode": kode, "name": name, "level": level,
        "provinsi": {"kode": kode[:2], "name": province_name(kode[:2])},
        "year": ds["year"],
        "area_km2": round(area_geod, 1),
        "dominant": {"code": top["code"], "label": top["label"], "share_pct": top["share_pct"]},
        "classes": rows,
        "checks": {
            "share_sum_pct": round(share_sum, 2),
            "area_geodesic_km2": round(area_geod, 2), "area_utm_polygon_km2": round(area_utm, 2),
            "area_utm_pixels_km2": round(area_px, 2), "utm_vs_geodesic_pct": round(d_utm, 3),
            "pixels_vs_utm_pct": round(d_px, 3), "nodata_pct": round(nodata_pct, 4),
            "polygon_pixels_utm": n_poly, "render_palette_colours": n_colours,
            "render_palette_exact": True,
        },
        "metadata": {
            "dataset": ds["name"], "version": ds["version"], "year": ds["year"],
            "license": ds["license"], "attribution": ds["attribution"],
            "product_version_tag": tags.get("product_version"),
            "tiles": tile_recs, "tiles_absent": absent,
            "boundary": {"source": outline_meta["source"], "sha256": outline_meta["source_sha256"],
                         "method": outline_meta["method"]},
            "crs_stats": f"EPSG:{epsg}", "pixel_size_m": px, "resampling_to_utm": sc["resampling"],
            "shares_from": f"{px:g} m UTM pixels (EPSG:{epsg}) whose centre lies inside the polygon; "
                           "shares are of classified pixels",
            "area_km2_method": "share × geodesic polygon area (WGS84 ellipsoid)",
            "display_resampling": rc["resampling"],
            "caveat": "Kelas 10 'Tutupan pohon' mencakup perkebunan (sawit, akasia); jangan sebut 'hutan'.",
            "config_sha256": cfg_sha,
            "computed_at": manifest.now_iso(),
        },
    }
    return {"stats": stats, "grid": g, "image": img}


def write(kode: str, result: dict):
    out = PUBLIC_PETA / kode
    out.mkdir(parents=True, exist_ok=True)
    (out / "landcover.json").write_text(json.dumps(result["stats"], indent=2, ensure_ascii=False) + "\n")
    (out / "landcover.webp").write_bytes(result["image"])
    display.write_bounds(kode, result["grid"], {"landcover": "landcover.webp"})
    sys.stderr.write(f"landcover: wrote {out}\n")
    return out
