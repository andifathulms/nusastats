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

    class Meta:
        model = Domain
        fields = ["domain_id", "domain_name", "admin_level", "parent_province_id"]


class VariableWithDataSerializer(serializers.ModelSerializer):
    """A Variable annotated (in the view) with data-availability figures,
    so a browser UI can show 'how much is here' without a second call."""

    subject_name = serializers.CharField(source="subject.name", read_only=True)
    subject_category = serializers.CharField(source="subject.subject_category.name", read_only=True)
    data_point_count = serializers.IntegerField(read_only=True)
    year_min = serializers.IntegerField(read_only=True)
    year_max = serializers.IntegerField(read_only=True)

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
