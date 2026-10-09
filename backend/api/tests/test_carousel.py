"""carousel-data/1 packs (api.carousel): one source, complete or refused,
codes in the source's scheme, map codes through the crosswalks."""

import json

import pytest
from django.core.management import CommandError, call_command
from rest_framework.test import APIClient

from catalog.models import AdminLevel, CoverageCheckLog, Domain, PeriodData, Subject, SubjectCategory, Variable
from djpk.models import ApbdLine, ApbdRegion, ApbdReport, RegionLevel
from dukcapil.models import DukcapilIndicator, DukcapilRegion
from stats.models import DataPoint

from api.carousel import PackError, build_pack, slugify

PERIOD = "2026-10"


def _duk(code, name, status, level="regency", **attrs):
    return DukcapilRegion.objects.create(
        code=code, name=name, status=status, level=level, period=PERIOD, prov_code=code[:2],
        kab_code=code[:4] if len(code) >= 4 else "", attributes=attrs, fetched_at="2026-10-01T00:00:00Z",
    )


@pytest.fixture
def bps(db):
    """Three Aceh regencies plus a moved Papua kabupaten (old 9416, new 9707),
    with Dukcapil regencies for the map crosswalk."""
    national = Domain.objects.create(domain_id="0000", domain_name="Indonesia", admin_level=AdminLevel.NATIONAL)
    aceh = Domain.objects.create(domain_id="1100", domain_name="Aceh", admin_level=AdminLevel.PROVINCE)
    papua = Domain.objects.create(domain_id="9400", domain_name="Papua", admin_level=AdminLevel.PROVINCE)
    peg = Domain.objects.create(domain_id="9700", domain_name="Papua Pegunungan", admin_level=AdminLevel.PROVINCE)
    regs = {
        "1101": Domain.objects.create(domain_id="1101", domain_name="Simeulue", admin_level=AdminLevel.REGENCY,
                                      parent_province=aceh),
        "1102": Domain.objects.create(domain_id="1102", domain_name="Aceh Singkil", admin_level=AdminLevel.REGENCY,
                                      parent_province=aceh),
        "1171": Domain.objects.create(domain_id="1171", domain_name="Banda Aceh", admin_level=AdminLevel.REGENCY,
                                      parent_province=aceh),
    }
    old = Domain.objects.create(domain_id="9416", domain_name="Yahukimo", admin_level=AdminLevel.REGENCY,
                                parent_province=papua)
    regs["9707"] = Domain.objects.create(domain_id="9707", domain_name="Yahukimo", admin_level=AdminLevel.REGENCY,
                                         parent_province=peg, predecessor=old)
    cat = SubjectCategory.objects.create(subject_category_id="1", domain=national, name="Sosial")
    subject = Subject.objects.create(subject_id="26", subject_category=cat, domain=national, name="IPM")
    var = Variable.objects.create(variable_id="415", subject=subject, domain=national,
                                  name="Rata-rata Lama Sekolah", unit="Tahun")
    period = PeriodData.objects.create(period_id="125", variable=var, label="2025", year=2025)
    log = CoverageCheckLog.objects.create(url="https://webapi.bps.go.id/v1/api/list/model/data/domain/0000/var/415/"
                                              "th/125/key/***REDACTED***/", http_status=200, response_hash="f" * 64)
    for code, value in (("1101", 9.1), ("1102", 8.7), ("1171", 13.37), ("9707", 3.6)):
        DataPoint.objects.create(variable=var, domain=regs[code], period=period, admin_level=AdminLevel.REGENCY,
                                 year=2025, vervar_id=code, turvar_id="0", value=value, source_check_log=log,
                                 fetched_at="2026-10-01T00:00:00Z")
    # Kemendagri numbers Aceh Singkil 1110 and Simeulue 1109; the crosswalk
    # matches by name, never by code (BPS 1102 is Aceh Tenggara in Kemendagri).
    _duk("1102", "Aceh Tenggara", "Kabupaten")
    _duk("1109", "Simeulue", "Kabupaten")
    _duk("1110", "Aceh Singkil", "Kabupaten")
    _duk("1171", "Banda Aceh", "Kota")
    _duk("9507", "Yahukimo", "Kabupaten")
    return var, log


@pytest.mark.django_db
def test_bps_pack_shape_labels_and_crosswalked_map(bps):
    result = build_pack("bps", "415", "kabupaten", "2025", top=1, bottom=1, allow_partial=True)
    pack = result["pack"]

    assert pack["format"] == "carousel-data/1"
    assert pack["id"] == "bps-415-kab-2025"
    assert pack["unit"] == "Tahun"
    assert pack["rows"] == [
        {"label": "Kota Banda Aceh", "code": "1171", "value": 13.37},
        {"label": "Kab. Yahukimo", "code": "9707", "value": 3.6},
    ]
    geo = {v["code"]: v["geo"] for v in result["map"]["values"]}
    assert geo == {"1101": "1109", "1102": "1110", "1171": "1171", "9707": "9507"}
    assert "kode BPS baru" in pack["notes"]
    assert result["provenance"]["rows"][0]["sha256"] == "f" * 64


@pytest.mark.django_db
def test_bps_universe_counts_successor_not_old_code(bps):
    # 4 current regencies (9416 is replaced by 9707), all 4 have values.
    result = build_pack("bps", "415", "kabupaten", "2025")
    assert result["map"]["n"] == result["map"]["expected"] == 4
    assert "n =" not in result["pack"]["notes"]


@pytest.mark.django_db
def test_partial_coverage_is_refused_then_noted(bps):
    DataPoint.objects.filter(domain__domain_id="1102").delete()
    with pytest.raises(PackError, match="n = 3 dari 4"):
        build_pack("bps", "415", "kabupaten", "2025")
    pack = build_pack("bps", "415", "kabupaten", "2025", allow_partial=True)["pack"]
    assert "n = 3 dari 4 kabupaten/kota" in pack["notes"]


@pytest.mark.django_db
def test_bps_with_several_breakdowns_needs_turvar(bps):
    var, log = bps
    dp = DataPoint.objects.first()
    DataPoint.objects.create(variable=var, domain=dp.domain, period=dp.period, admin_level=AdminLevel.REGENCY,
                             year=2025, vervar_id=dp.vervar_id, turvar_id="211", turvar_label="Laki-laki",
                             value=1.0, source_check_log=log, fetched_at="2026-10-01T00:00:00Z")
    with pytest.raises(PackError, match="turvar="):
        build_pack("bps", "415", "kabupaten", "2025")
    assert build_pack("bps", "415", "kabupaten", "2025", turvar="0")["map"]["n"] == 4


@pytest.mark.django_db
def test_bps_without_unit_is_refused(bps):
    var, _ = bps
    var.unit = "Tidak Ada Satuan"
    var.save()
    with pytest.raises(PackError, match="unit="):
        build_pack("bps", "415", "kabupaten", "2025")
    assert build_pack("bps", "415", "kabupaten", "2025", unit="tahun")["pack"]["unit"] == "tahun"


@pytest.mark.django_db
def test_province_scope_uses_kemendagri_codes(bps):
    result = build_pack("bps", "415", "kabupaten", "2025", prov="95")
    assert [r["code"] for r in result["pack"]["rows"]] == ["9707"]
    assert result["map"]["expected"] == 1


@pytest.mark.django_db
def test_dukcapil_pack_labels_and_notes(db):
    DukcapilIndicator.objects.create(field="jumlah_penduduk", label_id="Jumlah Penduduk", group="Umum", unit="jiwa")
    _duk("6471", "Balikpapan", "Kota", jumlah_penduduk=700000)
    _duk("6472", "Samarinda", "Kota", jumlah_penduduk=850000)
    _duk("3171", "Jakarta Selatan", "Kota Administrasi", jumlah_penduduk=2300000)

    pack = build_pack("dukcapil", "jumlah_penduduk", "kabupaten")["pack"]

    assert pack["rows"][0] == {"label": "Kota Adm. Jakarta Selatan", "code": "3171", "value": 2300000}
    assert pack["period"] == PERIOD
    assert "bukan hasil sensus" in pack["notes"]
    assert pack["source"].endswith("diakses Okt 2026")


@pytest.mark.django_db
def test_djpk_two_rows_on_one_kemendagri_region_is_refused(db):
    for djpk_code, name in (("2601", "Kab. Yahukimo"), ("3701", "Kab. Yahukimo")):
        region = ApbdRegion.objects.create(djpk_prov=djpk_code[:2], djpk_pemda=djpk_code[2:], djpk_code=djpk_code,
                                           level=RegionLevel.REGENCY, name=name, kemendagri_code="9507")
        report = ApbdReport.objects.create(region=region, tahun=2024, report_type="realisasi", periode=12,
                                           fetched_at="2026-01-01T00:00:00Z")
        ApbdLine.objects.create(report=report, line_index=0, akun="PAD", akun_key="pad", realisasi=5.0)
    with pytest.raises(PackError, match="9507"):
        build_pack("djpk", "pad", "kabupaten", "2024")


@pytest.mark.django_db
def test_endpoint_returns_422_with_the_reason(bps):
    client = APIClient()
    ok = client.get("/api/carousel/pack/?source=bps&metric=415&level=kabupaten&period=2025")
    assert ok.status_code == 200 and ok.data["pack"]["rows"][0]["code"] == "1171"
    bad = client.get("/api/carousel/pack/?source=bps&metric=415&level=kecamatan&period=2025")
    assert bad.status_code == 422 and "kecamatan" in bad.data["error"]


@pytest.mark.django_db
def test_command_writes_pack_and_provenance(bps, tmp_path):
    out, prov = tmp_path / "pack.json", tmp_path / "prov.json"
    call_command("export_carousel_pack", "--source", "bps", "--metric", "415", "--level", "kabupaten",
                 "--period", "2025", "--out", str(out), "--provenance", str(prov))
    assert json.loads(out.read_text())["id"] == "bps-415-kab-2025"
    assert json.loads(prov.read_text())["rows"][0]["check_log_id"]
    with pytest.raises(CommandError):
        call_command("export_carousel_pack", "--source", "bps", "--metric", "999", "--level", "kabupaten",
                     "--period", "2025")


def test_pack_ids_keep_level_period_and_province_under_the_cap():
    from api.carousel import pack_slug

    national = pack_slug("dukcapil", "jumlah_penduduk", "kecamatan", "2026-10")
    dki = pack_slug("dukcapil", "jumlah_penduduk", "kecamatan", "2026-10", "31")
    assert national != dki
    assert dki.endswith("-kec-2026-10-31") and len(dki) <= 40


def test_slugify_matches_carousel_press():
    assert slugify("Pengeluaran per Kapita — Jakarta Selatan, 2025") == "pengeluaran-per-kapita-jakarta-selatan-2"
    assert slugify("Sémua Ñama") == "semua-nama"
