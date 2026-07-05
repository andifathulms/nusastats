"""Shared logic for turning one BPS `data`-model response into a
CoverageRecord update. Split out from the management command so it can be
reused by crawl_coverage.py and unit-tested directly against fixture-shaped
response bodies without invoking the full command/DB-sampling machinery.
"""

import hashlib

from django.utils import timezone

from catalog.models import CoverageCheckLog, CoverageRecord, CoverageStatus, CoverageStatusChange


def parse_years_confirmed(body, domain_id, variable_id):
    """Which periods actually had a non-null datacontent value, decoded
    from the real BPS `data`-model response shape.

    `datacontent` keys are the concatenation of
    `{vervar}{var}{turvar}{th}{turth}` with no separators or fixed-width
    padding (e.g. requesting domain=0000/var=455/th=124 for a variable
    with turvar 212 yields key "17014552121240" — vervar=1701, var=455,
    turvar=212, th=124, turth=0). This was decoded from two live sample
    responses, not guessed. Since field widths aren't fixed, this matches
    by trying every (turvar, turth) combination actually listed in the
    response against each requested `th`, rather than slicing positions.
    """
    if not isinstance(body, dict):
        return []
    datacontent = body.get("datacontent") or {}
    if not datacontent:
        return []

    try:
        vervar_val = str(int(domain_id))
    except (TypeError, ValueError):
        vervar_val = str(domain_id)
    var_val = str(variable_id)
    turvar_vals = [str(row.get("val")) for row in (body.get("turvar") or [])] or [""]
    turth_vals = [str(row.get("val")) for row in (body.get("turtahun") or [])] or ["0"]

    years = []
    for th_row in body.get("tahun", []) or []:
        th_val = str(th_row.get("val"))
        label = th_row.get("label")
        if not label:
            continue
        for turvar_val in turvar_vals:
            for turth_val in turth_vals:
                key = f"{vervar_val}{var_val}{turvar_val}{th_val}{turth_val}"
                if datacontent.get(key) not in (None, "", "-"):
                    years.append(label)
                    break
            else:
                continue
            break
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


def determine_status(resp, domain_id, variable_id):
    if resp.is_error:
        return CoverageStatus.ERROR, []
    body = resp.body or {}
    if body.get("data-availability") != "available":
        return CoverageStatus.NOT_CONFIRMED, []
    years = parse_years_confirmed(body, domain_id, variable_id)
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
    status, years = determine_status(resp, domain.domain_id, variable.variable_id)

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
