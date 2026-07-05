import pytest

from bps_client.client import BpsResponse
from catalog.models import (
    AdminLevel,
    CoverageRecord,
    CoverageStatus,
    CoverageStatusChange,
    Domain,
    Subject,
    SubjectCategory,
    Variable,
)
from crawler.coverage import fetch_th_chunked_responses, upsert_coverage_record, upsert_coverage_record_multi


@pytest.fixture
def variable(db):
    domain = Domain.objects.create(domain_id="0000", domain_name="Indonesia", admin_level=AdminLevel.NATIONAL)
    category = SubjectCategory.objects.create(subject_category_id="1", domain=domain, name="Ekonomi")
    subject = Subject.objects.create(subject_id="10", subject_category=category, domain=domain, name="Inflasi")
    return Variable.objects.create(variable_id="100", subject=subject, domain=domain, name="Inflasi Bulanan")


def make_resp(body, http_status=200, is_error=False, error_detail=""):
    return BpsResponse(
        url="https://webapi.bps.go.id/v1/api/list/?model=data",
        http_status=http_status,
        body=body,
        response_hash="deadbeef",
        is_error=is_error,
        error_detail=error_detail,
    )


@pytest.mark.django_db
def test_confirmed_only_when_datacontent_has_real_values(variable):
    """Key "0100010" is the real decoded shape (vervar=0 for domain 0000,
    var=100, turvar=0, th=1, turth=0), per the format confirmed against a
    live BPS response."""
    domain = variable.domain
    resp = make_resp(
        {
            "data-availability": "available",
            "turvar": [{"val": 0, "label": "Total"}],
            "turtahun": [{"val": 0, "label": "Tahun"}],
            "tahun": [{"val": "1", "label": "2023"}],
            "datacontent": {"0100010": 5.2},
        }
    )

    record = upsert_coverage_record(variable, domain, resp)

    assert record.status == CoverageStatus.CONFIRMED
    assert record.years_confirmed == ["2023"]


@pytest.mark.django_db
def test_available_with_empty_datacontent_is_not_confirmed(variable):
    """PRD §5.3: metadata can claim availability while content is empty —
    that must not be marked confirmed."""
    domain = variable.domain
    resp = make_resp(
        {
            "data-availability": "available",
            "turvar": [{"val": 0, "label": "Total"}],
            "turtahun": [{"val": 0, "label": "Tahun"}],
            "tahun": [{"val": "1", "label": "2023"}],
            "datacontent": {},
        }
    )

    record = upsert_coverage_record(variable, domain, resp)

    assert record.status == CoverageStatus.NOT_CONFIRMED


@pytest.mark.django_db
def test_available_with_null_value_for_requested_key_is_not_confirmed(variable):
    """A datacontent value present but null (BPS uses this for a real,
    checked-but-empty cell) must not be confirmed either — only an actual
    non-null value counts."""
    domain = variable.domain
    resp = make_resp(
        {
            "data-availability": "available",
            "turvar": [{"val": 0, "label": "Total"}],
            "turtahun": [{"val": 0, "label": "Tahun"}],
            "tahun": [{"val": "1", "label": "2023"}],
            "datacontent": {"0100010": None},
        }
    )

    record = upsert_coverage_record(variable, domain, resp)

    assert record.status == CoverageStatus.NOT_CONFIRMED


@pytest.mark.django_db
def test_error_response_marks_error_status_not_swallowed(variable):
    domain = variable.domain
    resp = make_resp(None, http_status=200, is_error=True, error_detail="BPS application status: 404 UserNotFound")

    record = upsert_coverage_record(variable, domain, resp)

    assert record.status == CoverageStatus.ERROR


@pytest.mark.django_db
def test_recheck_updates_existing_record_and_logs_status_change(variable):
    domain = variable.domain
    not_available = make_resp({"data-availability": "not-available"})
    now_available = make_resp(
        {
            "data-availability": "available",
            "turvar": [{"val": 0, "label": "Total"}],
            "turtahun": [{"val": 0, "label": "Tahun"}],
            "tahun": [{"val": "2", "label": "2024"}],
            "datacontent": {"0100020": 3.1},
        }
    )

    upsert_coverage_record(variable, domain, not_available)
    assert CoverageRecord.objects.filter(variable=variable, domain=domain).count() == 1

    record = upsert_coverage_record(variable, domain, now_available)

    assert CoverageRecord.objects.filter(variable=variable, domain=domain).count() == 1
    assert record.status == CoverageStatus.CONFIRMED
    assert CoverageStatusChange.objects.filter(
        coverage_record=record,
        previous_status=CoverageStatus.NOT_CONFIRMED,
        new_status=CoverageStatus.CONFIRMED,
    ).exists()


class FakeChunkClient:
    """Simulates BPS's real behavior of rejecting an oversized `th` batch
    with a "maximum allowed... is N" error, confirmed live (N=3 for a
    national-domain request in one observed case, N=2 for a province)."""

    def __init__(self, max_th, domain_id="0000", var_id="100"):
        self.max_th = max_th
        self.domain_id = domain_id
        self.var_id = var_id
        self.calls = []

    def get(self, model, **params):
        self.calls.append(params)
        th_values = params["th"].split(";")
        if len(th_values) > self.max_th:
            return BpsResponse(
                url="fake",
                http_status=200,
                body=None,
                response_hash="x",
                is_error=True,
                error_detail=(
                    f"BPS application status: Error - The maximum allowed number of years "
                    f"for the 'th' parameter is {self.max_th}. You provided {len(th_values)}."
                ),
            )
        return BpsResponse(
            url="fake",
            http_status=200,
            body={
                "data-availability": "available",
                "turvar": [{"val": 0, "label": "Total"}],
                "turtahun": [{"val": 0, "label": "Tahun"}],
                "tahun": [{"val": v, "label": f"20{v.zfill(2)}"} for v in th_values],
                "datacontent": {f"{self.domain_id.lstrip('0') or '0'}{self.var_id}0{v}0": 1.0 for v in th_values},
            },
            response_hash="x",
        )


@pytest.mark.django_db
def test_fetch_th_chunked_shrinks_on_max_th_error(variable):
    domain = variable.domain
    client = FakeChunkClient(max_th=2)

    responses = fetch_th_chunked_responses(client, domain, variable, ["1", "2", "3", "4", "5"])

    # First call (5 years) rejected and retried at chunk_size=2, discovered
    # from the error message rather than hardcoded.
    assert len(client.calls[0]["th"].split(";")) == 5
    assert not any(r.is_error for r in responses)
    assert sum(len(r.body["tahun"]) for r in responses) == 5


@pytest.mark.django_db
def test_upsert_coverage_record_multi_merges_years_across_chunks(variable):
    domain = variable.domain
    client = FakeChunkClient(max_th=2)
    responses = fetch_th_chunked_responses(client, domain, variable, ["1", "2", "3"])

    record = upsert_coverage_record_multi(variable, domain, responses)

    assert record.status == CoverageStatus.CONFIRMED
    assert len(record.years_confirmed) == 3


@pytest.mark.django_db
def test_upsert_coverage_record_multi_confirmed_survives_a_partial_chunk_error(variable):
    domain = variable.domain
    ok_resp = make_resp(
        {
            "data-availability": "available",
            "turvar": [{"val": 0, "label": "Total"}],
            "turtahun": [{"val": 0, "label": "Tahun"}],
            "tahun": [{"val": "1", "label": "2023"}],
            "datacontent": {"0100010": 5.2},
        }
    )
    error_resp = make_resp(None, is_error=True, error_detail="HTTP 500")

    record = upsert_coverage_record_multi(variable, domain, [ok_resp, error_resp])

    assert record.status == CoverageStatus.CONFIRMED
    assert record.years_confirmed == ["2023"]
