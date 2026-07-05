"""Shared logic for turning BPS `data`-model response(s) into a
CoverageRecord update. Split out from the management command so it can be
reused by crawl_coverage.py and unit-tested directly against fixture-shaped
response bodies without invoking the full command/DB-sampling machinery.
"""

import hashlib
import re

from django.utils import timezone

from catalog.models import CoverageCheckLog, CoverageRecord, CoverageStatus, CoverageStatusChange

# Confirmed live: BPS caps how many `th` (year) values one `data` call may
# request, but the cap varies by request (3 for domain=0000 in one test,
# 2 for a province/regency domain in the same test) — not a fixed
# constant tied only to admin_level. Rather than hardcode a guess, the
# real limit is parsed from BPS's own error message and used to retry.
MAX_TH_ERROR_RE = re.compile(r"maximum allowed number of years for the 'th' parameter is (\d+)")


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


def _apply_coverage_result(variable, domain, status, years, check_log):
    """Idempotent upsert of a single CoverageRecord (CLAUDE.md rule 3):
    re-checking updates the existing row rather than duplicating it, and
    appends a CoverageStatusChange only when the status actually flips.
    """
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


def upsert_coverage_record(variable, domain, resp):
    """Record one real HTTP response as a CoverageRecord update. See
    upsert_coverage_record_multi for the case where covering all known
    periods takes more than one call.
    """
    check_log = record_check_log(resp)
    status, years = determine_status(resp, domain.domain_id, variable.variable_id)
    return _apply_coverage_result(variable, domain, status, years, check_log)


def fetch_th_chunked_responses(client, domain, variable, period_ids, use_cache=True):
    """Fetches `data` responses covering every period in `period_ids`,
    splitting into multiple calls if BPS rejects the batch as too large.
    Starts by requesting all periods in one call (cheapest); on BPS's
    "maximum allowed number of years... is N" error, shrinks to N and
    retries the same leftover periods rather than guessing a limit
    upfront. Returns the list of BpsResponse objects actually received
    (each still gets its own CoverageCheckLog for full traceability).
    """
    responses = []
    remaining = list(period_ids)
    chunk_size = len(remaining) or 1
    while remaining:
        chunk = remaining[:chunk_size]
        resp = client.get(
            "data", domain=domain.domain_id, var=variable.variable_id, th=";".join(chunk), use_cache=use_cache
        )
        if resp.is_error and resp.error_detail:
            match = MAX_TH_ERROR_RE.search(resp.error_detail)
            if match and int(match.group(1)) < chunk_size:
                chunk_size = int(match.group(1))
                continue
        responses.append(resp)
        remaining = remaining[len(chunk):]
    return responses


def upsert_coverage_record_multi(variable, domain, responses):
    """Like upsert_coverage_record, but merges evidence from several
    responses covering different period chunks of the same
    (variable, domain) pair (see fetch_th_chunked_responses). A period is
    confirmed if any chunk's response confirms it; the record is only
    ERROR if every chunk errored. Every response still gets its own
    CoverageCheckLog row — full per-call traceability is preserved even
    though the record's last_check_log points at the most informative one.
    """
    check_logs = [record_check_log(resp) for resp in responses]

    years = []
    best_log = check_logs[-1] if check_logs else None
    any_success = False
    any_confirmed = False
    for resp, log in zip(responses, check_logs):
        if resp.is_error:
            continue
        any_success = True
        status, resp_years = determine_status(resp, domain.domain_id, variable.variable_id)
        if status == CoverageStatus.CONFIRMED:
            any_confirmed = True
            best_log = log
            for year in resp_years:
                if year not in years:
                    years.append(year)

    if any_confirmed:
        status = CoverageStatus.CONFIRMED
    elif any_success:
        status = CoverageStatus.NOT_CONFIRMED
    else:
        status = CoverageStatus.ERROR

    return _apply_coverage_result(variable, domain, status, years, best_log)
