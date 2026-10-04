"""Projection helpers. Areas and slopes are computed in the local UTM zone of the
polygon centroid — never in degrees (spec §4.3 step 4)."""
import math

from pyproj import Geod, Transformer
from shapely.ops import transform

GEOD = Geod(ellps="WGS84")


def utm_epsg(lon: float, lat: float) -> int:
    zone = int(math.floor((lon + 180.0) / 6.0)) + 1
    zone = min(max(zone, 1), 60)
    return (32600 if lat >= 0 else 32700) + zone


def to_crs(geom, epsg: int):
    t = Transformer.from_crs("EPSG:4326", f"EPSG:{epsg}", always_xy=True)
    return transform(t.transform, geom)


def geodesic_area_km2(geom) -> float:
    area, _ = GEOD.geometry_area_perimeter(geom)
    return abs(area) / 1e6
