import pytest

from bps_client.client import BpsResponse
from catalog.models import AdminLevel, Domain, PeriodData, Subject, SubjectCategory, Variable
from crawler.coverage import record_check_log
from stats.ingest import ingest_from_responses
from stats.models import DataPoint


def make_key(vervar, var, turvar, th, turth=0):
    return f"{vervar}{var}{turvar}{th}{turth}"


@pytest.fixture
def variable(db):
    national = Domain.objects.create(domain_id="0000", domain_name="Indonesia", admin_level=AdminLevel.NATIONAL)
    category = SubjectCategory.objects.create(subject_category_id="1", domain=national, name="Ekonomi")
    subject = Subject.objects.create(subject_id="10", subject_category=category, domain=national, name="Inflasi")
    variable = Variable.objects.create(variable_id="100", subject=subject, domain=national, name="Inflasi")
    PeriodData.objects.create(period_id="1", variable=variable, label="2023", year=2023)
    return variable


@pytest.fixture
def province(db):
    return Domain.objects.create(domain_id="1100", domain_name="Aceh", admin_level=AdminLevel.PROVINCE)


@pytest.fixture
def regency(db, province):
    return Domain.objects.create(
        domain_id="1101", domain_name="Simeulue", admin_level=AdminLevel.REGENCY, parent_province=province
    )


def make_resp(body):
    return BpsResponse(url="fake", http_status=200, body=body, response_hash="x")


@pytest.mark.django_db
def test_ingest_creates_datapoints_for_every_region_in_one_response(variable, province, regency):
    """A single domain=0000 response covers every region — ingestion must
    produce a DataPoint per region present, not just a sample."""
    resp = make_resp(
        {
            "data-availability": "available",
            "vervar": [
                {"val": 9999, "label": "<b>INDONESIA</b>"},
                {"val": 1100, "label": "ACEH"},
                {"val": 1101, "label": "Simeulue"},
            ],
            "turvar": [{"val": 0, "label": "Total"}],
            "turtahun": [{"val": 0, "label": "Tahun"}],
            "tahun": [{"val": "1", "label": "2023"}],
            "datacontent": {
                make_key(9999, 100, 0, 1): 100.0,
                make_key(1100, 100, 0, 1): 5.2,
                make_key(1101, 100, 0, 1): 4.8,
            },
        }
    )
    pairs = [(resp, record_check_log(resp))]

    count = ingest_from_responses(variable, pairs)

    assert count == 3
    national = Domain.objects.get(domain_id="0000")
    assert DataPoint.objects.get(variable=variable, domain=national).value == 100.0
    assert DataPoint.objects.get(variable=variable, domain=province).value == 5.2
    assert DataPoint.objects.get(variable=variable, domain=regency).value == 4.8


@pytest.mark.django_db
def test_ingest_stores_turvar_breakdown_separately(variable, province):
    """A gender-style secondary breakdown must produce distinct rows, not
    overwrite each other."""
    resp = make_resp(
        {
            "data-availability": "available",
            "vervar": [{"val": 1100, "label": "ACEH"}],
            "turvar": [{"val": 211, "label": "Laki-laki"}, {"val": 212, "label": "Perempuan"}],
            "turtahun": [{"val": 0, "label": "Tahun"}],
            "tahun": [{"val": "1", "label": "2023"}],
            "datacontent": {
                make_key(1100, 100, 211, 1): 70.1,
                make_key(1100, 100, 212, 1): 74.3,
            },
        }
    )
    pairs = [(resp, record_check_log(resp))]

    count = ingest_from_responses(variable, pairs)

    assert count == 2
    assert DataPoint.objects.get(variable=variable, domain=province, turvar_id="211").value == 70.1
    assert DataPoint.objects.get(variable=variable, domain=province, turvar_id="212").value == 74.3


@pytest.mark.django_db
def test_ingest_skips_null_values(variable, province):
    resp = make_resp(
        {
            "data-availability": "available",
            "vervar": [{"val": 1100, "label": "ACEH"}],
            "turvar": [{"val": 0, "label": "Total"}],
            "turtahun": [{"val": 0, "label": "Tahun"}],
            "tahun": [{"val": "1", "label": "2023"}],
            "datacontent": {make_key(1100, 100, 0, 1): None},
        }
    )
    pairs = [(resp, record_check_log(resp))]

    count = ingest_from_responses(variable, pairs)

    assert count == 0
    assert not DataPoint.objects.filter(variable=variable, domain=province).exists()


@pytest.mark.django_db
def test_ingest_is_idempotent(variable, province):
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
    pairs = [(resp, record_check_log(resp))]

    ingest_from_responses(variable, pairs)
    ingest_from_responses(variable, pairs)

    assert DataPoint.objects.filter(variable=variable, domain=province).count() == 1


@pytest.mark.django_db
def test_ingest_updates_value_on_recheck(variable, province):
    resp1 = make_resp(
        {
            "data-availability": "available",
            "vervar": [{"val": 1100, "label": "ACEH"}],
            "turvar": [{"val": 0, "label": "Total"}],
            "turtahun": [{"val": 0, "label": "Tahun"}],
            "tahun": [{"val": "1", "label": "2023"}],
            "datacontent": {make_key(1100, 100, 0, 1): 5.2},
        }
    )
    resp2 = make_resp(
        {
            "data-availability": "available",
            "vervar": [{"val": 1100, "label": "ACEH"}],
            "turvar": [{"val": 0, "label": "Total"}],
            "turtahun": [{"val": 0, "label": "Tahun"}],
            "tahun": [{"val": "1", "label": "2023"}],
            "datacontent": {make_key(1100, 100, 0, 1): 5.9},
        }
    )

    ingest_from_responses(variable, [(resp1, record_check_log(resp1))])
    ingest_from_responses(variable, [(resp2, record_check_log(resp2))])

    assert DataPoint.objects.filter(variable=variable, domain=province).count() == 1
    assert DataPoint.objects.get(variable=variable, domain=province).value == 5.9


@pytest.mark.django_db
def test_ingest_non_geographic_vervar_maps_every_row_to_national(variable):
    """Confirmed live: some variables use vervar for a non-geographic
    classification (commodity group, urban/rural) — the whole dataset is
    then implicitly national, not skipped for lack of a domain match."""
    national = variable.domain
    resp = make_resp(
        {
            "data-availability": "available",
            "vervar": [{"val": 100, "label": "<b>MAKANAN</b>"}, {"val": 101, "label": "Padi-padian"}],
            "turvar": [{"val": 189, "label": "Perkotaan"}, {"val": 190, "label": "Perdesaan"}],
            "turtahun": [{"val": 0, "label": "Tahun"}],
            "tahun": [{"val": "1", "label": "2023"}],
            "datacontent": {
                make_key(100, 100, 189, 1): 44.39,
                make_key(101, 100, 190, 1): 46.51,
            },
        }
    )
    pairs = [(resp, record_check_log(resp))]

    count = ingest_from_responses(variable, pairs)

    assert count == 2
    points = DataPoint.objects.filter(variable=variable, domain=national)
    assert points.count() == 2
    assert set(points.values_list("turvar_label", flat=True)) == {"Perkotaan", "Perdesaan"}
