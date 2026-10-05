"""World Bank Light Every Night monthly VIIRS composites, read as remote windows.

The global files are 3-4 GB cloud-optimised GeoTIFFs, so we read only a
province window over HTTP range requests. Provenance per (month, band,
window): the URL, the object's ETag and Last-Modified (HEAD) and the sha256
of the exact pixel bytes read. A re-read whose window hash differs from the
recorded one stops the run (upstream changed), like a changed tile does.
"""
import hashlib
import re
import sys
import time
import urllib.request

import numpy as np
import rasterio
from rasterio.windows import from_bounds

from common import manifest
from common.cache import SourceChanged

DATASET = "wb_len_viirs_monthly"
BASE = "https://globalnightlight.s3.amazonaws.com"
UA = {"User-Agent": "nusastats-peta-wilayah/0.1 (local research pipeline)"}
# Hard timeouts: a read that stalls (e.g. the machine slept mid-request) must
# fail and be retried, not hang forever.
GDAL_ENV = {"GDAL_DISABLE_READDIR_ON_OPEN": "EMPTY_DIR", "CPL_VSIL_CURL_ALLOWED_EXTENSIONS": ".tif",
            "GDAL_HTTP_MAX_RETRY": "4", "GDAL_HTTP_RETRY_DELAY": "2",
            "GDAL_HTTP_CONNECTTIMEOUT": "20", "GDAL_HTTP_TIMEOUT": "180",
            "GDAL_HTTP_LOW_SPEED_LIMIT": "1024", "GDAL_HTTP_LOW_SPEED_TIME": "60"}
TRIES = 4


def _get(url: str) -> str:
    last = None
    for i in range(TRIES):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120) as r:
                return r.read().decode()
        except Exception as e:  # noqa: BLE001
            last = e
            time.sleep(2 ** i)
    raise RuntimeError(f"listing failed: {url}: {last}")


def months(year: int) -> list[str]:
    """Month folders with 'ops' processing for a year, e.g. composites/npp_202301_ops/."""
    x = _get(f"{BASE}/?list-type=2&prefix=composites/npp_{year}&delimiter=/")
    return sorted(p for p in re.findall(r"<Prefix>(composites/npp_\d{6}_ops/)</Prefix>", x))


def keys(prefix: str):
    """{band: key} for the 'ecm-slcorr' (stray-light corrected) product, or None
    if the month does not publish it under that exact name (2024-10 uses a
    different scheme, 'ecmslcfg'); such months are skipped, never substituted."""
    x = _get(f"{BASE}/?list-type=2&prefix={prefix}")
    out = {}
    for k in re.findall(r"<Key>([^<]+)</Key>", x):
        if "_global_ecm-slcorr_v10_ops." in k:
            for band in ("avg_rade9", "n_cf"):
                if k.endswith(f".{band}.tif"):
                    out[band] = k
    if not out:
        return None
    if set(out) != {"avg_rade9", "n_cf"}:
        raise RuntimeError(f"{prefix}: ecm-slcorr product incomplete, found {sorted(out)}")
    return out


def _head(url: str) -> dict:
    req = urllib.request.Request(url, method="HEAD", headers=UA)
    with urllib.request.urlopen(req, timeout=60) as r:
        return {"etag": r.headers.get("ETag", "").strip('"'), "last_modified": r.headers.get("Last-Modified", "")}


def read_window(key: str, bounds, record_key: str, data: dict):
    """(array, transform) for `bounds` (already snapped to the source grid) from
    one global file, with its provenance checked against / recorded in data."""
    url = f"{BASE}/{key}"
    last = None
    for i in range(TRIES):
        try:
            with rasterio.Env(**GDAL_ENV), rasterio.open(f"/vsicurl/{url}") as s:
                w = from_bounds(*bounds, s.transform)
                arr = s.read(1, window=w)
                tr = s.window_transform(w)
            break
        except Exception as e:  # noqa: BLE001
            last = e
            sys.stderr.write(f"  retry {i + 1}/{TRIES} {key}: {e}\n")
            time.sleep(2 ** i)
    else:
        raise RuntimeError(f"window read failed after {TRIES} tries: {url}: {last}")
    digest = hashlib.sha256(np.ascontiguousarray(arr).tobytes()).hexdigest()
    files = data["files"][DATASET]
    rec = files.get(record_key)
    if rec and rec["sha256_window"] != digest:
        raise SourceChanged(f"{record_key}: window sha256 {digest} != recorded {rec['sha256_window']}")
    if not rec:
        files[record_key] = {"url": url, **_head(url), "window_bounds": [round(b, 8) for b in bounds],
                             "shape": list(arr.shape), "dtype": str(arr.dtype), "sha256_window": digest,
                             "read_at": manifest.now_iso()}
        manifest.save(data)
    return arr, tr
