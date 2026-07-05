from unittest.mock import patch

import pytest
from django.core.management import call_command

from bps_client.client import BpsResponse
from catalog.models import (
    AdminLevel,
    CoverageRecord,
    Domain,
    PeriodData,
    Subject,
    SubjectCategory,
    Variable,
)


@pytest.fixture
def national_only(db, settings):
    settings.COVERAGE_SAMPLE_PROVINCE_COUNT = 0
    settings.COVERAGE_SAMPLE_KABUPATEN_PER_PROVINCE = 0
    domain = Domain.objects.create(domain_id="0000", domain_name="Indonesia", admin_level=AdminLevel.NATIONAL)
    category = SubjectCategory.objects.create(subject_category_id="1", domain=domain, name="Ekonomi")
    subject = Subject.objects.create(subject_id="10", subject_category=category, domain=domain, name="Inflasi")
    variable = Variable.objects.create(variable_id="100", subject=subject, domain=domain, name="Inflasi")
    return domain, variable


@pytest.mark.django_db
def test_crawl_coverage_joins_known_periods_into_th_param(national_only):
    domain, variable = national_only
    PeriodData.objects.create(period_id="1", variable=variable, label="2023", year=2023)
    PeriodData.objects.create(period_id="2", variable=variable, label="2024", year=2024)

    captured = {}

    def fake_get(self, model, **params):
        captured.update(params)
        return BpsResponse(
            url="fake", http_status=200, body={"data-availability": "not-available"}, response_hash="x"
        )

    with patch("bps_client.client.BpsClient.get", autospec=True, side_effect=fake_get):
        call_command("crawl_coverage")

    assert captured["th"] == "1;2"
    assert CoverageRecord.objects.filter(variable=variable, domain=domain).exists()


@pytest.mark.django_db
def test_crawl_coverage_skips_variable_with_no_known_periods(national_only):
    domain, variable = national_only

    with patch("bps_client.client.BpsClient.get", autospec=True) as mock_get:
        call_command("crawl_coverage")

    mock_get.assert_not_called()
    assert not CoverageRecord.objects.filter(variable=variable).exists()
