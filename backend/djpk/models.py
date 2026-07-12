"""Models for DJPK/Kemenkeu regional-finance (APBD) data.

Like `dukcapil`, this app is deliberately self-contained and shares NOTHING
with the BPS stack (`catalog`, `stats`, `cakupan`, `crawler`, `bps_client`).
DJPK is a *different source* with its OWN region codes (province 01..38,
pemda 00 = provincial govt, 01..NN = kab/kota) — not BPS domain ids and not
even the Kemendagri wilayah codes dukcapil uses. `ApbdRegion` carries a
crosswalk (`kemendagri_code`) so figures can be joined to the rest of
NusaStats, but that mapping is built by name-match in `djpk.crosswalk` and is
explicit/reviewable, never assumed.

We honour the project's source-traceability rules: every stored figure comes
from a real DJPK HTTP response whose raw body is hashed into `DjpkFetchLog`,
and every `ApbdReport` points back to the response it was parsed from. Nothing
here is inferred or estimated. The `ApbdAccount` catalog is fixed government
chart-of-accounts metadata (see `djpk.accounts`), not data.
"""

from django.db import models


class ReportType(models.TextChoices):
    APBD = "apbd", "APBD (anggaran)"
    REALISASI = "realisasi", "Realisasi APBD"


class RegionLevel(models.TextChoices):
    PROVINCE = "province", "Provinsi"
    REGENCY = "regency", "Kabupaten/Kota"


class DjpkFetchLog(models.Model):
    """One row per DJPK HTTP call whose body we store data from — the audit
    trail. Mirrors Cakupan's "every value traces to a stored real response":
    the exact URL, HTTP status, byte size, row count, and a SHA-256 of the raw
    response body. `ApbdReport` rows point back here. The endpoints are public
    and keyless, so nothing in `url` is secret (unlike BPS — no redaction).
    """

    KIND_CHOICES = [("apbd", "APBD export"), ("provinsi", "province list"), ("pemda", "pemda list")]

    kind = models.CharField(max_length=16, choices=KIND_CHOICES, default="apbd")
    url = models.TextField()
    http_status = models.IntegerField()
    byte_count = models.IntegerField(default=0)
    row_count = models.IntegerField(default=0)
    response_sha256 = models.CharField(max_length=64)
    fetched_at = models.DateTimeField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-fetched_at"]

    def __str__(self):
        return f"{self.kind} @ {self.fetched_at:%Y-%m-%d %H:%M} ({self.row_count} rows)"


class ApbdRegion(models.Model):
    """One DJPK finance entity: a provincial government (pemda '00') or a
    kabupaten/kota under it. Keyed on DJPK's own codes, with a crosswalk to the
    Kemendagri wilayah code used elsewhere in NusaStats.

    The `--`/"semua pemda" aggregate row DJPK exposes is NOT stored as a region
    (it is a derived total, not an entity); ingest skips it.
    """

    # DJPK codes (strings, zero-padded as the portal returns them).
    djpk_prov = models.CharField(max_length=2)          # "22"
    djpk_pemda = models.CharField(max_length=2)         # "00" (prov govt) .. "NN"
    djpk_code = models.CharField(max_length=4, unique=True)  # prov+pemda, "2200"

    level = models.CharField(max_length=16, choices=RegionLevel.choices)
    name = models.CharField(max_length=255)             # verbatim, "Kab. Badung"
    prov_name = models.CharField(max_length=255, blank=True)  # parent province name

    # Crosswalk to Kemendagri wilayah code (2-digit province / 4-digit
    # regency) — the code dukcapil & the BPS crosswalk use. Blank until
    # `djpk.crosswalk` resolves it; `match_method` records how (name-exact,
    # name-normalized, manual, or "" = unmatched).
    kemendagri_code = models.CharField(max_length=8, blank=True, db_index=True)
    match_method = models.CharField(max_length=32, blank=True)
    matched_name = models.CharField(max_length=255, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [
            models.Index(fields=["level"]),
            models.Index(fields=["djpk_prov"]),
        ]
        ordering = ["djpk_prov", "djpk_pemda"]

    def __str__(self):
        return f"[{self.djpk_code}] {self.name}"


class ApbdAccount(models.Model):
    """Canonical APBD chart-of-accounts node — the hierarchy the flat export
    omits. Seeded from `djpk.accounts` (single source of truth). `akun_key` is
    `djpk.parser.slugify_akun(label)`; `parent_key` references another
    `akun_key` ("" for the three top-level accounts).
    """

    GROUP_CHOICES = [
        ("pendapatan", "Pendapatan"),
        ("belanja", "Belanja"),
        ("pembiayaan", "Pembiayaan"),
    ]

    akun_key = models.CharField(max_length=128, unique=True)
    label_id = models.CharField(max_length=255)
    group = models.CharField(max_length=16, choices=GROUP_CHOICES)
    parent_key = models.CharField(max_length=128, blank=True)
    sort = models.IntegerField(default=0)

    class Meta:
        ordering = ["sort", "akun_key"]

    def __str__(self):
        return f"{self.akun_key} — {self.label_id}"


class ApbdReport(models.Model):
    """One fetched APBD/realisasi statement for a region, year, type, and month
    cutoff. Idempotent on (region, tahun, report_type, periode): re-fetching
    updates in place and re-points `fetch_log`, never duplicates.
    """

    region = models.ForeignKey(ApbdRegion, on_delete=models.CASCADE, related_name="reports")
    tahun = models.IntegerField()
    report_type = models.CharField(max_length=16, choices=ReportType.choices)
    # Month cutoff of the figures (1..12). 12 = full year. Meaningful mainly for
    # in-year realisasi; kept for all rows so the key is uniform.
    periode = models.IntegerField(default=12)

    fetch_log = models.ForeignKey(
        DjpkFetchLog, null=True, blank=True, on_delete=models.SET_NULL, related_name="reports"
    )
    line_count = models.IntegerField(default=0)
    fetched_at = models.DateTimeField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ("region", "tahun", "report_type", "periode")
        indexes = [
            models.Index(fields=["tahun", "report_type", "periode"]),
        ]
        ordering = ["-tahun", "region"]

    def __str__(self):
        return f"{self.region.djpk_code} {self.report_type} {self.tahun}/{self.periode:02d}"


class ApbdLine(models.Model):
    """One account line of a report, stored verbatim in file order. Both
    `anggaran` and `realisasi` are kept (the export carries both columns);
    `persentase` is realisasi/anggaran as DJPK reports it. Duplicate labels
    within a report are preserved as distinct rows (disambiguated by
    `line_index`) — nothing is deduped.

    `akun_key` (slugified label) joins to `ApbdAccount` for hierarchy/display
    and is indexed so a single account (e.g. `pad`) can be ranked across all
    regions for a year.
    """

    report = models.ForeignKey(ApbdReport, on_delete=models.CASCADE, related_name="lines")
    line_index = models.IntegerField()
    akun = models.CharField(max_length=255)             # verbatim label (stripped)
    akun_key = models.CharField(max_length=128, db_index=True)
    anggaran = models.FloatField(null=True, blank=True)
    realisasi = models.FloatField(null=True, blank=True)
    persentase = models.FloatField(null=True, blank=True)

    class Meta:
        unique_together = ("report", "line_index")
        indexes = [
            models.Index(fields=["akun_key"]),
        ]
        ordering = ["report", "line_index"]

    def __str__(self):
        return f"{self.report_id}:{self.line_index} {self.akun}"
