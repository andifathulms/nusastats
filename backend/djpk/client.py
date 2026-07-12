"""Minimal, polite client for the public DJPK/SIKD APBD portal.

The Kemenkeu DJPK regional-finance viewer (djpk.kemenkeu.go.id/portal) is a
plain server-rendered app backed by a few undocumented but stable JSON/export
endpoints, discovered from its own filter form:

  - GET /portal/provinsi/{tahun}           -> {"22": "Prov. Bali", ...}
  - GET /portal/pemda/{provinsi}/{tahun}   -> {"00": "Prov. Bali",
                                               "01": "Kab. Badung", ...}
  - GET /portal/csv_apbd?type={apbd|realisasi}&periode={1-12}&tahun={YYYY}
        &provinsi={pp}&pemda={dd}           -> SpreadsheetML XML of the full
                                              APBD account tree (Anggaran /
                                              Realisasi / Persentase).

There is no API key and no auth (public open data), so — unlike bps_client —
there is nothing to redact. Codes are DJPK's OWN sequential numbering
(province 01..38, pemda 00 = the provincial government itself, 01..NN =
kab/kota under it, "--" = a pre-aggregated "semua pemda" total). They are NOT
BPS/Kemendagri wilayah codes; `djpk.crosswalk` maps them.

`periode` is the month cutoff of a realisasi (12 = full year). `type=apbd`
returns the budgeted figures, `type=realisasi` the realised ones; both carry
Anggaran and Realisasi columns.

This client is conservatively rate-limited with exponential backoff (mirroring
the politeness dukcapil/client applies to ArcGIS) and yields raw response
bytes so the caller can hash each one into a `DjpkFetchLog` before parsing.
"""

import time

import requests

BASE = "https://djpk.kemenkeu.go.id/portal"

# The portal 403s / stalls for a bare client; it expects a browser-ish UA and
# the same-origin referer its own XHRs send.
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko)"

REPORT_TYPES = ("apbd", "realisasi")

DEFAULT_DELAY = 0.6          # seconds between successful calls
MAX_RETRIES = 4
BACKOFF_BASE = 1.5           # seconds, exponential


class DjpkClientError(Exception):
    pass


class DjpkClient:
    def __init__(self, delay=DEFAULT_DELAY, timeout=90, session=None):
        self.delay = delay
        self.timeout = timeout
        self.session = session or requests.Session()
        self.session.headers.update(
            {
                "User-Agent": UA,
                "Referer": f"{BASE}/data/apbd",
                "X-Requested-With": "XMLHttpRequest",
            }
        )

    def _get(self, url):
        """GET with retry/backoff. Returns the requests.Response on success."""
        last_exc = None
        for attempt in range(MAX_RETRIES):
            try:
                resp = self.session.get(url, timeout=self.timeout)
                if resp.status_code == 200:
                    return resp
                last_exc = DjpkClientError(f"HTTP {resp.status_code} for {url}")
            except requests.RequestException as exc:
                last_exc = exc
            if attempt < MAX_RETRIES - 1:
                time.sleep(BACKOFF_BASE * (2**attempt))
        raise DjpkClientError(str(last_exc))

    # --- metadata endpoints (JSON) ---------------------------------------

    def provinsi_url(self, tahun):
        return f"{BASE}/provinsi/{tahun}"

    def pemda_url(self, provinsi, tahun):
        return f"{BASE}/pemda/{provinsi}/{tahun}"

    def list_provinces(self, tahun):
        """{djpk_prov_code: name} for provinces that have data in `tahun`."""
        return self._get(self.provinsi_url(tahun)).json()

    def list_pemda(self, provinsi, tahun):
        """{djpk_pemda_code: name} under a province for `tahun`. Includes
        '00' (the provincial government) and may include '--' (aggregate)."""
        return self._get(self.pemda_url(provinsi, tahun)).json()

    # --- data endpoint (SpreadsheetML export) ----------------------------

    def apbd_url(self, report_type, periode, tahun, provinsi, pemda):
        if report_type not in REPORT_TYPES:
            raise ValueError(f"report_type must be one of {REPORT_TYPES}")
        return (
            f"{BASE}/csv_apbd?type={report_type}&periode={periode}"
            f"&tahun={tahun}&provinsi={provinsi}&pemda={pemda}"
        )

    def fetch_apbd(self, report_type, periode, tahun, provinsi, pemda):
        """Return (url, http_status, raw_bytes) for one APBD export. The caller
        hashes `raw_bytes` into a DjpkFetchLog, then parses via djpk.parser."""
        url = self.apbd_url(report_type, periode, tahun, provinsi, pemda)
        resp = self._get(url)
        return url, resp.status_code, resp.content

    def sleep(self):
        time.sleep(self.delay)
