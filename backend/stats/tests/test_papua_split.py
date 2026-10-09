"""The 2022 Papua split: domains discovered from stored data-response vervar
codes (crawler.vervar_domains), old-code twins superseded at ingest, and
re-decoding from stored logs (stats.ingest.reingest_from_logs)."""

import pytest
from django.core.management import call_command

from bps_client.client import BpsResponse
from catalog.models import (
    AdminLevel,
    CoverageRecord,
    CoverageStatus,
    DataModelType,
    Domain,
    DomainSource,
    PeriodData,
    Subject,
    SubjectCategory,
    Variable,
)
from crawler import vervar_domains
from crawler.coverage import record_check_log
from stats.ingest import ingest_from_responses, reingest_from_logs
from stats.models import DataPoint

URL = "https://webapi.bps.go.id/v1/api/list/model/data/domain/0000/var/464/th/125/key/***REDACTED***/"


def key(vervar, th="125"):
    return f"{vervar}4640{th}0"


def body(values, vervar):
    return {
        "data-availability": "available",
        "vervar": vervar,
        "turvar": [{"val": 0, "label": "Tidak ada"}],
        "turtahun": [{"val": 0, "label": "Tahun"}],
        "tahun": [{"val": 125, "label": "2025"}],
        "datacontent": {key(v): x for v, x in values.items()},
    }


VERVAR = [
    {"val": 9400, "label": "<b>PAPUA</b>"},
    {"val": 9416, "label": "Yahukimo"},
    {"val": 9700, "label": "<b>PAPUA PEGUNUNGAN</b>"},
    {"val": 9707, "label": "YAHUKIMO"},
    {"val": 9708, "label": "PEGUNUNGAN BINTANG"},
    {"val": 5400, "label": "DILI"},
]


@pytest.fixture
def setup(db):
    national = Domain.objects.create(domain_id="0000", domain_name="Indonesia", admin_level=AdminLevel.NATIONAL)
    papua = Domain.objects.create(domain_id="9400", domain_name="Papua", admin_level=AdminLevel.PROVINCE)
    Domain.objects.create(domain_id="9416", domain_name="Yahukimo", admin_level=AdminLevel.REGENCY, parent_province=papua)
    Domain.objects.create(
        domain_id="9417", domain_name="Pegunungan Bintang", admin_level=AdminLevel.REGENCY, parent_province=papua
    )
    cat = SubjectCategory.objects.create(subject_category_id="1", domain=national, name="Sosial")
    subject = Subject.objects.create(subject_id="40", subject_category=cat, domain=national, name="Gender")
    variable = Variable.objects.create(
        variable_id="464", subject=subject, domain=national, name="Perempuan di parlemen",
        data_model=DataModelType.DYNAMIC,
    )
    PeriodData.objects.create(period_id="125", variable=variable, label="2025", year=2025)
    CoverageRecord.objects.create(
        variable=variable, domain=national, model_type=DataModelType.DYNAMIC,
        admin_level=AdminLevel.NATIONAL, status=CoverageStatus.CONFIRMED,
    )
    log = record_check_log(BpsResponse(URL, 200, body({9416: 5, 9707: 0, 9708: 3.1}, VERVAR), "abc"))
    return variable, log


@pytest.mark.django_db
def test_discover_plans_new_papua_domains_with_predecessors(setup):
    plan = vervar_domains.discover()
    by_id = {i["domain_id"]: i for i in plan["create"]}

    assert set(by_id) == {"9700", "9707", "9708"}
    assert by_id["9700"]["domain_name"] == "Papua Pegunungan"
    assert by_id["9700"]["predecessor"] is None
    # Named after the BPS domain-endpoint predecessor, not the raw label.
    assert by_id["9707"]["domain_name"] == "Yahukimo"
    assert by_id["9707"]["predecessor"] == "9416"
    assert by_id["9707"]["parent"] == "9700"
    assert by_id["9708"]["predecessor"] == "9417"
    # Other unknown codes are reported, never created.
    assert plan["other_unknown"] == {"5400": "DILI"}
    assert plan["unmatched"] == []


@pytest.mark.django_db
def test_discover_reports_ambiguous_predecessor_instead_of_guessing(setup):
    papua = Domain.objects.get(domain_id="9400")
    Domain.objects.create(domain_id="9437", domain_name="Yahukimo", admin_level=AdminLevel.REGENCY, parent_province=papua)

    plan = vervar_domains.discover()

    assert "9707" not in {i["domain_id"] for i in plan["create"]}
    assert [u["domain_id"] for u in plan["unmatched"]] == ["9707"]


@pytest.mark.django_db
def test_add_vervar_domains_is_idempotent_and_records_source(setup):
    _variable, log = setup
    call_command("add_vervar_domains")
    call_command("add_vervar_domains")

    new = Domain.objects.get(domain_id="9707")
    assert Domain.objects.filter(domain_id="9707").count() == 1
    assert new.source == DomainSource.DATA_VERVAR
    assert new.source_check_log_id == log.id
    assert new.predecessor.domain_id == "9416"
    assert new.parent_province.domain_id == "9700"
    assert not Domain.objects.filter(domain_id="5400").exists()


@pytest.mark.django_db
def test_dry_run_writes_nothing(setup):
    call_command("add_vervar_domains", "--dry-run")
    assert not Domain.objects.filter(domain_id="9707").exists()


@pytest.mark.django_db
def test_ingest_prefers_new_code_and_deletes_stale_old_code_row(setup):
    variable, log = setup
    resp = BpsResponse(URL, 200, log.raw_body, "abc")
    # Before the new domains exist, only the old code is stored.
    ingest_from_responses(variable, [(resp, log)])
    assert DataPoint.objects.get(variable=variable, domain__domain_id="9416").value == 5

    vervar_domains.apply(vervar_domains.discover())
    report = {}
    ingest_from_responses(variable, [(resp, log)], report=report)

    assert report["superseded"] == 1
    assert not DataPoint.objects.filter(variable=variable, domain__domain_id="9416").exists()
    assert DataPoint.objects.get(variable=variable, domain__domain_id="9707").value == 0
    # 9417 had no value in this response, so its successor simply adds a row.
    assert DataPoint.objects.get(variable=variable, domain__domain_id="9708").value == 3.1


@pytest.mark.django_db
def test_old_code_kept_when_new_code_has_no_value(setup):
    variable, _log = setup
    vervar_domains.apply(vervar_domains.discover())
    only_old = record_check_log(BpsResponse(URL, 200, body({9416: 5}, VERVAR), "def"))

    ingest_from_responses(variable, [(BpsResponse(URL, 200, only_old.raw_body, "def"), only_old)])

    assert DataPoint.objects.get(variable=variable, domain__domain_id="9416").value == 5


@pytest.mark.django_db
def test_reingest_from_logs_uses_stored_responses_without_new_logs(setup):
    variable, log = setup
    vervar_domains.apply(vervar_domains.discover())
    logs_before = type(log).objects.count()

    report = reingest_from_logs()

    assert type(log).objects.count() == logs_before
    assert report["variables"] == 1
    dp = DataPoint.objects.get(variable=variable, domain__domain_id="9707")
    assert dp.source_check_log_id == log.id
