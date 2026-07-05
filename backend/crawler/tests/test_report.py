import pytest

from catalog.models import (
    AdminLevel,
    CoverageRecord,
    CoverageStatus,
    Domain,
    Subject,
    SubjectCategory,
    Variable,
)
from crawler.report import build_report, render_markdown


@pytest.mark.django_db
def test_build_report_flags_regency_gap():
    national = Domain.objects.create(domain_id="0000", domain_name="Indonesia", admin_level=AdminLevel.NATIONAL)
    regency = Domain.objects.create(domain_id="3171", domain_name="KOTA X", admin_level=AdminLevel.REGENCY)
    category = SubjectCategory.objects.create(subject_category_id="1", domain=national, name="Ekonomi")
    subject = Subject.objects.create(subject_id="10", subject_category=category, domain=national, name="Inflasi")
    variable = Variable.objects.create(variable_id="100", subject=subject, domain=national, name="Inflasi Bulanan")

    CoverageRecord.objects.create(
        variable=variable,
        domain=national,
        model_type=variable.data_model,
        admin_level=AdminLevel.NATIONAL,
        status=CoverageStatus.CONFIRMED,
    )
    CoverageRecord.objects.create(
        variable=variable,
        domain=regency,
        model_type=variable.data_model,
        admin_level=AdminLevel.REGENCY,
        status=CoverageStatus.NOT_CONFIRMED,
    )

    report = build_report()

    assert report["totals_per_admin_level"]["national"]["confirmed"] == 1
    assert report["totals_per_admin_level"]["regency"]["confirmed"] == 0
    assert any(gap["variable_id"] == "100" for gap in report["known_gaps"])

    markdown = render_markdown(report)
    assert "Inflasi Bulanan" in markdown
    assert "Sampling methodology" in markdown


@pytest.mark.django_db
def test_sampling_methodology_reflects_actual_records_not_current_config(settings):
    """The report must describe what was really crawled, not whatever
    the sampler would currently produce — a later change to
    COVERAGE_SAMPLE_PROVINCE_COUNT must not silently rewrite history."""
    settings.COVERAGE_SAMPLE_PROVINCE_COUNT = 5
    settings.COVERAGE_SAMPLE_KABUPATEN_PER_PROVINCE = 3

    national = Domain.objects.create(domain_id="0000", domain_name="Indonesia", admin_level=AdminLevel.NATIONAL)
    province = Domain.objects.create(domain_id="1100", domain_name="Aceh", admin_level=AdminLevel.PROVINCE)
    regency = Domain.objects.create(
        domain_id="1101", domain_name="Simeulue", admin_level=AdminLevel.REGENCY, parent_province=province
    )
    category = SubjectCategory.objects.create(subject_category_id="1", domain=national, name="Ekonomi")
    subject = Subject.objects.create(subject_id="10", subject_category=category, domain=national, name="Inflasi")
    variable = Variable.objects.create(variable_id="100", subject=subject, domain=national, name="Inflasi")

    for domain in (national, province, regency):
        CoverageRecord.objects.create(
            variable=variable,
            domain=domain,
            model_type=variable.data_model,
            admin_level=domain.admin_level,
            status=CoverageStatus.CONFIRMED,
        )

    report = build_report()

    # Only 1 province/1 regency actually have records, even though the
    # *current* settings would sample 5 provinces x 3 kab each.
    assert report["sampling_methodology"]["province_count"] == 1
    assert report["sampling_methodology"]["kabupaten_per_province"] == {"1100": 1}
    assert set(report["sampling_methodology"]["sampled_domain_ids"]) == {"0000", "1100", "1101"}
