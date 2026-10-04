"""The shared display grid: one regular EPSG:4326 grid per area, used by every
map layer (hillshade, elevation, land cover) so a single `bounds.json` places
them all.

Lon/lat because the frontend SVG map (ChoroplethMap) projects linearly in
lon/lat — x = (lon − lonMin)·s·cos(midLat), y = (latMax − lat)·s — so an image
stretched over its lon/lat box lines up with the outlines exactly. The grid
is a multiple `factor` of 1 arc-second, snapped outward to whole pixels with
one pixel of padding, so it is deterministic for a given polygon and factor.
"""
import io
import json
import math
import sys
from dataclasses import dataclass

import numpy as np
from PIL import Image
from rasterio.transform import Affine, from_origin

from .paths import PUBLIC_PETA

BASE_DEG = 1.0 / 3600.0


@dataclass(frozen=True)
class Grid:
    factor: int
    pixel_deg: float
    west: float
    north: float
    width: int
    height: int

    @property
    def transform(self) -> Affine:
        return from_origin(self.west, self.north, self.pixel_deg, self.pixel_deg)

    @property
    def shape(self):
        return (self.height, self.width)

    def row_lats(self):
        return self.north - (np.arange(self.height) + 0.5) * self.pixel_deg


def min_factor(geom, max_px: int) -> int:
    w, s, e, n = geom.bounds
    return max(1, math.ceil(max(e - w, n - s) / BASE_DEG / max_px))


def grid(geom, factor: int) -> Grid:
    w, s, e, n = geom.bounds
    rd = BASE_DEG * factor
    dw = math.floor(w / rd) * rd - rd
    dn = math.ceil(n / rd) * rd + rd
    return Grid(factor, rd, dw, dn,
                int(math.ceil((e - dw) / rd)) + 1, int(math.ceil((dn - s) / rd)) + 1)


def existing_factor(kode: str):
    p = PUBLIC_PETA / kode / "bounds.json"
    return json.loads(p.read_text()).get("downsample_factor") if p.exists() else None


def start_factor(kode: str, geom, max_px: int) -> int:
    """Reuse the factor an earlier layer already wrote, so all layers share one grid."""
    return max(min_factor(geom, max_px), existing_factor(kode) or 0)


def write_bounds(kode: str, g: Grid, layers: dict) -> None:
    """Write bounds.json, merging `layers` into those already listed. If the grid
    changed, layers rendered on the old grid are dropped (they must be re-run)."""
    out = PUBLIC_PETA / kode
    out.mkdir(parents=True, exist_ok=True)
    p = out / "bounds.json"
    new = {
        "kode": kode, "crs": "EPSG:4326",
        "west": round(g.west, 8), "north": round(g.north, 8),
        "east": round(g.west + g.width * g.pixel_deg, 8),
        "south": round(g.north - g.height * g.pixel_deg, 8),
        "width": g.width, "height": g.height, "pixel_deg": g.pixel_deg,
        "downsample_factor": g.factor, "base_pixel_deg": BASE_DEG,
        "note": "Pixel-edge bounds. Stretch each layer over this lon/lat box (linear lon/lat, "
                "same as ChoroplethMap's projection).",
    }
    merged = {}
    if p.exists():
        old = json.loads(p.read_text())
        same = all(old.get(k) == new[k] for k in ("west", "north", "width", "height", "pixel_deg"))
        if same:
            merged = old.get("layers", {})
        elif old.get("layers"):
            stale = sorted(set(old["layers"]) - set(layers))
            if stale:
                sys.stderr.write(f"bounds: grid changed for {kode}; dropped stale layers {stale} — re-run them\n")
    merged.update(layers)
    new["layers"] = dict(sorted(merged.items()))
    p.write_text(json.dumps(new, indent=2) + "\n")


def webp(rgba: np.ndarray, *, quality: int = 90, lossless: bool = False) -> bytes:
    buf = io.BytesIO()
    img = Image.fromarray(rgba, "RGBA")
    if lossless:
        img.save(buf, "WEBP", lossless=True, quality=100, method=6, exact=True)
    else:
        img.save(buf, "WEBP", quality=quality, method=6, exact=False)
    return buf.getvalue()
