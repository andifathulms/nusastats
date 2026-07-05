"""Explicit, deterministic domain sampling for coverage confirmation
(CLAUDE.md rule 4: sampling must be documented and configurable, never a
silent partial crawl). The same sample is reused by crawl_coverage and by
generate_report so the report's "domains sampled" section always matches
what was actually crawled.
"""

from django.conf import settings

from catalog.models import AdminLevel, Domain


def get_sample_domains():
    """Returns a dict describing exactly which domains are in-scope for
    coverage confirmation:
      {
        "national": <Domain>,
        "provinces": [<Domain>, ...],           # first N by domain_id
        "kabupaten_by_province": {
            <province.domain_id>: [<Domain>, ...]   # first M by domain_id
        },
      }
    """
    national = Domain.objects.filter(admin_level=AdminLevel.NATIONAL).first()

    province_count = settings.COVERAGE_SAMPLE_PROVINCE_COUNT
    kab_per_province = settings.COVERAGE_SAMPLE_KABUPATEN_PER_PROVINCE

    provinces = list(
        Domain.objects.filter(admin_level=AdminLevel.PROVINCE).order_by("domain_id")[:province_count]
    )

    kabupaten_by_province = {}
    for province in provinces:
        kabupaten_by_province[province.domain_id] = list(
            Domain.objects.filter(
                admin_level=AdminLevel.REGENCY, parent_province=province
            ).order_by("domain_id")[:kab_per_province]
        )

    return {
        "national": national,
        "provinces": provinces,
        "kabupaten_by_province": kabupaten_by_province,
    }


def flatten_sample_domains(sample):
    """All Domain objects in the sample, in check order: national, then
    each sampled province, then that province's sampled kabupaten/kota."""
    domains = []
    if sample["national"]:
        domains.append(sample["national"])
    for province in sample["provinces"]:
        domains.append(province)
        domains.extend(sample["kabupaten_by_province"].get(province.domain_id, []))
    return domains
