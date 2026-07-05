"""Coverage report generation (PRD §5.5 / CLAUDE.md Phase 5).

Builds the report data structure from whatever is currently in the
catalog tables — it does not crawl anything itself. It is meant to be run
immediately after a real crawl (crawl_domains -> crawl_metadata ->
crawl_coverage [-> crawl_simdasi]) so the numbers it prints are backed by
real, timestamped CoverageRecord/SimdasiCoverageRecord rows, never
hardcoded or assumed.
"""

from catalog.models import (
    AdminLevel,
    CoverageRecord,
    CoverageStatus,
    SimdasiCoverageRecord,
    SubjectCategory,
    Variable,
)
from crawler.sampling import flatten_sample_domains, get_sample_domains


def build_report():
    sample = get_sample_domains()
    sampled_domains = flatten_sample_domains(sample)

    totals_per_level = {}
    for level in AdminLevel.values:
        qs = CoverageRecord.objects.filter(admin_level=level)
        totals_per_level[level] = {
            "checked": qs.count(),
            "confirmed": qs.filter(status=CoverageStatus.CONFIRMED).count(),
            "not_confirmed": qs.filter(status=CoverageStatus.NOT_CONFIRMED).count(),
            "error": qs.filter(status=CoverageStatus.ERROR).count(),
        }

    per_subject = []
    for category in SubjectCategory.objects.all():
        variable_ids = Variable.objects.filter(subject__subject_category=category).values_list(
            "id", flat=True
        )
        qs = CoverageRecord.objects.filter(variable_id__in=variable_ids)
        per_subject.append(
            {
                "subject_category": category.name,
                "checked": qs.count(),
                "confirmed": qs.filter(status=CoverageStatus.CONFIRMED).count(),
            }
        )

    # Gaps: variables confirmed at national or province level but never
    # confirmed at regency level after sampling (PRD §5.5).
    confirmed_above_regency_variable_ids = set(
        CoverageRecord.objects.filter(
            status=CoverageStatus.CONFIRMED, admin_level__in=[AdminLevel.NATIONAL, AdminLevel.PROVINCE]
        ).values_list("variable_id", flat=True)
    )
    confirmed_regency_variable_ids = set(
        CoverageRecord.objects.filter(
            status=CoverageStatus.CONFIRMED, admin_level=AdminLevel.REGENCY
        ).values_list("variable_id", flat=True)
    )
    gap_variable_ids = confirmed_above_regency_variable_ids - confirmed_regency_variable_ids
    gaps = [
        {"variable_id": v.variable_id, "name": v.name}
        for v in Variable.objects.filter(id__in=gap_variable_ids)
    ]

    simdasi_summary = []
    for record in SimdasiCoverageRecord.objects.select_related("table").all():
        simdasi_summary.append(
            {
                "table": record.table.title,
                "mfd_region_code": record.mfd_region_code,
                "status": record.status,
                "years_confirmed": record.years_confirmed,
            }
        )

    return {
        "sampling_methodology": {
            "province_count": len(sample["provinces"]),
            "kabupaten_per_province": {
                prov_id: len(kabs) for prov_id, kabs in sample["kabupaten_by_province"].items()
            },
            "sampled_domain_ids": [d.domain_id for d in sampled_domains],
        },
        "totals_per_admin_level": totals_per_level,
        "per_subject_category": per_subject,
        "known_gaps": gaps,
        "simdasi_coverage": simdasi_summary,
    }


def render_markdown(report):
    lines = ["# Cakupan Coverage Report", ""]
    lines.append("## Sampling methodology")
    sm = report["sampling_methodology"]
    lines.append(f"- Provinces sampled: {sm['province_count']}")
    lines.append(f"- Kabupaten/kota sampled per province: {sm['kabupaten_per_province']}")
    lines.append(f"- Domains checked (IDs): {sm['sampled_domain_ids']}")
    lines.append("")

    lines.append("## Totals per admin level")
    for level, totals in report["totals_per_admin_level"].items():
        lines.append(
            f"- **{level}**: {totals['confirmed']} confirmed / {totals['checked']} checked "
            f"({totals['not_confirmed']} not confirmed, {totals['error']} errored)"
        )
    lines.append("")

    lines.append("## Per subject category")
    for row in report["per_subject_category"]:
        lines.append(f"- {row['subject_category']}: {row['confirmed']}/{row['checked']} confirmed")
    lines.append("")

    lines.append("## Known gaps (confirmed above regency, never confirmed at regency)")
    if report["known_gaps"]:
        for gap in report["known_gaps"]:
            lines.append(f"- {gap['variable_id']}: {gap['name']}")
    else:
        lines.append("- None found.")
    lines.append("")

    lines.append("## SIMDASI coverage (sampled MFD regions)")
    for row in report["simdasi_coverage"]:
        lines.append(f"- {row['table']} @ {row['mfd_region_code']}: {row['status']} {row['years_confirmed']}")

    return "\n".join(lines) + "\n"
