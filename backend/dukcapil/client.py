"""Minimal, polite client for the public Kemendagri/Dukcapil ArcGIS REST API.

The population GIS viewer (gis.dukcapil.kemendagri.go.id) is an Esri
Experience Builder app; its data comes from ArcGIS `MapServer/<layer>/query`
endpoints. There is no API key and no auth. This client:

  - resolves the data layer id per service (it differs: PROP=1, KAB=3,
    KEC=2, KEL=0),
  - pages `resultOffset` in `maxRecordCount` steps until drained,
  - is conservatively rate-limited with exponential backoff (mirroring the
    politeness bps_client applies to BPS, minus the key handling).

It yields raw response pages so the caller can hash each one into a
`DukcapilFetchLog` before parsing (audit trail).
"""

import time
import urllib.parse

import requests

BASE = "https://gis.dukcapil.kemendagri.go.id/arcgis/rest/services"

# level -> ArcGIS service name. Layer id within the service is resolved live.
SERVICES = {
    "province": "AGR_VISUAL_PROP_FIX",
    "regency": "AGR_VISUAL_KAB_FIX",
    "district": "AGR_VISUAL_KEC_FIX",
    "village": "AGR_VISUAL_KEL_FIX",
}

DEFAULT_PAGE = 10000          # server maxRecordCount
DEFAULT_DELAY = 0.5           # seconds between successful calls
MAX_RETRIES = 4
BACKOFF_BASE = 1.5            # seconds, exponential


class DukcapilClientError(Exception):
    pass


class DukcapilClient:
    def __init__(self, page_size=DEFAULT_PAGE, delay=DEFAULT_DELAY, timeout=120, session=None):
        self.page_size = page_size
        self.delay = delay
        self.timeout = timeout
        self.session = session or requests.Session()
        self.session.headers.setdefault("User-Agent", "nusastats-dukcapil-ingest/1.0")

    def _get(self, url):
        """GET with retry/backoff. Returns the requests.Response on success."""
        last_exc = None
        for attempt in range(MAX_RETRIES):
            try:
                resp = self.session.get(url, timeout=self.timeout)
                if resp.status_code == 200:
                    return resp
                last_exc = DukcapilClientError(f"HTTP {resp.status_code} for {url}")
            except requests.RequestException as exc:
                last_exc = exc
            if attempt < MAX_RETRIES - 1:
                time.sleep(BACKOFF_BASE * (2**attempt))
        raise DukcapilClientError(str(last_exc))

    def layer_id(self, service):
        """The data layer isn't always id 0 across services."""
        url = f"{BASE}/{service}/MapServer?f=json"
        doc = self._get(url).json()
        layers = doc.get("layers") or []
        if not layers:
            raise DukcapilClientError(f"No layers on service {service}")
        return layers[0]["id"]

    def query_url(self, service, layer_id, offset):
        qs = urllib.parse.urlencode(
            {
                "where": "1=1",
                "outFields": "*",
                "returnGeometry": "false",
                "outSR": "4326",
                "f": "json",
                "resultOffset": offset,
                "resultRecordCount": self.page_size,
            }
        )
        return f"{BASE}/{service}/MapServer/{layer_id}/query?{qs}"

    def iter_pages(self, level):
        """Yield (url, status, raw_bytes, features) for each page of a level.

        Stops when a page returns fewer than a full page AND the server no
        longer reports `exceededTransferLimit`, or when a page is empty.
        """
        service = SERVICES[level]
        layer_id = self.layer_id(service)
        offset = 0
        while True:
            url = self.query_url(service, layer_id, offset)
            resp = self._get(url)
            raw = resp.content
            doc = resp.json()
            if "error" in doc:
                raise DukcapilClientError(f"ArcGIS error at offset {offset}: {doc['error']}")
            feats = doc.get("features", [])
            yield url, resp.status_code, raw, layer_id, feats
            if not feats:
                break
            if len(feats) < self.page_size and not doc.get("exceededTransferLimit"):
                break
            offset += self.page_size
            time.sleep(self.delay)
