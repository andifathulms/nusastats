"""Terrain & land cover indicators per region (Peta Wilayah, docs/FEATURE-peta-wilayah.md §5.4).

Self-contained like `dukcapil` and `djpk`: shares nothing with the BPS stack.
Values are deterministic computations by the data/peta_wilayah pipeline over
Copernicus DEM GLO-30 and ESA WorldCover 2021 tiles, keyed by Kemendagri code
(2/4/6 digits). The audit trail mirrors the other sources' fetch logs:

* `PetaSourceFile` — every input tile, with the sha256 of its exact bytes;
* `PetaRegion.source_files` — which tiles each region's numbers came from;
* `PetaLoadLog` — every load of the committed export (its sha256 + counts).

Nothing here is estimated: a region that the pipeline has not computed simply
has no row.
"""

from django.db import models


class PetaLevel(models.TextChoices):
    PROVINCE = "province", "Provinsi"
    REGENCY = "regency", "Kabupaten/Kota"
    DISTRICT = "district", "Kecamatan"


class PetaLoadLog(models.Model):
    """One row per `load_peta` run: which export file, its hash, what it held."""

    path = models.CharField(max_length=255)
    export_sha256 = models.CharField(max_length=64)
    areas = models.IntegerField()
    values = models.IntegerField()
    datasets = models.JSONField(default=dict)  # dataset descriptions incl. licence & attribution
    loaded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-loaded_at"]


class PetaSourceFile(models.Model):
    """An input file (DEM / WorldCover tile or tile index) with its sha256."""

    dataset = models.CharField(max_length=64)
    key = models.CharField(max_length=128)
    url = models.TextField()
    sha256 = models.CharField(max_length=64)
    bytes = models.BigIntegerField()
    downloaded_at = models.CharField(max_length=32)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["dataset", "key"], name="peta_sourcefile_unique")]

    def __str__(self):
        return f"{self.dataset}/{self.key}"


class PetaIndicator(models.Model):
    """Catalog metadata, seeded from `peta.indicators` (single source of truth)."""

    key = models.CharField(max_length=64, unique=True)
    label_id = models.CharField(max_length=128)
    group = models.CharField(max_length=32)
    unit = models.CharField(max_length=16, blank=True)
    dataset = models.CharField(max_length=64)
    method = models.TextField()
    sort = models.IntegerField(default=0)
    yearly = models.BooleanField(default=False)  # values carry a year (time series)

    class Meta:
        ordering = ["sort", "key"]

    def __str__(self):
        return f"{self.key} — {self.label_id}"


class PetaRegion(models.Model):
    code = models.CharField(max_length=8, unique=True)  # Kemendagri, no dots
    level = models.CharField(max_length=16, choices=PetaLevel.choices)
    name = models.CharField(max_length=255)
    prov_code = models.CharField(max_length=2, db_index=True)
    parent_code = models.CharField(max_length=8, blank=True, db_index=True)
    area_km2 = models.FloatField(null=True)
    terrain_class = models.CharField(max_length=32, blank=True)
    terrain_class_label = models.CharField(max_length=64, blank=True)
    terrain_class_reason = models.TextField(blank=True)
    highest_point = models.JSONField(null=True)  # {elevation_m, lon, lat}
    landcover_year = models.IntegerField(null=True)
    terrain_provenance = models.JSONField(null=True)
    landcover_provenance = models.JSONField(null=True)
    nightlights_provenance = models.JSONField(null=True)
    source_files = models.ManyToManyField(PetaSourceFile, related_name="regions")
    load_log = models.ForeignKey(PetaLoadLog, null=True, on_delete=models.SET_NULL, related_name="regions")

    class Meta:
        ordering = ["code"]

    def __str__(self):
        return f"[{self.level}] {self.code} {self.name}"


class PetaValue(models.Model):
    region = models.ForeignKey(PetaRegion, on_delete=models.CASCADE, related_name="values")
    indicator = models.ForeignKey(PetaIndicator, on_delete=models.CASCADE, related_name="values")
    # Data year for time series (night lights); 0 = not time-varying (terrain,
    # land cover). Not nullable, so the unique constraint stays meaningful.
    year = models.IntegerField(default=0)
    value = models.FloatField()

    class Meta:
        constraints = [models.UniqueConstraint(fields=["region", "indicator", "year"], name="peta_value_unique_year")]
        indexes = [models.Index(fields=["indicator", "year", "value"])]
