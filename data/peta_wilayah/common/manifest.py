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
