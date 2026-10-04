"""ESA WorldCover 2021 v200 tile index.

Tiles are 3x3 degrees named by their south-west corner, e.g. `S03E114` covers
lat -3..0, lon 114..117. The bucket's `esa_worldcover_grid.geojson` lists every
published tile (`ll_tile`); a tile absent from it has no land to map.
"""
import json
import math

from . import cache
from .paths import CACHE

DATASET = "esa_worldcover_2021_v200"
BASE = "https://esa-worldcover.s3.eu-central-1.amazonaws.com"


def tile_name(lat_sw: int, lon_sw: int) -> str:
    ns = "N" if lat_sw >= 0 else "S"
    ew = "E" if lon_sw >= 0 else "W"
    return f"{ns}{abs(lat_sw):02d}{ew}{abs(lon_sw):03d}"


def tiles_for_bounds(west, south, east, north) -> list[str]:
    eps = 1e-9
    lats = range(math.floor(south / 3) * 3, math.floor((north - eps) / 3) * 3 + 1, 3)
    lons = range(math.floor(west / 3) * 3, math.floor((east - eps) / 3) * 3 + 1, 3)
    return [tile_name(la, lo) for la in lats for lo in lons]


def tile_index(data: dict) -> set[str]:
    dest = CACHE / "worldcover" / "esa_worldcover_grid.geojson"
    cache.fetch(DATASET, "esa_worldcover_grid.geojson", f"{BASE}/esa_worldcover_grid.geojson", dest, data)
    return {f["properties"]["ll_tile"] for f in json.loads(dest.read_text())["features"]}


def fetch_tile(name: str, data: dict):
    fn = f"ESA_WorldCover_10m_2021_v200_{name}_Map.tif"
    dest = CACHE / "worldcover" / fn
    rec = cache.fetch(DATASET, name, f"{BASE}/v200/2021/map/{fn}", dest, data)
    return dest, rec
