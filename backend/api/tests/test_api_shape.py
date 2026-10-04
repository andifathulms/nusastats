"""Server-side scoping and the composite lookups that replace client-side
fetch-then-filter and request waterfalls."""

import pytest
from rest_framework.test import APIClient

from catalog.models import AdminLevel, Domain
from djpk.models import ApbdLine, ApbdRegion, ApbdReport, RegionLevel
from dukcapil.models import DukcapilIndicator, DukcapilRegion

from .test_stats_api import dataset  # noqa: F401  (shared fixture)


@pytest.fixture
def api_client():
    return APIClient()


@pytest.mark.django_db
def test_ranking_and_growth_scope_to_one_province(api_client, dataset):  # noqa: F811
    bali = Domain.objects.create(domain_id="5100", domain_name="Bali", admin_level=AdminLevel.PROVINCE)
    Domain.objects.create(domain_id="5101", domain_name="Jembrana", admin_level=AdminLevel.REGENCY, parent_province=bali)

    ranked = api_client.get("/api/stats/variables/455/ranking/?admin_level=regency&prov=11").data
    assert [r["domain_id"] for r in ranked["results"]] == ["1101"]
    assert api_client.get("/api/stats/variables/455/ranking/?admin_level=regency&prov=51").data["results"] == []

    grown = api_client.get("/api/stats/variables/455/growth/?admin_level=regency&prov=11").data
    assert [r["domain_id"] for r in grown["results"]] == ["1101"] and grown["total"] == 1

    assert api_client.get("/api/stats/variables/455/ranking/?admin_level=regency&prov=x").status_code == 400


@pytest.mark.django_db
def test_series_accepts_several_vervars(api_client, dataset):  # noqa: F811
    both = api_client.get("/api/stats/variables/455/series/?vervar_id=1100&vervar_id=1101").data
    assert {r["vervar_id"] for r in both["results"]} == {"1100", "1101"}
    one = api_client.get("/api/stats/variables/455/series/?vervar_id=1101").data
    assert {r["vervar_id"] for r in one["results"]} == {"1101"}


@pytest.mark.django_db
def test_dukcapil_detail_by_bps_regency(api_client):
    Domain.objects.create(domain_id="7309", domain_name="Pangkajene Dan Kepulauan", admin_level=AdminLevel.REGENCY)
    DukcapilIndicator.objects.create(field="jumlah_penduduk", label_id="Penduduk", group="Umum", unit="jiwa")
    common = dict(level="regency", period="2026-10", fetched_at="2026-10-01T00:00:00Z", prov_code="73")
    # BPS 7309 collides with a *different* Kemendagri region by code; the
    # hand-verified crosswalk sends it to 7310.
    DukcapilRegion.objects.create(code="7309", name="Maros", status="Kabupaten",
                                  attributes={"jumlah_penduduk": 1}, **common)
    DukcapilRegion.objects.create(code="7310", name="Pangkajene Kepulauan", status="Kabupaten",
                                  attributes={"jumlah_penduduk": 2}, **common)

    resp = api_client.get("/api/dukcapil/regions/bps/7309/")
    assert resp.status_code == 200
    assert resp.data["bps_domain_id"] == "7309"
    assert resp.data["region"]["code"] == "7310"
    assert api_client.get("/api/dukcapil/regions/7310/").data["groups"] == resp.data["groups"]
    assert api_client.get("/api/dukcapil/regions/bps/9999/").status_code == 404


@pytest.mark.django_db
def test_djpk_rank_resolves_kemendagri_province(api_client):
    prov = ApbdRegion.objects.create(djpk_prov="10", djpk_pemda="00", djpk_code="1000",
                                     level=RegionLevel.PROVINCE, name="Prov Jawa Barat", kemendagri_code="32")
    kab = ApbdRegion.objects.create(djpk_prov="10", djpk_pemda="01", djpk_code="1001",
                                    level=RegionLevel.REGENCY, name="Kab. Bogor", kemendagri_code="3201")
    for region in (prov, kab):
        report = ApbdReport.objects.create(region=region, tahun=2024, report_type="realisasi", periode=12,
                                           fetched_at="2026-01-01T00:00:00Z")
        ApbdLine.objects.create(report=report, line_index=0, akun="PAD", akun_key="pad", realisasi=5.0)

    resp = api_client.get("/api/djpk/rank/?akun=pad&level=regency&kemendagri_prov=32").data
    assert resp["prov"] == "10"
    assert [r["domain_id"] for r in resp["results"]] == ["1001"]

    unknown = api_client.get("/api/djpk/rank/?akun=pad&level=regency&kemendagri_prov=99").data
    assert unknown["prov"] is None and unknown["results"] == []
