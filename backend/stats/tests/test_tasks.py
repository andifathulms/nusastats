from unittest.mock import patch

import pytest

from bps_client.client import BpsResponse
from catalog.models import (
    AdminLevel,
    CoverageRecord,
    CoverageStatus,
    Domain,
    PeriodData,
    Subject,
    SubjectCategory,
    Variable,
)
from stats.models import DataPoint
from stats.tasks import ingest_confirmed_data_task


def make_key(vervar, var, turvar, th, turth=0):
    return f"{vervar}{var}{turvar}{th}{turth}"


@pytest.mark.django_db
def test_ingest_confirmed_data_task_ingests_confirmed_variable():
    national = Domain.objects.create(domain_id="0000", domain_name="Indonesia", admin_level=AdminLevel.NATIONAL)
    category = SubjectCategory.objects.create(subject_category_id="1", domain=national, name="Ekonomi")
    subject = Subject.objects.create(subject_id="10", subject_category=category, domain=national, name="Inflasi")
    variable = Variable.objects.create(variable_id="100", subject=subject, domain=national, name="Inflasi")
    PeriodData.objects.create(period_id="1", variable=variable, label="2023", year=2023)
    CoverageRecord.objects.create(
        variable=variable, domain=national, model_type=variable.data_model,
        admin_level=AdminLevel.NATIONAL, status=CoverageStatus.CONFIRMED,
    )

    resp = BpsResponse(
        url="fake",
        http_status=200,
        body={
            "data-availability": "available",
            "vervar": [{"val": 0, "label": "<b>INDONESIA</b>"}],
            "turvar": [{"val": 0, "label": "Total"}],
            "turtahun": [{"val": 0, "label": "Tahun"}],
            "tahun": [{"val": "1", "label": "2023"}],
            "datacontent": {make_key(0, "100", 0, 1): 42.0},
        },
        response_hash="x",
    )

    with patch("bps_client.client.BpsClient.get", autospec=True, return_value=resp):
        result = ingest_confirmed_data_task()

    assert result["data_points"] == 1
    assert result["variables"] == 1
    assert DataPoint.objects.get(variable=variable, domain=national).value == 42.0
