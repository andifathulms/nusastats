"""Input validation, bounded responses, and the DJPK peer-rank dedupe."""

import pytest
from rest_framework.test import APIClient

from djpk.models import ApbdLine, ApbdRegion, ApbdReport, RegionLevel

from .test_stats_api import dataset  # noqa: F401  (shared fixture)


@pytest.fixture
def api_client():
    return APIClient()


@pytest.mark.django_db
@pytest.mark.parametrize(
    "url",
    [
        "/api/stats/variables/455/series/?year_min=abc",
        "/api/stats/variables/455/ranking/?admin_level=province&year=x",
        "/api/stats/variables/455/ranking/?admin_level=province&limit=abc",
        "/api/stats/regions/1100/profile/?limit=x",
        "/api/dukcapil/regions/?limit=all",
        "/api/djpk/rank/?limit=10x",
        "/api/djpk/regions/?limit=all",
    ],
)
def test_malformed_int_params_are_400_not_500(api_client, dataset, url):  # noqa: F811
    resp = api_client.get(url)
    assert resp.status_code == 400


@pytest.mark.django_db
def test_series_reports_truncation(api_client, dataset, monkeypatch):  # noqa: F811
    from api import stats_views

    full = api_client.get("/api/stats/variables/455/series/").data
    assert full["truncated"] is False and full["total"] == full["count"] == 4
    assert {"domain_id", "domain_name", "year", "value"} <= set(full["results"][0])

    monkeypatch.setattr(stats_views, "SERIES_CAP", 3)
    cut = api_client.get("/api/stats/variables/455/series/").data
    assert cut["truncated"] is True
    assert cut["count"] == 3
    assert cut["total"] == 4


@pytest.mark.django_db
def test_ranking_reports_page_envelope(api_client, dataset):  # noqa: F811
    resp = api_client.get("/api/stats/variables/455/ranking/?admin_level=regency&limit=1").data
    assert resp["total"] == 1 and resp["offset"] == 0 and len(resp["results"]) == 1


def _region(code, name):
    return ApbdRegion.objects.create(
        djpk_prov=code[:2], djpk_pemda=code[2:], djpk_code=code, level=RegionLevel.PROVINCE, name=name
    )


@pytest.mark.django_db
def test_djpk_peer_rank_counts_duplicate_lines_once(api_client):
    a, b = _region("0100", "Prov A"), _region("0200", "Prov B")
    for region, values in ((a, [100.0, 100.0]), (b, [50.0])):
        report = ApbdReport.objects.create(
            region=region, tahun=2024, report_type="realisasi", periode=12, fetched_at="2026-01-01T00:00:00Z"
        )
        # Prov A carries the same account twice (a duplicate-label row).
        for i, v in enumerate(values):
            ApbdLine.objects.create(report=report, line_index=i, akun="PAD", akun_key="pad", realisasi=v)

    resp = api_client.get("/api/djpk/regions/0200/?tahun=2024&type=realisasi&periode=12")
    assert resp.status_code == 200
    pad = next(line for g in resp.data["groups"] for line in g["lines"] if line["akun_key"] == "pad")
    assert pad["of"] == 2  # two regions, not three lines
    assert pad["rank"] == 2
