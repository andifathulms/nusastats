from django.db import models


class AdminLevel(models.TextChoices):
    NATIONAL = "national", "National"
    PROVINCE = "province", "Province"
    REGENCY = "regency", "Regency/Kabupaten-Kota"


class DataModelType(models.TextChoices):
    """The BPS data source a Variable belongs to (PRD §1 lists these as
    distinct systems queried differently). SIMDASI is deliberately excluded
    here — it has its own SimdasiTable/SimdasiCoverageRecord pair because
    it is region-scoped rather than variable-scoped (PRD §5.4)."""

    DYNAMIC = "dynamic", "Dynamic Data"
    STATIC_TABLE = "static_table", "Static Table"
    SDGS = "sdgs", "SDGs"
    SDDS = "sdds", "SDDS"
    FOREIGN_TRADE = "foreign_trade", "Foreign Trade"


class CoverageStatus(models.TextChoices):
    CONFIRMED = "confirmed", "Confirmed"
    NOT_CONFIRMED = "not_confirmed", "Not confirmed"
    UNCHECKED = "unchecked", "Unchecked"
    ERROR = "error", "Error"


class Domain(models.Model):
    """A BPS domain: nasional (0000), a province, or a kabupaten/kota."""

    domain_id = models.CharField(max_length=16, unique=True)
    domain_name = models.CharField(max_length=255)
    domain_url = models.CharField(max_length=255, blank=True)
    admin_level = models.CharField(max_length=16, choices=AdminLevel.choices)
    parent_province = models.ForeignKey(
        "self",
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="regencies",
        limit_choices_to={"admin_level": AdminLevel.PROVINCE},
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["domain_id"]

    def __str__(self):
        return f"{self.domain_id} - {self.domain_name}"


class SubjectCategory(models.Model):
    subject_category_id = models.CharField(max_length=16)
    domain = models.ForeignKey(Domain, on_delete=models.CASCADE, related_name="subject_categories")
    name = models.CharField(max_length=255)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ("subject_category_id", "domain")
        verbose_name_plural = "subject categories"

    def __str__(self):
        return self.name


class Subject(models.Model):
    subject_id = models.CharField(max_length=16)
    subject_category = models.ForeignKey(
        SubjectCategory, on_delete=models.CASCADE, related_name="subjects"
    )
    domain = models.ForeignKey(Domain, on_delete=models.CASCADE, related_name="subjects")
    name = models.CharField(max_length=255)
    # Resume cursor for incremental metadata discovery (crawler.metadata):
    # set once this subject's variable list has been fetched, so a later
    # run picks the next not-yet-crawled subject instead of re-fetching
    # the same ones every time.
    metadata_crawled_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ("subject_id", "domain")

    def __str__(self):
        return self.name


class Variable(models.Model):
    variable_id = models.CharField(max_length=16)
    subject = models.ForeignKey(Subject, on_delete=models.CASCADE, related_name="variables")
    domain = models.ForeignKey(Domain, on_delete=models.CASCADE, related_name="variables")
    data_model = models.CharField(
        max_length=16, choices=DataModelType.choices, default=DataModelType.DYNAMIC
    )
    name = models.CharField(max_length=500)
    unit = models.CharField(max_length=255, blank=True)
    note = models.TextField(blank=True)
    # Denormalized data-availability figures, refreshed after each ingest
    # (stats.aggregates.refresh_variable_stats). They let the browse/filter
    # API answer "how much data, which years, which admin levels" from a
    # ~1,700-row table instead of aggregating the 2.7M-row DataPoint table
    # on every request (browse dropped from ~1-2s to a few ms).
    stat_data_points = models.PositiveIntegerField(default=0)
    stat_year_min = models.PositiveIntegerField(null=True, blank=True)
    stat_year_max = models.PositiveIntegerField(null=True, blank=True)
    # Comma-joined admin levels present (e.g. "national,province,regency").
    # A CharField (not JSON) so the `contains` filter works identically on
    # SQLite (tests) and Postgres; the level names are distinct enough that
    # none is a substring of another, so a plain contains is unambiguous.
    stat_admin_levels = models.CharField(max_length=64, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ("variable_id", "domain", "data_model")
        ordering = ["id"]

    def __str__(self):
        return self.name


class VerticalVariable(models.Model):
    """A vervar entry: the region breakdown a Variable's metadata *claims*
    to support (label-level claim — PRD §5.2 — not yet confirmed by data)."""

    vervar_id = models.CharField(max_length=16)
    variable = models.ForeignKey(Variable, on_delete=models.CASCADE, related_name="vertical_variables")
    name = models.CharField(max_length=255)
    claimed_domain = models.ForeignKey(
        Domain, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("vervar_id", "variable")

    def __str__(self):
        return f"{self.variable.variable_id}:{self.vervar_id} {self.name}"


class PeriodData(models.Model):
    """A th (period/year) entry a Variable's metadata claims to cover."""

    period_id = models.CharField(max_length=16)
    variable = models.ForeignKey(Variable, on_delete=models.CASCADE, related_name="periods")
    label = models.CharField(max_length=64)
    year = models.PositiveIntegerField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("period_id", "variable")

    def __str__(self):
        return f"{self.variable_id}:{self.label}"


class CoverageCheckLog(models.Model):
    """Raw call metadata for one real HTTP request made to the BPS WebAPI.

    Storage decision: raw response bodies are stored inline as JSONField
    rather than flat files. BPS `data`-model responses are small (typically
    well under 100KB), so keeping them in Postgres alongside the metadata
    keeps the audit trail (CLAUDE.md rule 2) queryable in one place without
    the operational overhead of a separate blob store. Revisit if payload
    sizes grow enough to bloat the table.
    """

    url = models.TextField(help_text="Exact URL called, with the API key redacted.")
    http_status = models.PositiveIntegerField(null=True, blank=True)
    requested_at = models.DateTimeField(auto_now_add=True)
    response_hash = models.CharField(max_length=64, help_text="sha256 of the raw response body.")
    raw_body = models.JSONField(null=True, blank=True)
    is_error = models.BooleanField(default=False)
    error_detail = models.TextField(blank=True)

    class Meta:
        ordering = ["-requested_at"]

    def __str__(self):
        return f"{self.http_status} {self.url} @ {self.requested_at:%Y-%m-%d %H:%M}"


class CoverageRecord(models.Model):
    """One (variable, domain) coverage fact. Idempotent: re-crawling
    updates this row via get_or_create/upsert (CLAUDE.md rule 3) rather
    than inserting a duplicate; status transitions are appended to
    CoverageStatusChange below.
    """

    variable = models.ForeignKey(Variable, on_delete=models.CASCADE, related_name="coverage_records")
    domain = models.ForeignKey(Domain, on_delete=models.CASCADE, related_name="coverage_records")
    # Denormalized from Variable.data_model at write time — part of the
    # idempotency key alongside (variable, domain) per CLAUDE.md rule 3,
    # so the same variable_id checked under a different data model doesn't
    # collide with an unrelated coverage fact.
    model_type = models.CharField(max_length=16, choices=DataModelType.choices)
    admin_level = models.CharField(max_length=16, choices=AdminLevel.choices)
    status = models.CharField(
        max_length=16, choices=CoverageStatus.choices, default=CoverageStatus.UNCHECKED
    )
    years_confirmed = models.JSONField(default=list, blank=True)
    last_checked_at = models.DateTimeField(null=True, blank=True)
    last_check_log = models.ForeignKey(
        CoverageCheckLog, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ("variable", "domain", "model_type")
        indexes = [
            models.Index(fields=["admin_level", "status"]),
        ]

    def __str__(self):
        return f"{self.variable} @ {self.domain} [{self.status}]"


class CoverageStatusChange(models.Model):
    """Append-only history of status transitions for a CoverageRecord
    (CLAUDE.md rule 3: 'appends to a history table if status changed').
    """

    coverage_record = models.ForeignKey(
        CoverageRecord, on_delete=models.CASCADE, related_name="status_changes"
    )
    previous_status = models.CharField(max_length=16, choices=CoverageStatus.choices)
    new_status = models.CharField(max_length=16, choices=CoverageStatus.choices)
    check_log = models.ForeignKey(
        CoverageCheckLog, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    changed_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-changed_at"]

    def __str__(self):
        return f"{self.coverage_record_id}: {self.previous_status} -> {self.new_status}"


class SimdasiTable(models.Model):
    """A SIMDASI master table (subject/table catalog entry, separate
    system from the Dynamic Data variables above — PRD §5.4)."""

    table_id = models.CharField(max_length=32, unique=True)
    subject_name = models.CharField(max_length=255)
    title = models.CharField(max_length=500)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["id"]

    def __str__(self):
        return self.title


class SimdasiCoverageRecord(models.Model):
    """One (table, MFD region code) coverage fact for SIMDASI, since
    SIMDASI is queried per-region rather than per-national-variable."""

    table = models.ForeignKey(SimdasiTable, on_delete=models.CASCADE, related_name="coverage_records")
    mfd_region_code = models.CharField(max_length=7)
    status = models.CharField(
        max_length=16, choices=CoverageStatus.choices, default=CoverageStatus.UNCHECKED
    )
    years_confirmed = models.JSONField(
        default=list, blank=True, help_text="ketersediaan_tahun values confirmed present."
    )
    last_checked_at = models.DateTimeField(null=True, blank=True)
    last_check_log = models.ForeignKey(
        CoverageCheckLog, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ("table", "mfd_region_code")

    def __str__(self):
        return f"{self.table} @ {self.mfd_region_code} [{self.status}]"
