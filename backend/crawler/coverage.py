"""Shared logic for turning one BPS `data`-model response into a
CoverageRecord update. Split out from the management command so it can be
reused by crawl_coverage.py and unit-tested directly against fixture-shaped
response bodies without invoking the full command/DB-sampling machinery.
"""

import hashlib

from django.utils import timezone

from catalog.models import CoverageCheckLog, CoverageRecord, CoverageStatus, CoverageStatusChange


def parse_years_confirmed(body):
    """Best-effort extraction of which periods had a non-null datacontent
    value.

    BPS encodes `datacontent` keys as concatenated vervar+var+turvar+period
    identifiers rather than tagging each key with its year directly. This
    pairs the `tahun` metadata list (present in dynamic-data responses)
    with the fact that *some* datacontent value is non-null, on the
    assumption there is at least one confirmed value per listed year. This
    is a simplification flagged for tightening once Phase 5's live crawl
    lets us inspect real response shapes end-to-end.
    """
    if not isinstance(body, dict):
        return []
    datacontent = body.get("datacontent") or {}
    has_any_value = any(v not in (None, "", "-") for v in datacontent.values())
    if not has_any_value:
        return []
    years = []
    for row in body.get("tahun", []) or []:
        label = row.get("label") or row.get("th")
        if label:
            years.append(label)
    return years


def record_check_log(resp):
    """Persist one CoverageCheckLog row from a BpsResponse. `resp.url` is
    already key-redacted by BpsClient before it ever reaches here."""
    return CoverageCheckLog.objects.create(
        url=resp.url,
        http_status=resp.http_status,
        response_hash=resp.response_hash or hashlib.sha256(b"").hexdigest(),
        raw_body=resp.body,
        is_error=resp.is_error,
        error_detail=resp.error_detail,
    )


def determine_status(resp):
    if resp.is_error:
        return CoverageStatus.ERROR, []
    body = resp.body or {}
    if body.get("data-availability") != "available":
        return CoverageStatus.NOT_CONFIRMED, []
    years = parse_years_confirmed(body)
    if not years:
        # `data-availability: available` with empty/null datacontent is
        # exactly the metadata-claims-but-content-is-empty case CLAUDE.md
        # and PRD §5.3 call out — never treat availability alone as
        # confirmation.
        return CoverageStatus.NOT_CONFIRMED, []
    return CoverageStatus.CONFIRMED, years


def upsert_coverage_record(variable, domain, resp):
    """Record one real HTTP response as a CoverageRecord update, appending
    to CoverageStatusChange if the status changed. Idempotent: calling
    this twice with the same (variable, domain, model_type) updates the
    existing row rather than duplicating it (CLAUDE.md rule 3).
    """
    check_log = record_check_log(resp)
    status, years = determine_status(resp)

    record, created = CoverageRecord.objects.get_or_create(
        variable=variable,
        domain=domain,
        model_type=variable.data_model,
        defaults={
            "admin_level": domain.admin_level,
            "status": status,
            "years_confirmed": years,
            "last_checked_at": timezone.now(),
            "last_check_log": check_log,
        },
    )

    if not created:
        previous_status = record.status
        record.status = status
        record.years_confirmed = years
        record.last_checked_at = timezone.now()
        record.last_check_log = check_log
        record.admin_level = domain.admin_level
        record.save()

        if previous_status != status:
            CoverageStatusChange.objects.create(
                coverage_record=record,
                previous_status=previous_status,
                new_status=status,
                check_log=check_log,
            )

    return record
