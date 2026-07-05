from unittest.mock import patch

import pytest
from django.core.management import call_command

from bps_client.client import BpsResponse
from catalog.models import AdminLevel, Domain, PeriodData, Subject, SubjectCategory, Variable, VerticalVariable


def ok(data):
    return BpsResponse(url="fake", http_status=200, body={"status": "OK", "data": data}, response_hash="x")


def fake_get(model, **params):
    if model == "subjectcategory":
        return ok([{"subcat_id": "1", "subcat": "Ekonomi"}])
    if model == "subject":
        return ok([{"subj_id": "10", "subj": "Inflasi"}])
    if model == "var":
        return ok([{"var_id": "100", "title": "Inflasi Bulanan", "unit": "Persen", "def": ""}])
    if model == "vervar":
        return ok([{"val": "1000", "label": "Indonesia"}])
    if model == "th":
        return ok([{"val": "1", "th": "2023"}])
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
