from unittest.mock import patch

import pytest
from django.core.management import call_command

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


def make_key(vervar, var, turvar, th, turth=0):
    return f"{vervar}{var}{turvar}{th}{turth}"


@pytest.mark.django_db
def test_ingest_confirmed_data_only_fetches_confirmed_variables():
    national = Domain.objects.create(domain_id="0000", domain_name="Indonesia", admin_level=AdminLevel.NATIONAL)
    category = SubjectCategory.objects.create(subject_category_id="1", domain=national, name="Ekonomi")
    subject = Subject.objects.create(subject_id="10", subject_category=category, domain=national, name="Inflasi")

    confirmed_var = Variable.objects.create(variable_id="100", subject=subject, domain=national, name="Confirmed")
    PeriodData.objects.create(period_id="1", variable=confirmed_var, label="2023", year=2023)
    CoverageRecord.objects.create(
        variable=confirmed_var, domain=national, model_type=confirmed_var.data_model,
        admin_level=AdminLevel.NATIONAL, status=CoverageStatus.CONFIRMED,
    )

    unconfirmed_var = Variable.objects.create(variable_id="200", subject=subject, domain=national, name="Unconfirmed")
    PeriodData.objects.create(period_id="1", variable=unconfirmed_var, label="2023", year=2023)
    CoverageRecord.objects.create(
        variable=unconfirmed_var, domain=national, model_type=unconfirmed_var.data_model,
        admin_level=AdminLevel.NATIONAL, status=CoverageStatus.NOT_CONFIRMED,
    )

    fetched_var_ids = []

    def fake_get(self, model, **params):
        fetched_var_ids.append(params["var"])
        return BpsResponse(
            url="fake",
            http_status=200,
            body={
                "data-availability": "available",
                "vervar": [{"val": 0, "label": "<b>INDONESIA</b>"}],
                "turvar": [{"val": 0, "label": "Total"}],
                "turtahun": [{"val": 0, "label": "Tahun"}],
                "tahun": [{"val": "1", "label": "2023"}],
                "datacontent": {make_key(0, params["var"], 0, 1): 42.0},
            },
            response_hash="x",
        )

    with patch("bps_client.client.BpsClient.get", autospec=True, side_effect=fake_get):
        call_command("ingest_confirmed_data")

    assert fetched_var_ids == ["100"]
    assert DataPoint.objects.filter(variable=confirmed_var).exists()
    assert not DataPoint.objects.filter(variable=unconfirmed_var).exists()
