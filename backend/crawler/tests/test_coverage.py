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
from crawler.coverage import upsert_coverage_record


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
    domain = variable.domain
    resp = make_resp(
        {
            "data-availability": "available",
            "tahun": [{"val": "1", "label": "2023"}],
            "datacontent": {"1000100201": 5.2},
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
    resp = make_resp({"data-availability": "available", "tahun": [{"val": "1", "label": "2023"}], "datacontent": {}})

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
            "tahun": [{"val": "1", "label": "2024"}],
            "datacontent": {"1000100301": 3.1},
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
