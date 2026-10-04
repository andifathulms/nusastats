"""The ingest-versioned read-API cache (api.caching)."""

import pytest
from rest_framework.test import APIClient

from api.caching import bump_data_version
from catalog.models import Variable
from stats.aggregates import refresh_variable_stats
from stats.models import DataPoint, LevelStats

from .test_stats_api import dataset  # noqa: F401  (shared fixture)


@pytest.fixture
def api_client():
    return APIClient()


@pytest.mark.django_db
def test_second_request_is_served_from_cache(api_client, dataset):  # noqa: F811
    first = api_client.get("/api/stats/variables/455/ranking/?admin_level=province")
    second = api_client.get("/api/stats/variables/455/ranking/?admin_level=province")
    assert first["X-Cache"] == "miss" and second["X-Cache"] == "hit"
    assert first.data == second.data
    assert "max-age" in second["Cache-Control"]


@pytest.mark.django_db
def test_query_order_shares_one_cache_entry(api_client, dataset):  # noqa: F811
    api_client.get("/api/stats/variables/455/ranking/?admin_level=province&order=asc")
    again = api_client.get("/api/stats/variables/455/ranking/?order=asc&admin_level=province")
    assert again["X-Cache"] == "hit"


@pytest.mark.django_db
def test_ingest_bump_invalidates(api_client, dataset):  # noqa: F811
    before = api_client.get("/api/stats/summary/").data
    DataPoint.objects.filter(admin_level="regency").delete()
    # Without a bump the cached figure is still served...
    assert api_client.get("/api/stats/summary/").data == before
    # ...and the post-ingest refresh bumps the BPS version itself.
    refresh_variable_stats()
    after = api_client.get("/api/stats/summary/")
    assert after["X-Cache"] == "miss"
    assert after.data["total_data_points"] == before["total_data_points"] - 2


@pytest.mark.django_db
def test_bumping_one_source_leaves_others_cached(api_client, dataset):  # noqa: F811
    api_client.get("/api/stats/summary/")
    bump_data_version("djpk")
    assert api_client.get("/api/stats/summary/")["X-Cache"] == "hit"


@pytest.mark.django_db
def test_errors_are_not_cached(api_client, dataset):  # noqa: F811
    api_client.get("/api/stats/variables/455/series/?year_min=abc")
    again = api_client.get("/api/stats/variables/455/series/?year_min=abc")
    assert again.status_code == 400
    assert again.get("X-Cache") != "hit"


@pytest.mark.django_db
def test_summary_reads_denormalized_level_counts(api_client, dataset):  # noqa: F811
    assert dict(LevelStats.objects.values_list("admin_level", "data_points")) == {"province": 2, "regency": 2}
    data = api_client.get("/api/stats/summary/").data
    by_level = {r["admin_level"]: r["data_points"] for r in data["by_admin_level"]}
    assert by_level == {"national": 0, "province": 2, "regency": 2}
    assert data["by_category"] == [{"category": "Sosial", "variables": 1, "with_data": 1}]
    assert Variable.objects.get(variable_id="455").stat_admin_levels == "province,regency"
