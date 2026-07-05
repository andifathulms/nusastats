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
    assert captured["domain"] == "0000"
    assert CoverageRecord.objects.filter(variable=variable, domain=domain).exists()


@pytest.mark.django_db
def test_crawl_coverage_skips_variable_with_no_known_periods(national_only):
    domain, variable = national_only

    with patch("bps_client.client.BpsClient.get", autospec=True) as mock_get:
        call_command("crawl_coverage")

    mock_get.assert_not_called()
    assert not CoverageRecord.objects.filter(variable=variable).exists()


@pytest.mark.django_db
def test_crawl_coverage_fetches_once_per_variable_regardless_of_sample_size(settings):
    """Confirmed live: domain=<province/kab code> data calls return
    empty/null, so every sampled domain must be decoded from the same
    domain=0000 response set — not one call per sampled domain."""
    settings.COVERAGE_SAMPLE_PROVINCE_COUNT = 2
    settings.COVERAGE_SAMPLE_KABUPATEN_PER_PROVINCE = 1

    national = Domain.objects.create(domain_id="0000", domain_name="Indonesia", admin_level=AdminLevel.NATIONAL)
    prov_a = Domain.objects.create(domain_id="1100", domain_name="Aceh", admin_level=AdminLevel.PROVINCE)
    prov_b = Domain.objects.create(domain_id="1200", domain_name="Sumut", admin_level=AdminLevel.PROVINCE)
    Domain.objects.create(domain_id="1101", domain_name="Kab A", admin_level=AdminLevel.REGENCY, parent_province=prov_a)
    Domain.objects.create(domain_id="1201", domain_name="Kab B", admin_level=AdminLevel.REGENCY, parent_province=prov_b)

    category = SubjectCategory.objects.create(subject_category_id="1", domain=national, name="Ekonomi")
    subject = Subject.objects.create(subject_id="10", subject_category=category, domain=national, name="Inflasi")
    variable = Variable.objects.create(variable_id="100", subject=subject, domain=national, name="Inflasi")
    PeriodData.objects.create(period_id="1", variable=variable, label="2023", year=2023)

    call_count = {"n": 0}

    def fake_get(self, model, **params):
        call_count["n"] += 1
        return BpsResponse(
            url="fake", http_status=200, body={"data-availability": "not-available"}, response_hash="x"
        )

    with patch("bps_client.client.BpsClient.get", autospec=True, side_effect=fake_get):
        call_command("crawl_coverage")

    # 1 national + 2 provinces + 2 kabupaten = 5 domains, but only 1 real
    # HTTP call for the single known period.
    assert call_count["n"] == 1
    assert CoverageRecord.objects.filter(variable=variable).count() == 5
