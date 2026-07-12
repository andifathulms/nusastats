"""Serializers for the DJPK/SIKD regional-finance read API (`/api/djpk/`)."""

from rest_framework import serializers

from djpk.models import ApbdAccount, ApbdRegion


class ApbdRegionSerializer(serializers.ModelSerializer):
    class Meta:
        model = ApbdRegion
        fields = [
            "djpk_code", "djpk_prov", "djpk_pemda", "level", "name",
            "prov_name", "kemendagri_code", "match_method",
        ]


class ApbdAccountSerializer(serializers.ModelSerializer):
    class Meta:
        model = ApbdAccount
        fields = ["akun_key", "label_id", "group", "parent_key", "sort"]
