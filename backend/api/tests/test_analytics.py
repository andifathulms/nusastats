import pytest
from rest_framework.test import APIClient

from api.analytics import distribution, growth_rows, pearson, rank_rows
from catalog.models import AdminLevel, Domain, PeriodData, Subject, SubjectCategory, Variable
from stats.aggregates import refresh_variable_stats
from stats.models import DataPoint


# --- pure helpers ---


def test_distribution_basic():
    d = distribution([1, 2, 3, 4])
    assert d == {"count": 4, "min": 1, "max": 4, "mean": 2.5, "median": 2.5}


def test_distribution_empty():
    assert distribution([])["count"] == 0


def test_rank_rows_desc_and_asc():
    rows = [{"domain_id": "a", "domain_name": "A", "value": 5}, {"domain_id": "b", "domain_name": "B", "value": 9}]
    desc = rank_rows([dict(r) for r in rows], "desc")
    assert [r["domain_id"] for r in desc] == ["b", "a"]
    assert desc[0]["rank"] == 1
    asc = rank_rows([dict(r) for r in rows], "asc")
    assert [r["domain_id"] for r in asc] == ["a", "b"]


def test_pearson_perfect_and_none():
    assert pearson([1, 2, 3], [2, 4, 6]) == 1.0
    assert pearson([1, 2, 3], [6, 4, 2]) == -1.0
    assert pearson([1], [1]) is None  # too few
    assert pearson([1, 1, 1], [1, 2, 3]) is None  # zero variance


def test_growth_rows_computes_change_and_pct():
    frm = {"a": ("A", 100.0), "b": ("B", 50.0)}
    to = {"a": ("A", 150.0), "b": ("B", 40.0)}
    out = growth_rows(frm, to, "desc")
    by = {r["domain_id"]: r for r in out}
    assert by["a"]["change"] == 50.0 and by["a"]["change_pct"] == 50.0
    assert by["b"]["change"] == -10.0 and by["b"]["change_pct"] == -20.0
    # sorted desc by pct -> A (+50%) first
    assert out[0]["domain_id"] == "a"


# --- endpoints ---


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def dataset(db):
    national = Domain.objects.create(domain_id="0000", domain_name="Indonesia", admin_level=AdminLevel.NATIONAL)
    aceh = Domain.objects.create(domain_id="1100", domain_name="Aceh", admin_level=AdminLevel.PROVINCE)
    sumut = Domain.objects.create(domain_id="1200", domain_name="Sumut", admin_level=AdminLevel.PROVINCE)
    category = SubjectCategory.objects.create(subject_category_id="1", domain=national, name="Sosial")
    subject = Subject.objects.create(subject_id="10", subject_category=category, domain=national, name="Gender")
    var = Variable.objects.create(variable_id="455", subject=subject, domain=national, name="AHH", unit="Tahun")
    p2020 = PeriodData.objects.create(period_id="120", variable=var, label="2020", year=2020)
    p2024 = PeriodData.objects.create(period_id="124", variable=var, label="2024", year=2024)

    common = dict(variable=var, source_check_log=None, fetched_at="2026-01-01T00:00:00Z", turvar_id="0", turvar_label="")
    # Aceh: 68->70 (+2), Sumut: 72->73 (+1). Sumut higher in 2024.
    vals = {(aceh, p2020): 68.0, (aceh, p2024): 70.0, (sumut, p2020): 72.0, (sumut, p2024): 73.0}
    for (domain, period), value in vals.items():
        DataPoint.objects.create(
            domain=domain, period=period, admin_level=domain.admin_level, year=period.year,
            vervar_id=domain.domain_id, vervar_label=domain.domain_name, value=value, **common,
        )
    refresh_variable_stats()
    return var


@pytest.mark.django_db
def test_ranking_defaults_to_latest_year_desc(api_client, dataset):
    resp = api_client.get("/api/stats/variables/455/ranking/")

    assert resp.status_code == 200
    assert resp.data["year"] == 2024
    assert resp.data["admin_level"] == "province"
    results = resp.data["results"]
    assert [r["domain_name"] for r in results] == ["Sumut", "Aceh"]  # 73 > 70
    assert results[0]["rank"] == 1
    assert resp.data["stats"]["max"] == 73.0
    assert resp.data["stats"]["min"] == 70.0


@pytest.mark.django_db
def test_ranking_specific_year_and_asc(api_client, dataset):
    resp = api_client.get("/api/stats/variables/455/ranking/", {"year": "2020", "order": "asc"})

    assert resp.data["year"] == 2020
    assert [r["domain_name"] for r in resp.data["results"]] == ["Aceh", "Sumut"]  # 68 < 72


@pytest.mark.django_db
def test_growth_ranks_fastest_riser_first(api_client, dataset):
    resp = api_client.get("/api/stats/variables/455/growth/")

    assert resp.status_code == 200
    assert resp.data["year_from"] == 2020 and resp.data["year_to"] == 2024
    results = resp.data["results"]
    # Aceh +2.94%, Sumut +1.39% -> Aceh first
    assert results[0]["domain_name"] == "Aceh"
    assert results[0]["value_from"] == 68.0 and results[0]["value_to"] == 70.0


@pytest.mark.django_db
def test_correlate_two_indicators_across_provinces(api_client, dataset):
    # Add a second variable perfectly correlated with the first in 2024:
    # Aceh y=140 (2*70), Sumut y=146 (2*73).
    national = Domain.objects.get(domain_id="0000")
    aceh = Domain.objects.get(domain_id="1100")
    sumut = Domain.objects.get(domain_id="1200")
    subject = dataset.subject
    yvar = Variable.objects.create(variable_id="900", subject=subject, domain=national, name="Other", unit="idx")
    p2024 = PeriodData.objects.create(period_id="124b", variable=yvar, label="2024", year=2024)
    common = dict(variable=yvar, source_check_log=None, fetched_at="2026-01-01T00:00:00Z", turvar_id="0", turvar_label="")
    for domain, value in [(aceh, 140.0), (sumut, 146.0)]:
        DataPoint.objects.create(
            domain=domain, period=p2024, admin_level="province", year=2024,
            vervar_id=domain.domain_id, vervar_label=domain.domain_name, value=value, **common,
        )
    refresh_variable_stats()

    resp = api_client.get("/api/stats/correlate/", {"x": "455", "y": "900", "year": "2024"})

    assert resp.status_code == 200
    assert resp.data["year"] == 2024
    assert resp.data["n"] == 2
    assert resp.data["r"] == 1.0  # perfectly correlated
    pts = {p["domain_name"]: (p["x"], p["y"]) for p in resp.data["results"]}
    assert pts["Aceh"] == (70.0, 140.0)


@pytest.mark.django_db
def test_correlate_requires_both_params(api_client, dataset):
    resp = api_client.get("/api/stats/correlate/", {"x": "455"})
    assert resp.status_code == 400


@pytest.mark.django_db
def test_trend_returns_provincial_band_and_change(api_client, dataset):
    # dataset: Aceh 68->70, Sumut 72->73 across 2020->2024, province level.
    resp = api_client.get("/api/stats/variables/455/trend/")

    assert resp.status_code == 200
    assert resp.data["has_national"] is False
    rows = {r["year"]: r for r in resp.data["results"]}
    assert rows[2020]["prov_min"] == 68.0 and rows[2020]["prov_max"] == 72.0
    assert rows[2020]["prov_mean"] == 70.0  # (68+72)/2
    assert rows[2024]["prov_mean"] == 71.5  # (70+73)/2
    # change on prov_mean line: 70 -> 71.5 = +2.14%
    assert resp.data["change_pct"] == 2.14
