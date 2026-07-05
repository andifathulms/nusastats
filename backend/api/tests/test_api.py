import pytest
from rest_framework.test import APIClient

from catalog.models import (
    AdminLevel,
    CoverageRecord,
    CoverageStatus,
    Domain,
    SimdasiTable,
    Subject,
    SubjectCategory,
    Variable,
)


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def confirmed_national_variable(db):
    domain = Domain.objects.create(domain_id="0000", domain_name="Indonesia", admin_level=AdminLevel.NATIONAL)
    category = SubjectCategory.objects.create(subject_category_id="1", domain=domain, name="Ekonomi")
    subject = Subject.objects.create(subject_id="10", subject_category=category, domain=domain, name="Inflasi")
    variable = Variable.objects.create(variable_id="100", subject=subject, domain=domain, name="Inflasi Bulanan")
    CoverageRecord.objects.create(
        variable=variable,
        domain=domain,
        model_type=variable.data_model,
        admin_level=AdminLevel.NATIONAL,
        status=CoverageStatus.CONFIRMED,
        years_confirmed=["2023"],
    )
    return variable


@pytest.mark.django_db
def test_list_variables(api_client, confirmed_national_variable):
    resp = api_client.get("/api/coverage/variables/")

    assert resp.status_code == 200
    assert resp.data["results"][0]["variable_id"] == "100"


@pytest.mark.django_db
def test_filter_variables_by_status(api_client, confirmed_national_variable):
    resp = api_client.get("/api/coverage/variables/", {"status": "confirmed"})
    assert resp.status_code == 200
    assert len(resp.data["results"]) == 1

    resp = api_client.get("/api/coverage/variables/", {"status": "error"})
    assert len(resp.data["results"]) == 0


@pytest.mark.django_db
def test_filter_variables_by_admin_level(api_client, confirmed_national_variable):
    resp = api_client.get("/api/coverage/variables/", {"admin_level": "regency"})
    assert len(resp.data["results"]) == 0

    resp = api_client.get("/api/coverage/variables/", {"admin_level": "national"})
    assert len(resp.data["results"]) == 1


@pytest.mark.django_db
def test_variable_detail_includes_coverage_records(api_client, confirmed_national_variable):
    resp = api_client.get(f"/api/coverage/variables/{confirmed_national_variable.id}/")

    assert resp.status_code == 200
    assert resp.data["coverage_records"][0]["status"] == "confirmed"
    assert resp.data["coverage_records"][0]["domain_id"] == "0000"


@pytest.mark.django_db
def test_export_returns_filtered_catalog(api_client, confirmed_national_variable):
    resp = api_client.get("/api/coverage/export/", {"keyword": "Inflasi"})

    assert resp.status_code == 200
    assert resp.data[0]["variable_id"] == "100"


@pytest.mark.django_db
def test_simdasi_endpoint_lists_tables(api_client, db):
    SimdasiTable.objects.create(table_id="T1", subject_name="Ekonomi", title="PDRB")

    resp = api_client.get("/api/coverage/simdasi/")

    assert resp.status_code == 200
    assert resp.data["results"][0]["table_id"] == "T1"
