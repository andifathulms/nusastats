import pytest

from bps_client.client import BpsResponse
from catalog.models import CoverageStatus, SimdasiCoverageRecord, SimdasiTable
from crawler.simdasi import upsert_simdasi_coverage_record


@pytest.fixture
def table(db):
    return SimdasiTable.objects.create(table_id="T1", subject_name="Ekonomi", title="PDRB")


def make_resp(body, is_error=False, error_detail=""):
    return BpsResponse(url="fake", http_status=200, body=body, response_hash="x", is_error=is_error, error_detail=error_detail)


@pytest.mark.django_db
def test_confirmed_when_ketersediaan_tahun_present(table):
    resp = make_resp({"ketersediaan_tahun": ["2021", "2022"]})

    record = upsert_simdasi_coverage_record(table, "3171010", resp)

    assert record.status == CoverageStatus.CONFIRMED
    assert record.years_confirmed == ["2021", "2022"]


@pytest.mark.django_db
def test_not_confirmed_when_ketersediaan_tahun_empty(table):
    resp = make_resp({"ketersediaan_tahun": []})

    record = upsert_simdasi_coverage_record(table, "3171010", resp)

    assert record.status == CoverageStatus.NOT_CONFIRMED


@pytest.mark.django_db
def test_recheck_is_idempotent(table):
    resp = make_resp({"ketersediaan_tahun": ["2022"]})

    upsert_simdasi_coverage_record(table, "3171010", resp)
    upsert_simdasi_coverage_record(table, "3171010", resp)

    assert SimdasiCoverageRecord.objects.filter(table=table, mfd_region_code="3171010").count() == 1
