"""carousel-data/1 packs (api.carousel): one source, complete or refused,
codes in the source's scheme, map codes through the crosswalks."""

import hashlib
import json

import pytest
from django.core.management import CommandError, call_command
from rest_framework.test import APIClient

from catalog.models import AdminLevel, CoverageCheckLog, Domain, PeriodData, Subject, SubjectCategory, Variable
from djpk.models import ApbdLine, ApbdRegion, ApbdReport, RegionLevel
from dukcapil.models import DukcapilIndicator, DukcapilRegion
from stats.models import DataPoint

from api.carousel import PackError, build_pack, fmt_value, slugify

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
def test_land_area_pack_credits_big_and_drops_the_population_caveat(db):
    DukcapilIndicator.objects.create(field="luas_big", label_id="Luas Wilayah (BIG)", group="Kependudukan", unit="km²")
    for code, name, km2 in (("3101", "Kepulauan Seribu", 10.7713), ("1273", "Sibolga", 11.5234),
                            ("9301", "Merauke", 45204.2)):
        DukcapilRegion.objects.filter(pk=_duk(code, name, "Kota" if code == "1273" else "Kabupaten").pk) \
            .update(luas_big=km2)

    result = build_pack("dukcapil", "luas_big", "kabupaten", top=0, bottom=2)
    pack = result["pack"]

    assert [r["code"] for r in pack["rows"]] == ["1273", "3101"]
    assert "bukan hasil sensus" not in pack["notes"]
    assert "BIG 1:10.000" in pack["notes"]
    assert pack["source"].startswith("BIG 1:10.000")
    assert result["map"]["kicker"] == "DATA • BIG 1:10.000"


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


@pytest.mark.django_db
def test_tie_among_shown_rows_is_noted(bps):
    DataPoint.objects.filter(domain__domain_id="1101").update(value=13.37)
    notes = build_pack("bps", "415", "kabupaten", "2025")["pack"]["notes"]
    assert "nilai kembar (13,37 tahun)" in notes


@pytest.mark.django_db
def test_ties_share_competition_ranks_both_ways(bps):
    DataPoint.objects.filter(domain__domain_id="1101").update(value=13.37)
    vals = {v["code"]: (v["rank"], v["rank_asc"]) for v in build_pack("bps", "415", "kabupaten", "2025")["map"]["values"]}
    assert vals == {"1101": (1, 3), "1171": (1, 3), "1102": (3, 2), "9707": (4, 1)}


@pytest.mark.django_db
def test_dukcapil_polygon_twin_is_counted_once(db):
    """A kecamatan drawn as two polygons arrives as two rows with the same
    numbers (the second under `{code}-{objectid}`): one region, said in the notes."""
    DukcapilIndicator.objects.create(field="jumlah_penduduk", label_id="Jumlah Penduduk", group="Umum", unit="jiwa")
    _duk("7306", "Gowa", "Kabupaten", jumlah_penduduk=780000)
    _duk("730610", "Tombolopao", "", level="district", jumlah_penduduk=31809, objectid=48629)
    _duk("730610-48649", "Tombolopao", "", level="district", jumlah_penduduk=31809, objectid=48649)
    _duk("730611", "Tinggimoncong", "", level="district", jumlah_penduduk=24000, objectid=48630)
    # Same fallback code shape but different numbers: a different row, kept.
    _duk("730612", "Parangloe", "", level="district", jumlah_penduduk=18000, objectid=48631)
    _duk("730612-48700", "Parangloe", "", level="district", jumlah_penduduk=1, objectid=48700)

    result = build_pack("dukcapil", "jumlah_penduduk", "kecamatan", prov="73")
    codes = [r["code"] for r in result["pack"]["rows"]]
    assert codes.count("730610") == 1 and "730610-48649" not in codes
    assert "730612-48700" in codes
    assert result["map"]["expected"] == 4
    assert "1 baris ganda di sumber" in result["pack"]["notes"]
    # The ranking card shows kecamatan and kabupaten on two lines.
    top = next(v for v in result["map"]["values"] if v["code"] == "730610")
    assert (top["label"], top["name"], top["parent"]) == ("Tombolopao, Kab. Gowa", "Tombolopao", "Kab. Gowa")


def test_fractional_values_keep_two_decimals():
    """A ranking's values are all the same length and line up on the comma; counts stay whole."""
    assert [fmt_value(v, "%") for v in (14.6, 18.7, 12.15, 3)] == ["14,60%", "18,70%", "12,15%", "3,00%"]
    assert [fmt_value(v, "jiwa/km²") for v in (4540.6, 4134.28, 2447.1)] == ["4.540,60 jiwa/km²", "4.134,28 jiwa/km²", "2.447,10 jiwa/km²"]
    assert fmt_value(37.5, "tahun") == "37,50 tahun"
    assert fmt_value(72.5, "") == "72,50"
    assert fmt_value(582327, "jiwa") == "582.327 jiwa"
    # A whole value inside a fractional ranking gets ",00" too (4.008,00 next to 4.134,28).
    assert fmt_value(4008, "jiwa/km²", fixed=True) == "4.008,00 jiwa/km²"
    assert fmt_value(52, "indeks") == "52"


@pytest.mark.django_db
def test_partial_refusal_names_the_missing_regions(db):
    DukcapilIndicator.objects.create(field="jumlah_penduduk", label_id="Jumlah Penduduk", group="Umum", unit="jiwa")
    _duk("7306", "Gowa", "Kabupaten", jumlah_penduduk=780000)
    _duk("730610", "Tombolopao", "", level="district", jumlah_penduduk=31809)
    _duk("730611", "Tinggimoncong", "", level="district")
    with pytest.raises(PackError, match="Tanpa nilai: Tinggimoncong, Kab. Gowa") as exc:
        build_pack("dukcapil", "jumlah_penduduk", "kecamatan", prov="73")
    assert exc.value.details["partial"] == {"n": 1, "total": 2, "missing": ["Tinggimoncong, Kab. Gowa"], "more": 0}
    bad = APIClient().get("/api/carousel/pack/?source=dukcapil&metric=jumlah_penduduk&level=kecamatan&prov=73")
    assert bad.status_code == 422 and bad.data["partial"]["missing"] == ["Tinggimoncong, Kab. Gowa"]


@pytest.mark.django_db
def test_kecamatan_ranking_over_several_provinces(db):
    DukcapilIndicator.objects.create(field="jumlah_penduduk", label_id="Jumlah Penduduk", group="Umum", unit="jiwa")
    for code, name in (("71", "Sulawesi Utara"), ("72", "Sulawesi Tengah"), ("73", "Sulawesi Selatan"),
                       ("74", "Sulawesi Tenggara"), ("75", "Gorontalo"), ("76", "Sulawesi Barat"), ("35", "Jawa Timur")):
        _duk(code, name, "", level="province")
    _duk("7306", "Gowa", "Kabupaten")
    _duk("7601", "Pasangkayu", "Kabupaten")
    _duk("3501", "Pacitan", "Kabupaten")
    _duk("730610", "Tombolopao", "", level="district", jumlah_penduduk=31809)
    _duk("760101", "Pasangkayu", "", level="district", jumlah_penduduk=40000)
    _duk("350101", "Donorojo", "", level="district", jumlah_penduduk=50000)

    two = build_pack("dukcapil", "jumlah_penduduk", "kecamatan", prov="76,73")
    assert [r["code"] for r in two["pack"]["rows"]] == ["760101", "730610"]  # no Jawa Timur
    assert two["map"]["prov"] == "73-76"
    assert two["map"]["prov_name"] == "Sulawesi Selatan dan Sulawesi Barat"
    assert "kecamatan di Sulawesi Selatan dan Sulawesi Barat" in two["pack"]["notes"]

    island = build_pack("dukcapil", "jumlah_penduduk", "kecamatan", prov="71-72-73-74-75-76")
    assert island["map"]["prov_name"] == "Sulawesi"
    assert island["pack"]["id"].endswith("-71-72-73-74-75-76")

    with pytest.raises(PackError, match="prov"):
        build_pack("dukcapil", "jumlah_penduduk", "kecamatan", prov="7,73")


def _peta(code, name, level, lc_tree, year=2021):
    from peta.models import PetaIndicator, PetaRegion, PetaSourceFile, PetaValue

    ind, _ = PetaIndicator.objects.get_or_create(
        key="lc_tree", defaults={"label_id": "Tutupan pohon", "group": "tutupan", "unit": "%",
                                 "dataset": "ESA WorldCover 2021 v200", "method": "WorldCover class 10."})
    tile, _ = PetaSourceFile.objects.get_or_create(
        dataset="esa_worldcover_2021_v200", key="N00E114",
        defaults={"url": "https://example.test/N00E114.tif", "sha256": "a" * 64, "bytes": 1, "downloaded_at": "2026-10-01"})
    r = PetaRegion.objects.create(code=code, level=level, name=name, prov_code=code[:2], parent_code=code[:-2],
                                  landcover_year=year, landcover_provenance={"tiles": ["N00E114"]})
    r.source_files.add(tile)
    if lc_tree is not None:
        PetaValue.objects.create(region=r, indicator=ind, value=lc_tree)
    return r


@pytest.mark.django_db
def test_peta_land_cover_pack_labels_notes_and_provenance(db):
    _duk("6471", "Balikpapan", "Kota")
    _duk("6502", "Malinau", "Kabupaten")
    _peta("6471", "BALIKPAPAN", "regency", 41.5)
    _peta("6502", "MALINAU", "regency", 99.53)

    result = build_pack("peta", "lc_tree", "kabupaten")
    pack = result["pack"]

    assert pack["id"] == "peta-lc-tree-kab-2021"
    assert pack["rows"][0] == {"label": "Kab. Malinau", "code": "6502", "value": 99.53}
    assert pack["period"] == "2021"
    assert "bukan luas hutan" in pack["notes"]  # tree cover includes plantations
    assert "ESA WorldCover" in pack["source"]
    row = next(r for r in result["provenance"]["rows"] if r["code"] == "6502")
    assert row["tiles"][0]["sha256"] == "a" * 64


@pytest.mark.django_db
def test_peta_missing_region_is_reported_and_provinsi_refused(db):
    _duk("6471", "Balikpapan", "Kota")
    _duk("6502", "Malinau", "Kabupaten")
    _peta("6502", "MALINAU", "regency", 99.53)  # Balikpapan not computed: absent, not zero

    with pytest.raises(PackError, match="n = 1 dari 2"):
        build_pack("peta", "lc_tree", "kabupaten")
    # Kalimantan Timur is missing Balikpapan: no province value rather than a partial sum;
    # Kalimantan Utara (Malinau, all its kabupaten here) has one.
    from peta.models import PetaRegion

    PetaRegion.objects.filter(code="6502").update(area_km2=6000.0)
    _duk("64", "Kalimantan Timur", "Provinsi", level="province")
    _duk("65", "Kalimantan Utara", "Provinsi", level="province")
    with pytest.raises(PackError, match="n = 1 dari 2.*Kalimantan Timur"):
        build_pack("peta", "lc_tree", "provinsi")


@pytest.mark.django_db
def test_peta_province_is_area_weighted_from_its_kabupaten(db):
    from peta.models import PetaRegion

    _duk("64", "Kalimantan Timur", "Provinsi", level="province")
    _duk("6471", "Balikpapan", "Kota")
    _duk("6472", "Samarinda", "Kota")
    _peta("6471", "BALIKPAPAN", "regency", 40.0)
    _peta("6472", "SAMARINDA", "regency", 10.0)
    PetaRegion.objects.filter(code="6471").update(area_km2=100.0)
    PetaRegion.objects.filter(code="6472").update(area_km2=300.0)

    result = build_pack("peta", "lc_tree", "provinsi")

    # (40 x 100 + 10 x 300) / 400 = 17,5, not the plain mean 25.
    assert result["pack"]["rows"] == [{"label": "Kalimantan Timur", "code": "64", "value": 17.5}]
    assert "digabung NusaStats" in result["pack"]["notes"]
    assert [i["code"] for i in result["provenance"]["rows"][0]["inputs"]] == ["6471", "6472"]


@pytest.mark.django_db
def test_peta_terrain_province_rules(db):
    from peta.models import PetaIndicator, PetaRegion, PetaValue

    _duk("64", "Kalimantan Timur", "Provinsi", level="province")
    _duk("6471", "Balikpapan", "Kota")
    _duk("6472", "Samarinda", "Kota")
    for code, area, mean, top in (("6471", 100.0, 40.0, 120.0), ("6472", 300.0, 10.0, 300.0)):
        PetaRegion.objects.create(code=code, level="regency", name=code, prov_code="64", parent_code="64", area_km2=area)
    for key, label, unit in (("elevation_mean", "Rata-rata elevasi", "m"), ("elevation_max", "Titik tertinggi", "m"),
                             ("elevation_median", "Median elevasi", "m")):
        ind = PetaIndicator.objects.create(key=key, label_id=label, group="medan", unit=unit,
                                           dataset="Copernicus DEM GLO-30", method="-")
        for code, v in (("6471", {"elevation_mean": 40.0, "elevation_max": 120.0}.get(key, 5.0)),
                        ("6472", {"elevation_mean": 10.0, "elevation_max": 300.0}.get(key, 5.0))):
            PetaValue.objects.create(region=PetaRegion.objects.get(code=code), indicator=ind, value=v)

    mean = build_pack("peta", "elevation_mean", "provinsi")
    assert mean["pack"]["rows"][0]["value"] == 17.5  # area-weighted, not the plain mean 25
    assert mean["map"]["kicker"] == "DATA • COPERNICUS DEM"
    assert mean["map"]["values"][0]["display"] == "18 m"  # whole metres
    assert build_pack("peta", "elevation_max", "provinsi")["pack"]["rows"][0]["value"] == 300.0  # the highest
    with pytest.raises(PackError, match="tidak bisa digabung"):
        build_pack("peta", "elevation_median", "provinsi")


@pytest.mark.django_db
def test_peta_local_relief_ranks_area_weighted_with_its_caveat(db):
    from peta.models import PetaIndicator, PetaRegion, PetaValue

    _duk("64", "Kalimantan Timur", "Provinsi", level="province")
    _duk("6471", "Balikpapan", "Kota")
    _duk("6472", "Samarinda", "Kota")
    ind = PetaIndicator.objects.create(key="local_relief_mean", label_id="Relief lokal rata-rata (1 km)", group="medan",
                                       unit="m", dataset="Copernicus DEM GLO-30", method="-")
    for code, area, v in (("6471", 100.0, 40.0), ("6472", 300.0, 10.0)):
        r = PetaRegion.objects.create(code=code, level="regency", name=code, prov_code="64", parent_code="64", area_km2=area)
        PetaValue.objects.create(region=r, indicator=ind, value=v)

    kab = build_pack("peta", "local_relief_mean", "kabupaten")
    assert kab["pack"]["rows"][0]["code"] == "6471"
    assert "jendela 1×1 km" in kab["pack"]["notes"]  # what "relief lokal" means, on the slide
    # A mean over equal-area pixels combines area-weighted: (40 x 100 + 10 x 300) / 400.
    assert build_pack("peta", "local_relief_mean", "provinsi")["pack"]["rows"][0]["value"] == 17.5


@pytest.fixture
def big_map(tmp_path, monkeypatch):
    """A BIG desa map: Balikpapan 2 kecamatan / 3 desa, Samarinda 1 / 1, a desa under a
    kecamatan Dukcapil doesn't list (647203), and Papua Barat Daya's old 92xx duplicate."""
    import json

    import api.carousel as carousel

    path = tmp_path / "big_area.json"
    path.write_text(json.dumps({"6471010001": 1.0, "6471010002": 1.0, "6471020001": 1.0,
                                "6472010001": 1.0, "6472030001": 1.0, "9201010001": 1.0}))
    monkeypatch.setattr(carousel, "BIG_AREA", str(path))
    return path


@pytest.mark.django_db
def test_kecamatan_and_desa_counts_come_from_the_big_codes(db, big_map):
    _duk("64", "Kalimantan Timur", "Provinsi", level="province")
    _duk("6471", "Balikpapan", "Kota")
    _duk("6472", "Samarinda", "Kota")
    for code, name in (("647101", "Balikpapan Selatan"), ("647102", "Balikpapan Kota"), ("647201", "Palaran")):
        DukcapilRegion.objects.create(code=code, name=name, status="", level="district", period=PERIOD, prov_code="64",
                                      kab_code=code[:4], attributes={}, fetched_at="2026-10-01T00:00:00Z")

    kec = build_pack("dukcapil", "jumlah_kecamatan", "kabupaten")
    # Samarinda: its BIG desa sit under 2 kecamatan codes (one not in Dukcapil's list yet).
    assert kec["pack"]["rows"] == [{"label": "Kota Balikpapan", "code": "6471", "value": 2},
                                   {"label": "Kota Samarinda", "code": "6472", "value": 2}]
    assert kec["map"]["kicker"] == "DATA • BIG 1:10.000"
    assert "92xx" not in kec["pack"]["notes"] and "9201" in kec["pack"]["notes"]  # the old code, reported
    assert kec["provenance"]["sha256"] == hashlib.sha256(big_map.read_bytes()).hexdigest()

    desa = build_pack("dukcapil", "jumlah_desa", "kecamatan")
    assert [(r["code"], r["value"]) for r in desa["pack"]["rows"]] == [("647101", 2), ("647102", 1), ("647201", 1)]
    assert desa["map"]["values"][0]["display"] == "2 desa"
    assert "1 kecamatan di peta BIG belum ada di daftar Dukcapil" in desa["pack"]["notes"]
    # 3 + 2 desa; the old 92xx duplicate never counts.
    assert build_pack("dukcapil", "jumlah_desa", "provinsi")["pack"]["rows"][0]["value"] == 5
    with pytest.raises(PackError, match="hanya per provinsi / kabupaten"):
        build_pack("dukcapil", "jumlah_kecamatan", "kecamatan")
