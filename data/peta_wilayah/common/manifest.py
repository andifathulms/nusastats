"""`sources.json`: the committed record of every external dataset and tile used.

Per dataset it holds the descriptive metadata (URL pattern, version, licence,
attribution); per downloaded file it holds the sha256, size, URL and download
date. Cached files are only trusted when their hash matches what is recorded
here, so any figure can be traced back to the exact bytes it was computed from.
Written with sorted keys so diffs stay small and deterministic.
"""
import json
from datetime import datetime, timezone

from .paths import SOURCES

DATASETS = {
    "copernicus_dem_glo30": {
        "name": "Copernicus DEM GLO-30 Public",
        "provider": "ESA / Copernicus (TanDEM-X derived WorldDEM); AWS Open Data mirror",
        "type": "DSM (surface model: includes canopy and buildings)",
        "resolution": "1 arc-second (~30 m)",
        "vertical_datum": "EGM2008 geoid (EPSG:3855), metres",
        "horizontal_crs": "EPSG:4326",
        "acquisition": "TanDEM-X 2011-2015",
        "url_pattern": "https://copernicus-dem-30m.s3.amazonaws.com/{tile}/{tile}.tif",
        "tile_index_url": "https://copernicus-dem-30m.s3.amazonaws.com/tileList.txt",
        "docs_url": "https://dataspace.copernicus.eu/explore-data/data-collections/copernicus-contributing-missions/collections-description/COP-DEM",
        "license": "Copernicus DEM licence: GLO-30 free for the general public, with attribution",
        "attribution": ("produced using Copernicus WorldDEM-30 © DLR e.V. 2010-2014 and © Airbus "
                        "Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European "
                        "Union and ESA; all rights reserved"),
        "attribution_short": "Copernicus DEM GLO-30 (© DLR e.V., © Airbus DS; Copernicus/EU/ESA)",
        "year": 2015,
        "notes": ("Ocean has no tiles (tileList.txt is authoritative; absent = ocean). "
                  "Licence/attribution verified 2026-10-05 from the docs_url page."),
    },
    "esa_worldcover_2021_v200": {
        "name": "ESA WorldCover 10 m 2021 v200",
        "provider": "ESA WorldCover consortium; AWS Open Data mirror",
        "type": "Land cover map, 11 classes, Sentinel-1/2 derived",
        "resolution": "1/12000 degree (~10 m)",
        "horizontal_crs": "EPSG:4326",
        "year": 2021,
        "version": "v200",
        "url_pattern": "https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map/ESA_WorldCover_10m_2021_v200_{tile}_Map.tif",
        "tile_index_url": "https://esa-worldcover.s3.eu-central-1.amazonaws.com/esa_worldcover_grid.geojson",
        "docs_url": "https://esa-worldcover.org/en/data-access",
        "license": "CC BY 4.0 (Creative Commons Attribution 4.0 International)",
        "attribution": ("© ESA WorldCover project 2021 / Contains modified Copernicus Sentinel data "
                        "(2021) processed by ESA WorldCover consortium"),
        "attribution_short": "ESA WorldCover 2021 v200 (CC BY 4.0)",
        "notes": ("3x3 degree tiles named by their south-west corner. Licence/attribution template "
                  "verified 2026-10-05 from the docs_url page ([year] = 2021). Plantations "
                  "(sawit, akasia) usually map to class 10: say 'tutupan pohon', never 'hutan'."),
    },
}


def load() -> dict:
    if SOURCES.exists():
        data = json.loads(SOURCES.read_text())
    else:
        data = {}
    data.setdefault("datasets", {})
    data.setdefault("files", {})
    for key, meta in DATASETS.items():
        data["datasets"][key] = meta  # code is the source of truth for descriptive metadata
        data["files"].setdefault(key, {})
    return data


def save(data: dict) -> None:
    SOURCES.write_text(json.dumps(data, indent=2, sort_keys=True, ensure_ascii=False) + "\n")


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()
