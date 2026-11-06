"""load_big_area: kecamatan/kabupaten areas cover every BIG desa under their code."""

import json

import pytest
from django.core.management import call_command

from dukcapil.models import DukcapilRegion


@pytest.mark.django_db
def test_areas_include_desa_dukcapil_does_not_list(tmp_path):
    common = dict(period="2026-10", fetched_at="2026-10-01T00:00:00Z")
    DukcapilRegion.objects.create(code="92", level="province", name="Papua Barat", **common)
    DukcapilRegion.objects.create(code="9202", level="regency", name="Manokwari", **common)
    DukcapilRegion.objects.create(code="920201", level="district", name="Manokwari Barat", **common)
    DukcapilRegion.objects.create(code="9202012001", level="village", name="Amban", **common)
    area = {
        "9202012001": 2.0,  # listed
        "9202012009": 1.5,  # newer desa, not in Dukcapil yet: counts in its kecamatan and kabupaten
        "9201012001": 7.0,  # pre-split Papua Barat Daya code: no Dukcapil kabupaten, never counts
    }
    path = tmp_path / "big_area.json"
    path.write_text(json.dumps(area))

    call_command("load_big_area", "--period", "2026-10", "--path", str(path))

    got = dict(DukcapilRegion.objects.values_list("code", "luas_big"))
    assert got == {"92": 3.5, "9202": 3.5, "920201": 3.5, "9202012001": 2.0}
