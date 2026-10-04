"""Copernicus DEM GLO-30 tile index.

Tile `Copernicus_DSM_COG_10_S01_00_E116_00_DEM` covers lat -1..0, lon 116..117:
the name is the tile's south-west corner (AWS readme: bottom-row pixel centres
sit one pixel north of the named northing). Tiles absent from the bucket's
`tileList.txt` are ocean (no tile is published there).
"""
import math

from . import cache
from .paths import CACHE

DATASET = "copernicus_dem_glo30"
BASE = "https://copernicus-dem-30m.s3.amazonaws.com"


def tile_name(lat_floor: int, lon_floor: int) -> str:
    ns = "N" if lat_floor >= 0 else "S"
    ew = "E" if lon_floor >= 0 else "W"
    return f"Copernicus_DSM_COG_10_{ns}{abs(lat_floor):02d}_00_{ew}{abs(lon_floor):03d}_00_DEM"


def tiles_for_bounds(west: float, south: float, east: float, north: float) -> list[str]:
    eps = 1e-9  # a bound exactly on a degree line does not pull in the next tile
    lats = range(math.floor(south), math.floor(north - eps) + 1)
    lons = range(math.floor(west), math.floor(east - eps) + 1)
    return [tile_name(la, lo) for la in lats for lo in lons]


def tile_index(data: dict) -> set[str]:
    dest = CACHE / "copdem" / "tileList.txt"
    cache.fetch(DATASET, "tileList.txt", f"{BASE}/tileList.txt", dest, data)
    return {line.strip() for line in dest.read_text().splitlines() if line.strip()}


def fetch_tile(name: str, data: dict):
    dest = CACHE / "copdem" / f"{name}.tif"
    rec = cache.fetch(DATASET, name, f"{BASE}/{name}/{name}.tif", dest, data)
    return dest, rec
