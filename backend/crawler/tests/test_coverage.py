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
from crawler.coverage import (
    fetch_th_chunked_responses,
    record_check_log,
    resolve_vervar_vals,
    upsert_domain_coverage,
)


def make_key(vervar, var, turvar, th, turth=0):
    return f"{vervar}{var}{turvar}{th}{turth}"


@pytest.fixture
def variable(db):
    national = Domain.objects.create(domain_id="0000", domain_name="Indonesia", admin_level=AdminLevel.NATIONAL)
    category = SubjectCategory.objects.create(subject_category_id="1", domain=national, name="Ekonomi")
    subject = Subject.objects.create(subject_id="10", subject_category=category, domain=national, name="Inflasi")
    return Variable.objects.create(variable_id="100", subject=subject, domain=national, name="Inflasi Bulanan")


@pytest.fixture
def province(db):
    return Domain.objects.create(domain_id="1100", domain_name="Aceh", admin_level=AdminLevel.PROVINCE)


def make_resp(body, http_status=200, is_error=False, error_detail=""):
    return BpsResponse(
        url="https://webapi.bps.go.id/v1/api/list/model/data/domain/0000/...",
        http_status=http_status,
        body=body,
        response_hash="deadbeef",
        is_error=is_error,
        error_detail=error_detail,
    )


def upsert_single(variable, domain, resp):
    """Test helper: wraps one response as the (resp, log) pair list
    upsert_domain_coverage expects."""
    log = record_check_log(resp)
    return upsert_domain_coverage(variable, domain, [(resp, log)])


@pytest.mark.django_db
def test_confirmed_for_a_province_domain_matches_its_own_vervar_val(variable, province):
    """Confirmed live: a province/kabupaten's own domain_id is the vervar
    val to match in the domain=0000 response (e.g. Aceh's domain_id
    "1100" == vervar val 1100) — querying domain=<province code> directly
    was confirmed to return empty/null instead."""
    resp = make_resp(
        {
            "data-availability": "available",
            "vervar": [{"val": 1100, "label": "ACEH"}],
            "turvar": [{"val": 0, "label": "Total"}],
            "turtahun": [{"val": 0, "label": "Tahun"}],
            "tahun": [{"val": "1", "label": "2023"}],
            "datacontent": {make_key(1100, 100, 0, 1): 5.2},
        }
    )

    record = upsert_single(variable, province, resp)

    assert record.status == CoverageStatus.CONFIRMED
    assert record.years_confirmed == ["2023"]


@pytest.mark.django_db
def test_national_confirmed_only_when_indonesia_aggregate_row_exists(variable):
    """Some variables have a distinct all-Indonesia row in `vervar`
    (confirmed by label, not a guessed code); others (e.g. a "by
    kabupaten/kota" breakdown) simply don't, and national must then be
    not_confirmed — a real absence, not a bug."""
    national = variable.domain
    resp = make_resp(
        {
            "data-availability": "available",
            "vervar": [{"val": 9999, "label": "<b>INDONESIA</b>"}, {"val": 1100, "label": "ACEH"}],
            "turvar": [{"val": 0, "label": "Total"}],
            "turtahun": [{"val": 0, "label": "Tahun"}],
            "tahun": [{"val": "1", "label": "2023"}],
            "datacontent": {make_key(9999, 100, 0, 1): 100.0, make_key(1100, 100, 0, 1): 5.2},
        }
    )

    record = upsert_single(variable, national, resp)

    assert record.status == CoverageStatus.CONFIRMED
    assert record.years_confirmed == ["2023"]


@pytest.mark.django_db
def test_national_not_confirmed_when_no_indonesia_row_present(variable, province):
    national = variable.domain
    resp = make_resp(
        {
            "data-availability": "available",
            "vervar": [{"val": 1100, "label": "ACEH"}],  # no INDONESIA row at all
            "turvar": [{"val": 0, "label": "Total"}],
            "turtahun": [{"val": 0, "label": "Tahun"}],
            "tahun": [{"val": "1", "label": "2023"}],
            "datacontent": {make_key(1100, 100, 0, 1): 5.2},
        }
    )

    assert resolve_vervar_vals(national, resp.body) == []
    record = upsert_single(variable, national, resp)

    assert record.status == CoverageStatus.NOT_CONFIRMED


@pytest.mark.django_db
def test_non_geographic_vervar_treats_entire_dataset_as_national(variable):
    """Confirmed live for 3 real BPS variables: vervar isn't always
    geographic — some use it for a commodity-group or urban/rural
    classification instead (labelvervar wasn't a region label, and none
    of the vervar vals matched a real domain_id). When that's the case,
    the whole dataset is implicitly national, not "not confirmed"."""
    national = variable.domain
    resp = make_resp(
        {
            "data-availability": "available",
            "labelvervar": "Kelompok Barang Makanan dan Bukan Makanan (Susenas)",
            "vervar": [{"val": 100, "label": "<b>MAKANAN</b>"}, {"val": 101, "label": "Padi-padian"}],
            "turvar": [{"val": 189, "label": "Perkotaan"}, {"val": 190, "label": "Perdesaan"}],
            "turtahun": [{"val": 0, "label": "Tahun"}],
            "tahun": [{"val": "1", "label": "2023"}],
            "datacontent": {make_key(101, 100, 189, 1): 44.39},
        }
    )

    record = upsert_single(variable, national, resp)

    assert record.status == CoverageStatus.CONFIRMED
    assert record.years_confirmed == ["2023"]


@pytest.mark.django_db
def test_non_geographic_vervar_never_confirms_a_province_domain(variable, province):
    """Same non-geographic response as above — a province domain must
    stay not_confirmed since there's genuinely no regional breakdown."""
    resp = make_resp(
        {
            "data-availability": "available",
            "vervar": [{"val": 100, "label": "<b>MAKANAN</b>"}, {"val": 101, "label": "Padi-padian"}],
            "turvar": [{"val": 189, "label": "Perkotaan"}, {"val": 190, "label": "Perdesaan"}],
            "turtahun": [{"val": 0, "label": "Tahun"}],
            "tahun": [{"val": "1", "label": "2023"}],
            "datacontent": {make_key(101, 100, 189, 1): 44.39},
        }
    )

    record = upsert_single(variable, province, resp)

    assert record.status == CoverageStatus.NOT_CONFIRMED


@pytest.mark.django_db
def test_available_with_empty_datacontent_is_not_confirmed(variable, province):
    """PRD §5.3: metadata can claim availability while content is empty —
    that must not be marked confirmed."""
    resp = make_resp(
        {
            "data-availability": "available",
            "turvar": [{"val": 0, "label": "Total"}],
            "turtahun": [{"val": 0, "label": "Tahun"}],
            "tahun": [{"val": "1", "label": "2023"}],
            "datacontent": {},
        }
    )

    record = upsert_single(variable, province, resp)

    assert record.status == CoverageStatus.NOT_CONFIRMED


@pytest.mark.django_db
def test_available_with_null_value_for_requested_key_is_not_confirmed(variable, province):
    """A datacontent value present but null (BPS uses this for a real,
    checked-but-empty cell) must not be confirmed either — only an actual
    non-null value counts."""
    resp = make_resp(
        {
            "data-availability": "available",
            "turvar": [{"val": 0, "label": "Total"}],
            "turtahun": [{"val": 0, "label": "Tahun"}],
            "tahun": [{"val": "1", "label": "2023"}],
            "datacontent": {make_key(1100, 100, 0, 1): None},
        }
    )

    record = upsert_single(variable, province, resp)

    assert record.status == CoverageStatus.NOT_CONFIRMED


@pytest.mark.django_db
def test_error_response_marks_error_status_not_swallowed(variable, province):
    resp = make_resp(None, http_status=200, is_error=True, error_detail="BPS application status: 404 UserNotFound")

    record = upsert_single(variable, province, resp)

    assert record.status == CoverageStatus.ERROR


@pytest.mark.django_db
def test_recheck_updates_existing_record_and_logs_status_change(variable, province):
    not_available = make_resp({"data-availability": "not-available"})
    now_available = make_resp(
        {
            "data-availability": "available",
            "vervar": [{"val": 1100, "label": "ACEH"}],
            "turvar": [{"val": 0, "label": "Total"}],
            "turtahun": [{"val": 0, "label": "Tahun"}],
            "tahun": [{"val": "2", "label": "2024"}],
            "datacontent": {make_key(1100, 100, 0, 2): 3.1},
        }
    )

    upsert_single(variable, province, not_available)
    assert CoverageRecord.objects.filter(variable=variable, domain=province).count() == 1

    record = upsert_single(variable, province, now_available)

    assert CoverageRecord.objects.filter(variable=variable, domain=province).count() == 1
    assert record.status == CoverageStatus.CONFIRMED
    assert CoverageStatusChange.objects.filter(
        coverage_record=record,
        previous_status=CoverageStatus.NOT_CONFIRMED,
        new_status=CoverageStatus.CONFIRMED,
    ).exists()


class FakeChunkClient:
    """Simulates BPS's real behavior of rejecting an oversized `th` batch
    with a "maximum allowed... is N" error, confirmed live."""

    def __init__(self, max_th, var_id="100"):
        self.max_th = max_th
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
                "vervar": [{"val": 1100, "label": "ACEH"}],
                "turvar": [{"val": 0, "label": "Total"}],
                "turtahun": [{"val": 0, "label": "Tahun"}],
                "tahun": [{"val": v, "label": f"20{v.zfill(2)}"} for v in th_values],
                "datacontent": {make_key(1100, self.var_id, 0, v): 1.0 for v in th_values},
            },
            response_hash="x",
        )


@pytest.mark.django_db
def test_fetch_th_chunked_shrinks_on_max_th_error(variable):
    client = FakeChunkClient(max_th=2)

    responses = fetch_th_chunked_responses(client, variable, ["1", "2", "3", "4", "5"])

    # First call (5 years) rejected and retried at chunk_size=2, discovered
    # from the error message rather than hardcoded.
    assert len(client.calls[0]["th"].split(";")) == 5
    assert client.calls[0]["domain"] == "0000"
    assert not any(r.is_error for r in responses)
    assert sum(len(r.body["tahun"]) for r in responses) == 5


@pytest.mark.django_db
def test_upsert_domain_coverage_merges_years_across_chunks(variable, province):
    client = FakeChunkClient(max_th=2)
    responses = fetch_th_chunked_responses(client, variable, ["1", "2", "3"])
    response_log_pairs = [(r, record_check_log(r)) for r in responses]

    record = upsert_domain_coverage(variable, province, response_log_pairs)

    assert record.status == CoverageStatus.CONFIRMED
    assert len(record.years_confirmed) == 3


@pytest.mark.django_db
def test_upsert_domain_coverage_confirmed_survives_a_partial_chunk_error(variable, province):
    ok_resp = make_resp(
        {
            "data-availability": "available",
            "vervar": [{"val": 1100, "label": "ACEH"}],
            "turvar": [{"val": 0, "label": "Total"}],
            "turtahun": [{"val": 0, "label": "Tahun"}],
            "tahun": [{"val": "1", "label": "2023"}],
            "datacontent": {make_key(1100, 100, 0, 1): 5.2},
        }
    )
    error_resp = make_resp(None, is_error=True, error_detail="HTTP 500")
    pairs = [(ok_resp, record_check_log(ok_resp)), (error_resp, record_check_log(error_resp))]

    record = upsert_domain_coverage(variable, province, pairs)

    assert record.status == CoverageStatus.CONFIRMED
    assert record.years_confirmed == ["2023"]
