from rest_framework import serializers

from dukcapil.models import DukcapilIndicator, DukcapilLevel, DukcapilRegion
from dukcapil.normalize import title_case


class DukcapilIndicatorSerializer(serializers.ModelSerializer):
    class Meta:
        model = DukcapilIndicator
        fields = ("field", "label_id", "group", "unit", "is_string", "sort")


class DukcapilRegionSerializer(serializers.ModelSerializer):
    """Light region row for pickers/lists (no heavy attributes blob)."""

    parent_name = serializers.SerializerMethodField()

    class Meta:
        model = DukcapilRegion
        fields = ("code", "level", "name", "status", "parent_code", "parent_name")

    def get_parent_name(self, obj):
        if obj.parent_id:
            return obj.parent.name
        # Dukcapil's kecamatan layer lags its desa layer: a desa can sit in a
        # newer kecamatan (Takalar's 730511 Polongbangkeng Timur) that has no
        # kecamatan row yet. The desa row itself names it (nama_kec, upstream).
        if obj.level == DukcapilLevel.VILLAGE and obj.nama_kec:
            return title_case(obj.nama_kec)
        return None
