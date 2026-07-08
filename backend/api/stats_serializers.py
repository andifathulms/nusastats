"""Serializers for the stats data API (the actual statistical values in
stats.DataPoint), distinct from the coverage-metadata serializers in
serializers.py. This is the analytics-facing read layer the frontend and
any downstream analysis consume.
"""

from rest_framework import serializers

from catalog.models import Domain, Variable
from stats.models import DataPoint


class RegionSerializer(serializers.ModelSerializer):
    parent_province_id = serializers.CharField(source="parent_province.domain_id", default=None)
    parent_province_name = serializers.CharField(source="parent_province.domain_name", default=None)

    class Meta:
        model = Domain
        fields = ["domain_id", "domain_name", "admin_level", "parent_province_id", "parent_province_name"]


class VariableWithDataSerializer(serializers.ModelSerializer):
    """A Variable with its denormalized data-availability figures (see
    Variable.stat_* fields), so a browser UI can show 'how much is here'
    without aggregating the DataPoint table per request."""

    subject_name = serializers.CharField(source="subject.name", read_only=True)
    subject_category = serializers.CharField(source="subject.subject_category.name", read_only=True)
    data_point_count = serializers.IntegerField(source="stat_data_points", read_only=True)
    year_min = serializers.IntegerField(source="stat_year_min", read_only=True)
    year_max = serializers.IntegerField(source="stat_year_max", read_only=True)
    admin_levels = serializers.SerializerMethodField()

    def get_admin_levels(self, obj) -> list:
        return obj.stat_admin_levels.split(",") if obj.stat_admin_levels else []

    class Meta:
        model = Variable
        fields = [
            "id",
            "variable_id",
            "name",
            "unit",
            "subject_name",
            "subject_category",
            "data_point_count",
            "year_min",
            "year_max",
            "admin_levels",
        ]


class DataPointSerializer(serializers.ModelSerializer):
    domain_id = serializers.CharField(source="domain.domain_id", read_only=True)
    domain_name = serializers.CharField(source="domain.domain_name", read_only=True)

    class Meta:
        model = DataPoint
        fields = [
            "domain_id",
            "domain_name",
            "admin_level",
            "year",
            "vervar_id",
            "vervar_label",
            "turvar_id",
            "turvar_label",
            "value",
        ]
