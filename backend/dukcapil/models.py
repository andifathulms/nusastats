"""Models for Kemendagri/Dukcapil population data.

This app is deliberately self-contained and shares NOTHING with the BPS
stack (`catalog`, `stats`, `cakupan`, `crawler`, `bps_client`). Dukcapil is
a *different source* with different region codes (Kemendagri wilayah codes,
not BPS domain ids), so mixing it into `stats.DataPoint` — which is bound to
a confirmed BPS `catalog.Variable` and must trace to a BPS
`CoverageCheckLog` — would violate the project's source-traceability rules.

We still honour the spirit of those rules: every stored value comes from a
real ArcGIS response whose raw body we hash into `DukcapilFetchLog`. Nothing
here is inferred or estimated.
"""

from django.db import models
from django.utils import timezone


def current_period():
    """Snapshot key for 'now' — the calendar month, e.g. '2026-07'."""
    return timezone.now().strftime("%Y-%m")


class DukcapilLevel(models.TextChoices):
    PROVINCE = "province", "Provinsi"
    REGENCY = "regency", "Kabupaten/Kota"
    DISTRICT = "district", "Kecamatan"
    VILLAGE = "village", "Desa/Kelurahan"


class DukcapilFetchLog(models.Model):
    """One row per crawled ArcGIS `/query` page — the audit trail.

    Mirrors Cakupan's "every value traces to a stored real response"
    principle: the exact URL called, the HTTP status, how many rows came
    back, and a SHA-256 of the raw response body. `DukcapilRegion` rows
    point back here so any figure can be traced to the response it came
    from. (The ArcGIS endpoints are public and keyless, so no secret ever
    appears in `url` — unlike BPS, there is nothing to redact.)
    """

    service = models.CharField(max_length=64)
    layer_id = models.IntegerField()
    level = models.CharField(max_length=16, choices=DukcapilLevel.choices)
    period = models.CharField(max_length=7, default="")
    url = models.TextField()
    http_status = models.IntegerField()
    row_count = models.IntegerField(default=0)
    response_sha256 = models.CharField(max_length=64)
    fetched_at = models.DateTimeField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-fetched_at"]

    def __str__(self):
        return f"{self.service}/{self.layer_id} @ {self.fetched_at:%Y-%m-%d %H:%M} ({self.row_count} rows)"


class DukcapilRegion(models.Model):
    """One administrative region at one level, with the full raw ArcGIS
    attribute record kept verbatim in `attributes` (JSONB).

    Storing the wide record (rather than exploding it into ~120 rows per
    region) keeps the whole hierarchy at ~91k rows. Indicator values are
    read out of `attributes` on demand via `dukcapil.values`; the human
    metadata those raw keys lack lives in `DukcapilIndicator`.
    """

    # 32, not 16: dirty rows fall back to an objectid-suffixed code
    # (e.g. "3303051012-5330090494655113"), and village objectids alone can
    # be 16 digits.
    code = models.CharField(max_length=32)
    level = models.CharField(max_length=16, choices=DukcapilLevel.choices)
    # Title-cased, with any "KOTA "/"KAB. " prefix stripped into `status`.
    name = models.CharField(max_length=255)
    # Structured type: Provinsi / Kota / Kabupaten / Kecamatan (blank for
    # village — desa/kelurahan isn't carried in the Dukcapil data).
    status = models.CharField(max_length=16, blank=True)

    # Monthly snapshot key ("YYYY-MM"). Coverage is re-crawled monthly; each
    # crawl writes rows under its own period, so history accumulates into a
    # time series rather than overwriting. Idempotent within a period.
    period = models.CharField(max_length=7, default="", db_index=True)

    # Hierarchy. `parent_code` is the composed code of the region one level
    # up; `parent` is resolved from it by `relink_parents()` after ingest
    # (levels can be ingested independently, so the FK is set best-effort).
    parent_code = models.CharField(max_length=32, blank=True)
    parent = models.ForeignKey(
        "self", null=True, blank=True, on_delete=models.SET_NULL, related_name="children"
    )

    # Denormalized ancestor codes (composed Kemendagri wilayah codes:
    # prov=2, kab=4, kec=6 digits). Let any level be filtered by any
    # ancestor directly — e.g. rank all *villages* in a kabupaten by
    # kab_code, without needing the immediate-parent kecamatan.
    prov_code = models.CharField(max_length=8, blank=True)
    kab_code = models.CharField(max_length=8, blank=True)
    kec_code = models.CharField(max_length=8, blank=True)

    # Kemendagri numeric hierarchy components, kept for joins/crosswalks.
    no_prop = models.IntegerField(null=True, blank=True)
    no_kab = models.IntegerField(null=True, blank=True)
    no_kec = models.IntegerField(null=True, blank=True)
    no_kel = models.IntegerField(null=True, blank=True)
    nama_prop = models.CharField(max_length=255, blank=True)
    nama_kab = models.CharField(max_length=255, blank=True)
    nama_kec = models.CharField(max_length=255, blank=True)

    attributes = models.JSONField(default=dict)

    # Land area (km²) computed from BIG 1:10k polygons, stored per-region.
    # Kept OUT of `attributes` (which holds only the raw ArcGIS record) because
    # it's derived from a different source; populated post-ingest by the
    # `load_big_area` command and survives re-crawls. Needed because Dukcapil's
    # own `luas_wilayah` is the kabupaten total copied onto every desa — useless
    # at village level — whereas this is the true per-region polygon area.
    luas_big = models.FloatField(null=True, blank=True)

    fetch_log = models.ForeignKey(
        DukcapilFetchLog, null=True, blank=True, on_delete=models.SET_NULL, related_name="regions"
    )
    fetched_at = models.DateTimeField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ("level", "code", "period")
        indexes = [
            models.Index(fields=["level", "period"]),
            models.Index(fields=["level", "period", "parent_code"]),
            models.Index(fields=["level", "period", "prov_code"]),
            models.Index(fields=["level", "period", "kab_code"]),
            models.Index(fields=["level", "period", "kec_code"]),
        ]
        ordering = ["level", "code"]

    def __str__(self):
        return f"[{self.level}] {self.code} {self.name}"


class DukcapilIndicator(models.Model):
    """Catalog of the surfaced indicators — the human metadata the raw
    ArcGIS response lacks. Seeded from `dukcapil.indicators` (single source
    of truth). `field` is the JSON key inside `DukcapilRegion.attributes`.
    """

    field = models.CharField(max_length=64, unique=True)
    label_id = models.CharField(max_length=128)
    group = models.CharField(max_length=32)
    unit = models.CharField(max_length=32, blank=True)
    # Some fields (luas_wilayah, kepadatan_penduduk) arrive as formatted
    # strings; `dukcapil.values.to_number` parses them at read time.
    is_string = models.BooleanField(default=False)
    sort = models.IntegerField(default=0)

    class Meta:
        ordering = ["sort", "field"]

    def __str__(self):
        return f"{self.field} — {self.label_id}"
