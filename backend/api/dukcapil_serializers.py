from rest_framework import serializers

from dukcapil.models import DukcapilIndicator, DukcapilRegion


class DukcapilIndicatorSerializer(serializers.ModelSerializer):
    class Meta:
        model = DukcapilIndicator
        fields = ("field", "label_id", "group", "unit", "is_string", "sort")


class DukcapilRegionSerializer(serializers.ModelSerializer):
    """Light region row for pickers/lists (no heavy attributes blob)."""

    parent_name = serializers.CharField(source="parent.name", default=None, read_only=True)

    class Meta:
        model = DukcapilRegion
        fields = ("code", "level", "name", "parent_code", "parent_name")
