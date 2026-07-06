from unittest.mock import patch

import pytest
from django.core.management import call_command
from django_celery_beat.models import PeriodicTask

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
from crawler.tasks import recrawl_confirmed_coverage


@pytest.mark.django_db
def test_setup_periodic_tasks_is_idempotent():
    call_command("setup_periodic_tasks")
    call_command("setup_periodic_tasks")

    assert PeriodicTask.objects.filter(name="recrawl-confirmed-coverage-weekly").count() == 1
    assert PeriodicTask.objects.filter(name="ingest-confirmed-data-weekly").count() == 1


@pytest.mark.django_db
def test_setup_periodic_tasks_schedules_ingestion_after_recrawl():
    call_command("setup_periodic_tasks")

    recrawl = PeriodicTask.objects.get(name="recrawl-confirmed-coverage-weekly")
    ingest = PeriodicTask.objects.get(name="ingest-confirmed-data-weekly")

    assert ingest.task == "stats.tasks.ingest_confirmed_data_task"
    assert int(ingest.crontab.hour) == int(recrawl.crontab.hour) + 1
    assert ingest.crontab.day_of_week == recrawl.crontab.day_of_week


@pytest.mark.django_db
def test_recrawl_only_touches_confirmed_records():
    domain = Domain.objects.create(domain_id="0000", domain_name="Indonesia", admin_level=AdminLevel.NATIONAL)
    category = SubjectCategory.objects.create(subject_category_id="1", domain=domain, name="Ekonomi")
    subject = Subject.objects.create(subject_id="10", subject_category=category, domain=domain, name="Inflasi")
    variable = Variable.objects.create(variable_id="100", subject=subject, domain=domain, name="Inflasi")
    PeriodData.objects.create(period_id="1", variable=variable, label="2023", year=2023)

    confirmed = CoverageRecord.objects.create(
        variable=variable, domain=domain, model_type=variable.data_model,
        admin_level=AdminLevel.NATIONAL, status=CoverageStatus.CONFIRMED,
    )
    CoverageRecord.objects.create(
        variable=variable, domain=domain, model_type="static_table",
        admin_level=AdminLevel.NATIONAL, status=CoverageStatus.UNCHECKED,
    )

    resp = BpsResponse(
        url="fake", http_status=200,
        body={"data-availability": "not-available"}, response_hash="x",
    )

    with patch("bps_client.client.BpsClient.get", autospec=True, return_value=resp):
        result = recrawl_confirmed_coverage()

    assert result == {"checked": 1}
    confirmed.refresh_from_db()
    assert confirmed.status == CoverageStatus.NOT_CONFIRMED
