from unittest.mock import patch

import pytest
from django.core.management import call_command

from bps_client.client import BpsResponse
from catalog.models import AdminLevel, Domain, PeriodData, Subject, SubjectCategory, Variable, VerticalVariable


def ok(data):
    return BpsResponse(url="fake", http_status=200, body={"status": "OK", "data": data}, response_hash="x")


def fake_get(model, **params):
    # Field/model names below match what was confirmed against the live
    # BPS WebAPI (subcat/sub_id/th_id, not the originally-guessed
    # subjectcategory/subj_id/val).
    if model == "subcat":
        return ok([{"subcat_id": "1", "title": "Ekonomi"}])
    if model == "subject":
        return ok([{"sub_id": "10", "title": "Inflasi"}])
    if model == "var":
        return ok([{"var_id": "100", "title": "Inflasi Bulanan", "unit": "Persen", "def": ""}])
    if model == "vervar":
        return ok([{"kode_ver_id": "1000", "vervar": "Indonesia"}])
    if model == "th":
        return ok([{"th_id": "1", "th": "2023"}])
    raise AssertionError(f"unexpected call: {model} {params}")


@pytest.fixture
def national_domain(db):
    return Domain.objects.create(domain_id="0000", domain_name="Indonesia", admin_level=AdminLevel.NATIONAL)


@pytest.mark.django_db
def test_crawl_metadata_populates_full_chain(national_domain):
    with patch(
        "bps_client.client.BpsClient.get",
        autospec=True,
        side_effect=lambda self, model, **p: fake_get(model, **p),
    ):
        call_command("crawl_metadata")

    category = SubjectCategory.objects.get(subject_category_id="1")
    subject = Subject.objects.get(subject_id="10", subject_category=category)
    variable = Variable.objects.get(variable_id="100", subject=subject)
    assert VerticalVariable.objects.filter(variable=variable, vervar_id="1000").exists()
    assert PeriodData.objects.filter(variable=variable, year=2023).exists()


@pytest.mark.django_db
def test_crawl_metadata_is_idempotent(national_domain):
    with patch(
        "bps_client.client.BpsClient.get",
        autospec=True,
        side_effect=lambda self, model, **p: fake_get(model, **p),
    ):
        call_command("crawl_metadata")
        call_command("crawl_metadata")

    assert Variable.objects.filter(variable_id="100").count() == 1


@pytest.mark.django_db
def test_crawl_metadata_follows_pagination_for_th(national_domain):
    """Confirmed live: BPS defaults to per_page=10 and only returns page 1
    unless the caller loops `page` — this reproduces a real bug where a
    variable's period list was silently truncated (missing its oldest
    years) before pagination was added."""

    def paginated_th(model, **params):
        if model == "th":
            page = int(params.get("page", 1))
            if page == 1:
                return BpsResponse(
                    url="fake",
                    http_status=200,
                    body={
                        "status": "OK",
                        "data": [{"page": 1, "pages": 2, "per_page": 1, "total": 2}, [{"th_id": "2", "th": "2024"}]],
                    },
                    response_hash="x",
                )
            return BpsResponse(
                url="fake",
                http_status=200,
                body={
                    "status": "OK",
                    "data": [{"page": 2, "pages": 2, "per_page": 1, "total": 2}, [{"th_id": "1", "th": "2023"}]],
                },
                response_hash="x",
            )
        return fake_get(model, **params)

    with patch(
        "bps_client.client.BpsClient.get",
        autospec=True,
        side_effect=lambda self, model, **p: paginated_th(model, **p),
    ):
        call_command("crawl_metadata")

    variable = Variable.objects.get(variable_id="100")
    assert set(variable.periods.values_list("year", flat=True)) == {2023, 2024}
