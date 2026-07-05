"""SIMDASI coverage logic (PRD §5.4). Mirrors crawler/coverage.py but for
SimdasiCoverageRecord, keyed on (table, mfd_region_code) instead of
(variable, domain, model_type) — SIMDASI is inherently region-scoped.
"""

from django.utils import timezone

from catalog.models import CoverageCheckLog, CoverageStatus, SimdasiCoverageRecord


def parse_ketersediaan_tahun(body):
    if not isinstance(body, dict):
        return []
    years = body.get("ketersediaan_tahun") or []
    return [y for y in years if y not in (None, "", "-")]


def determine_simdasi_status(resp):
    if resp.is_error:
        return CoverageStatus.ERROR, []
    years = parse_ketersediaan_tahun(resp.body)
    if not years:
        return CoverageStatus.NOT_CONFIRMED, []
    return CoverageStatus.CONFIRMED, years


def upsert_simdasi_coverage_record(table, mfd_region_code, resp):
    check_log = CoverageCheckLog.objects.create(
        url=resp.url,
        http_status=resp.http_status,
        response_hash=resp.response_hash,
        raw_body=resp.body,
        is_error=resp.is_error,
        error_detail=resp.error_detail,
    )
    status, years = determine_simdasi_status(resp)

    record, created = SimdasiCoverageRecord.objects.get_or_create(
        table=table,
        mfd_region_code=mfd_region_code,
        defaults={
            "status": status,
            "years_confirmed": years,
            "last_checked_at": timezone.now(),
            "last_check_log": check_log,
        },
    )
    if not created:
        record.status = status
        record.years_confirmed = years
        record.last_checked_at = timezone.now()
        record.last_check_log = check_log
        record.save()

    return record
