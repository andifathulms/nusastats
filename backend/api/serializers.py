from rest_framework import serializers

from catalog.models import CoverageRecord, CoverageStatusChange, SimdasiCoverageRecord, SimdasiTable, Variable


class CoverageStatusChangeSerializer(serializers.ModelSerializer):
    class Meta:
        model = CoverageStatusChange
        fields = ["previous_status", "new_status", "changed_at"]


class CoverageRecordSerializer(serializers.ModelSerializer):
    domain_id = serializers.CharField(source="domain.domain_id")
    domain_name = serializers.CharField(source="domain.domain_name")
    status_changes = CoverageStatusChangeSerializer(many=True, read_only=True)

    class Meta:
        model = CoverageRecord
        fields = [
            "id",
            "domain_id",
            "domain_name",
            "admin_level",
            "model_type",
            "status",
            "years_confirmed",
            "last_checked_at",
            "status_changes",
        ]


class VariableListSerializer(serializers.ModelSerializer):
    subject_name = serializers.CharField(source="subject.name", read_only=True)
    subject_category = serializers.CharField(source="subject.subject_category.name", read_only=True)

    class Meta:
        model = Variable
        fields = [
            "id",
            "variable_id",
            "name",
            "unit",
            "data_model",
            "subject_name",
            "subject_category",
        ]


class VariableDetailSerializer(VariableListSerializer):
    coverage_records = CoverageRecordSerializer(many=True, read_only=True)

    class Meta(VariableListSerializer.Meta):
        fields = VariableListSerializer.Meta.fields + ["note", "coverage_records"]


class SimdasiCoverageRecordSerializer(serializers.ModelSerializer):
    class Meta:
        model = SimdasiCoverageRecord
        fields = ["mfd_region_code", "status", "years_confirmed", "last_checked_at"]


class SimdasiTableSerializer(serializers.ModelSerializer):
    coverage_records = SimdasiCoverageRecordSerializer(many=True, read_only=True)

    class Meta:
        model = SimdasiTable
        fields = ["id", "table_id", "subject_name", "title", "coverage_records"]
