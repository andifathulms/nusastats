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
def test_crawl_metadata_skips_vervar_by_default(national_domain):
    """Vervar is deferred by default — confirmed live to cost ~45s/variable
    while not being needed for coverage confirmation or ingestion."""
    with patch(
        "bps_client.client.BpsClient.get",
        autospec=True,
        side_effect=lambda self, model, **p: fake_get(model, **p),
    ):
        call_command("crawl_metadata")

    variable = Variable.objects.get(variable_id="100")
    assert not VerticalVariable.objects.filter(variable=variable).exists()
    assert PeriodData.objects.filter(variable=variable, year=2023).exists()


@pytest.mark.django_db
def test_crawl_metadata_with_vervar_flag_populates_it(national_domain):
    with patch(
        "bps_client.client.BpsClient.get",
        autospec=True,
        side_effect=lambda self, model, **p: fake_get(model, **p),
    ):
        call_command("crawl_metadata", "--with-vervar")

    variable = Variable.objects.get(variable_id="100")
    assert VerticalVariable.objects.filter(variable=variable, vervar_id="1000").exists()


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
def test_crawl_metadata_resume_cursor_progresses_across_runs(national_domain):
    """max_subjects is a resume cursor: each run should pick the next
    not-yet-crawled subjects, not re-fetch the same ones repeatedly."""

    def two_subjects(model, **params):
        if model == "subject":
            return ok([{"sub_id": "10", "title": "Inflasi"}, {"sub_id": "20", "title": "Kemiskinan"}])
        if model == "var":
            var_id = "100" if params.get("subject") == "10" else "200"
            return ok([{"var_id": var_id, "title": f"Var {var_id}", "unit": "", "def": ""}])
        return fake_get(model, **params)

    with patch(
        "bps_client.client.BpsClient.get",
        autospec=True,
        side_effect=lambda self, model, **p: two_subjects(model, **p),
    ):
        call_command("crawl_metadata", "--max-subjects", "1")

    assert Subject.objects.get(subject_id="10").metadata_crawled_at is not None
    assert Subject.objects.get(subject_id="20").metadata_crawled_at is None
    assert Variable.objects.filter(variable_id="100").exists()
    assert not Variable.objects.filter(variable_id="200").exists()

    with patch(
        "bps_client.client.BpsClient.get",
        autospec=True,
        side_effect=lambda self, model, **p: two_subjects(model, **p),
    ):
        call_command("crawl_metadata", "--max-subjects", "1")

    # Second run picks subject 20 (not yet crawled), not subject 10 again.
    assert Subject.objects.get(subject_id="20").metadata_crawled_at is not None
    assert Variable.objects.filter(variable_id="200").exists()


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


@pytest.mark.django_db
def test_crawl_metadata_force_reprocesses_already_crawled_subject(national_domain):
    """Raising max_variables alone has no effect on an already-crawled
    subject (the resume cursor skips it) — --force is required to go
    back and pull the additional variables out of it."""

    def two_variables(model, **params):
        if model == "var":
            return ok(
                [
                    {"var_id": "100", "title": "Var 100", "unit": "", "def": ""},
                    {"var_id": "200", "title": "Var 200", "unit": "", "def": ""},
                ]
            )
        return fake_get(model, **params)

    with patch(
        "bps_client.client.BpsClient.get",
        autospec=True,
        side_effect=lambda self, model, **p: two_variables(model, **p),
    ):
        call_command("crawl_metadata", "--max-variables", "1")

    assert Variable.objects.filter(variable_id="100").exists()
    assert not Variable.objects.filter(variable_id="200").exists()

    # Without --force, raising max_variables changes nothing: the subject
    # is already marked crawled.
    with patch(
        "bps_client.client.BpsClient.get",
        autospec=True,
        side_effect=lambda self, model, **p: two_variables(model, **p),
    ):
        call_command("crawl_metadata", "--max-variables", "2")

    assert not Variable.objects.filter(variable_id="200").exists()

    # --force re-processes it and picks up the second variable.
    with patch(
        "bps_client.client.BpsClient.get",
        autospec=True,
        side_effect=lambda self, model, **p: two_variables(model, **p),
    ):
        call_command("crawl_metadata", "--max-variables", "2", "--force")

    assert Variable.objects.filter(variable_id="200").exists()
