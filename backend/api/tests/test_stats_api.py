import pytest
from rest_framework.test import APIClient

from catalog.models import (
    AdminLevel,
    CoverageRecord,
    CoverageStatus,
    Domain,
    PeriodData,
    Subject,
    SubjectCategory,
    Variable,
)
from stats.models import DataPoint


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def dataset(db):
    national = Domain.objects.create(domain_id="0000", domain_name="Indonesia", admin_level=AdminLevel.NATIONAL)
    aceh = Domain.objects.create(domain_id="1100", domain_name="Aceh", admin_level=AdminLevel.PROVINCE)
    simeulue = Domain.objects.create(
        domain_id="1101", domain_name="Simeulue", admin_level=AdminLevel.REGENCY, parent_province=aceh
    )
    category = SubjectCategory.objects.create(subject_category_id="1", domain=national, name="Sosial")
    subject = Subject.objects.create(subject_id="10", subject_category=category, domain=national, name="Gender")
    var = Variable.objects.create(variable_id="455", subject=subject, domain=national, name="AHH", unit="Tahun")
    p2022 = PeriodData.objects.create(period_id="122", variable=var, label="2022", year=2022)
    p2023 = PeriodData.objects.create(period_id="123", variable=var, label="2023", year=2023)
    CoverageRecord.objects.create(
        variable=var, domain=aceh, model_type=var.data_model, admin_level=AdminLevel.PROVINCE,
        status=CoverageStatus.CONFIRMED,
    )

    common = dict(variable=var, source_check_log=None, fetched_at="2026-01-01T00:00:00Z")
    for domain in (aceh, simeulue):
        for period in (p2022, p2023):
            DataPoint.objects.create(
                domain=domain, period=period, admin_level=domain.admin_level, year=period.year,
                vervar_id=domain.domain_id, vervar_label=domain.domain_name,
                turvar_id="211", turvar_label="Laki-laki", value=70.0 + period.year, **common,
            )
    return var


@pytest.mark.django_db
def test_summary_reports_real_totals(api_client, dataset):
    resp = api_client.get("/api/stats/summary/")

    assert resp.status_code == 200
    assert resp.data["total_data_points"] == 4
    assert resp.data["variables_with_data"] == 1
    assert resp.data["year_min"] == 2022
    assert resp.data["year_max"] == 2023
    levels = {row["admin_level"]: row for row in resp.data["by_admin_level"]}
    assert levels["province"]["data_points"] == 2
    assert levels["regency"]["data_points"] == 2


@pytest.mark.django_db
def test_variables_list_only_includes_those_with_data(api_client, dataset):
    # A second variable with no data must not appear.
    empty = Variable.objects.create(
        variable_id="999", subject=dataset.subject, domain=dataset.domain, name="Empty"
    )
    resp = api_client.get("/api/stats/variables/")

    assert resp.status_code == 200
    ids = [v["variable_id"] for v in resp.data["results"]]
    assert "455" in ids
    assert "999" not in ids
    row = next(v for v in resp.data["results"] if v["variable_id"] == "455")
    assert row["data_point_count"] == 4
    assert row["year_min"] == 2022
    assert row["year_max"] == 2023


@pytest.mark.django_db
def test_variable_dimensions_lists_axes(api_client, dataset):
    resp = api_client.get("/api/stats/variables/455/dimensions/")

    assert resp.status_code == 200
    assert resp.data["years"] == [2022, 2023]
    assert set(resp.data["admin_levels"]) == {"province", "regency"}
    assert resp.data["turvars"][0]["turvar_label"] == "Laki-laki"


@pytest.mark.django_db
def test_series_returns_time_ordered_values_filtered_by_domain(api_client, dataset):
    resp = api_client.get("/api/stats/variables/455/series/", {"domain_id": "1100"})

    assert resp.status_code == 200
    assert resp.data["count"] == 2
    rows = resp.data["results"]
    assert [r["year"] for r in rows] == [2022, 2023]
    assert all(r["domain_id"] == "1100" for r in rows)


@pytest.mark.django_db
def test_series_filter_by_admin_level(api_client, dataset):
    resp = api_client.get("/api/stats/variables/455/series/", {"admin_level": "regency"})

    assert resp.status_code == 200
    assert resp.data["count"] == 2
    assert all(r["admin_level"] == "regency" for r in resp.data["results"])


@pytest.mark.django_db
def test_regions_list_filterable_by_admin_level(api_client, dataset):
    resp = api_client.get("/api/stats/regions/", {"admin_level": "province"})

    assert resp.status_code == 200
    codes = [r["domain_id"] for r in resp.data]
    assert codes == ["1100"]
