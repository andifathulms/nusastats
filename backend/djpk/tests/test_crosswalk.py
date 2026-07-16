import pytest
from django.utils import timezone

from djpk.crosswalk import build_crosswalk, normalize_name
from djpk.models import ApbdRegion, RegionLevel
from dukcapil.models import DukcapilLevel, DukcapilRegion

PERIOD = "2026-07"


def _dukcapil_province(code, name):
    DukcapilRegion.objects.create(
        code=code, level=DukcapilLevel.PROVINCE, name=name, status="Provinsi",
        period=PERIOD, attributes={}, fetched_at=timezone.now(),
    )


def _dukcapil_regency(code, name, status, prov_code):
    DukcapilRegion.objects.create(
        code=code, level=DukcapilLevel.REGENCY, name=name, status=status,
        prov_code=prov_code, period=PERIOD, attributes={}, fetched_at=timezone.now(),
    )


def _djpk_region(djpk_prov, djpk_pemda, level, name, prov_name=""):
    return ApbdRegion.objects.create(
        djpk_prov=djpk_prov, djpk_pemda=djpk_pemda, djpk_code=f"{djpk_prov}{djpk_pemda}",
        level=level, name=name, prov_name=prov_name,
    )


@pytest.fixture
def jabar(db):
    """Jawa Barat with a kabupaten and a kota of the SAME name — the case that
    `normalize_name` alone cannot tell apart."""
    _dukcapil_province("32", "Jawa Barat")
    _dukcapil_regency("3201", "Bogor", "Kabupaten", "32")
    _dukcapil_regency("3271", "Bogor", "Kota", "32")

    _djpk_region("10", "00", RegionLevel.PROVINCE, "Prov. Jawa Barat", "Prov. Jawa Barat")
    _djpk_region("10", "03", RegionLevel.REGENCY, "Kab. Bogor", "Prov. Jawa Barat")
    _djpk_region("10", "19", RegionLevel.REGENCY, "Kota Bogor", "Prov. Jawa Barat")


def test_normalize_name_drops_the_type_prefix():
    # Precisely why the family must be part of the match key: these collide.
    assert normalize_name("Kab. Bogor") == normalize_name("Kota Bogor") == "BOGOR"


@pytest.mark.django_db
def test_kabupaten_and_kota_of_same_name_get_their_own_codes(jabar):
    summary = build_crosswalk()

    assert summary["unmatched"] == 0
    codes = {r.name: r.kemendagri_code for r in ApbdRegion.objects.all()}
    assert codes == {
        "Prov. Jawa Barat": "32",
        "Kab. Bogor": "3201",
        "Kota Bogor": "3271",
    }


@pytest.mark.django_db
def test_no_two_regencies_share_a_kemendagri_code(jabar):
    build_crosswalk()

    matched = [r.kemendagri_code for r in ApbdRegion.objects.filter(level=RegionLevel.REGENCY)]
    assert len(matched) == len(set(matched))


@pytest.mark.django_db
def test_regency_that_changed_province_falls_back_to_a_national_match(db):
    """The Papua reorg: DJPK still files Merauke under old-Papua, while
    Kemendagri has moved it to Papua Selatan. The province-scoped pass misses,
    so the national (family + name) fallback must catch it."""
    _dukcapil_province("91", "Papua")
    _dukcapil_province("93", "Papua Selatan")
    _dukcapil_regency("9301", "Merauke", "Kabupaten", "93")

    _djpk_region("26", "00", RegionLevel.PROVINCE, "Prov. Papua", "Prov. Papua")
    _djpk_region("26", "04", RegionLevel.REGENCY, "Kab. Merauke", "Prov. Papua")

    build_crosswalk()

    merauke = ApbdRegion.objects.get(name="Kab. Merauke")
    assert merauke.kemendagri_code == "9301"
    assert merauke.match_method == "name-national"


@pytest.mark.django_db
def test_unmatched_region_is_left_blank_and_reported(db):
    """A name with no Kemendagri counterpart is never guessed at."""
    _dukcapil_province("32", "Jawa Barat")
    _djpk_region("10", "00", RegionLevel.PROVINCE, "Prov. Jawa Barat", "Prov. Jawa Barat")
    _djpk_region("10", "77", RegionLevel.REGENCY, "Kab. Wakanda", "Prov. Jawa Barat")

    summary = build_crosswalk()

    wakanda = ApbdRegion.objects.get(name="Kab. Wakanda")
    assert wakanda.kemendagri_code == ""
    assert wakanda.match_method == ""
    assert summary["unmatched"] == 1
    assert any("Wakanda" in n for n in summary["unmatched_names"])
