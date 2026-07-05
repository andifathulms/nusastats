from django.db import models


class DataPoint(models.Model):
    """One real statistical value for (variable, domain, period, turvar).

    Unlike Cakupan's CoverageRecord (which only records *whether* data
    exists), this stores the actual value — but only ever for variables
    Cakupan has confirmed as available (see stats/ingest.py). Every row
    traces to the CoverageCheckLog it was decoded from, inheriting
    Cakupan's audit-trail principle: no value here was ever inferred or
    estimated, only parsed from a real stored HTTP response.

    `admin_level` and `year` are denormalized from `domain`/`period` for
    query convenience (this table is meant to be queried in bulk — "give
    me this variable's time series for every regency" — not joined
    row-by-row), matching the same tradeoff CoverageRecord already makes.
    """

    variable = models.ForeignKey("catalog.Variable", on_delete=models.CASCADE, related_name="data_points")
    domain = models.ForeignKey("catalog.Domain", on_delete=models.CASCADE, related_name="data_points")
    period = models.ForeignKey("catalog.PeriodData", on_delete=models.CASCADE, related_name="data_points")
    admin_level = models.CharField(max_length=16)
    year = models.PositiveIntegerField(null=True, blank=True)

    # BPS's secondary breakdown dimension (e.g. gender: laki-laki vs
    # perempuan). turvar_id "0" conventionally means "no breakdown/total".
    turvar_id = models.CharField(max_length=16, default="0")
    turvar_label = models.CharField(max_length=255, blank=True)

    value = models.FloatField()

    source_check_log = models.ForeignKey(
        "catalog.CoverageCheckLog", on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    fetched_at = models.DateTimeField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("variable", "domain", "period", "turvar_id")
        indexes = [
            models.Index(fields=["domain", "period"]),
            models.Index(fields=["variable", "period"]),
            models.Index(fields=["admin_level", "year"]),
        ]
        ordering = ["variable_id", "domain_id", "period_id", "turvar_id"]

    def __str__(self):
        return f"{self.variable_id}@{self.domain_id}/{self.period_id} ({self.turvar_label or 'total'}) = {self.value}"
