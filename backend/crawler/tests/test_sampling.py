import pytest

from catalog.models import AdminLevel, Domain
from crawler.sampling import flatten_sample_domains, get_sample_domains


@pytest.fixture
def domains(db, settings):
    settings.COVERAGE_SAMPLE_PROVINCE_COUNT = 1
    settings.COVERAGE_SAMPLE_KABUPATEN_PER_PROVINCE = 1

    national = Domain.objects.create(domain_id="0000", domain_name="Indonesia", admin_level=AdminLevel.NATIONAL)
    prov_a = Domain.objects.create(domain_id="11", domain_name="ACEH", admin_level=AdminLevel.PROVINCE)
    prov_b = Domain.objects.create(domain_id="31", domain_name="DKI JAKARTA", admin_level=AdminLevel.PROVINCE)
    Domain.objects.create(
        domain_id="1101", domain_name="KAB A", admin_level=AdminLevel.REGENCY, parent_province=prov_a
    )
    Domain.objects.create(
        domain_id="1102", domain_name="KAB B", admin_level=AdminLevel.REGENCY, parent_province=prov_a
    )
    return national, prov_a, prov_b


@pytest.mark.django_db
def test_sample_respects_configured_counts_and_is_deterministic(domains):
    national, prov_a, prov_b = domains

    sample = get_sample_domains()

    assert sample["national"] == national
    assert sample["provinces"] == [prov_a]  # lowest domain_id first, only 1 requested
    assert [k.domain_id for k in sample["kabupaten_by_province"][prov_a.domain_id]] == ["1101"]

    flat = flatten_sample_domains(sample)
    assert [d.domain_id for d in flat] == ["0000", "11", "1101"]
