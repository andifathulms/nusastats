"""Shared logic for turning BPS `data`-model response(s) into CoverageRecord
updates. Split out from the management command so it can be reused by
crawl_coverage.py and unit-tested directly against fixture-shaped response
bodies without invoking the full command/DB-sampling machinery.

Architecture note (confirmed live, not assumed): a `data` call scoped to
domain=0000 (national) returns the FULL regional breakdown for a variable
— every province and kabupaten/kota's datacontent in one response, keyed
by each region's own vervar id. Querying `domain=<province/kab code>`
directly was confirmed live to return an empty or literally-null body for
at least one real indicator, even though the same data is present and
decodable from the domain=0000 response. Each BPS regional domain appears
to be its own semi-independent instance with its own local variable
catalog, rather than a scoped view of the national one. So every `data`
call this module makes targets domain=0000, and confirmation for
national/province/kabupaten levels is a decode step against that single
response set — never a separate domain=<code> API call.
"""

import hashlib
import re

from django.utils import timezone

from catalog.models import AdminLevel, CoverageCheckLog, CoverageRecord, CoverageStatus, CoverageStatusChange

# Confirmed live: BPS caps how many `th` (year) values one `data` call may
# request, but the cap varies by request (3 in one observed case) — not a
# fixed constant. Rather than hardcode a guess, the real limit is parsed
# from BPS's own error message and used to retry.
MAX_TH_ERROR_RE = re.compile(r"maximum allowed number of years for the 'th' parameter is (\d+)")

NATIONAL_DOMAIN_ID = "0000"


def resolve_vervar_val(domain, body):
    """Which vervar `val` in this response corresponds to `domain`.

    For a province/kabupaten domain, its own domain_id is the vervar val
    (confirmed live: Aceh's domain_id "1100" matches vervar val 1100 in
    the domain=0000 response). For the national domain there is no such
    direct match — some variables have a distinct all-Indonesia aggregate
    row, most don't (e.g. a "by kabupaten/kota and gender" variable has
    no single national figure at all). Rather than guess a code, this
    looks for a vervar row explicitly labeled "INDONESIA"; if none
    exists, returns None — a real absence, not a bug (CLAUDE.md rule 1).
    """
    if domain.admin_level == AdminLevel.NATIONAL:
        for row in body.get("vervar", []) or []:
            label = re.sub(r"<[^>]+>", "", str(row.get("label", ""))).strip().upper()
            if label == "INDONESIA":
                return str(row.get("val"))
        return None
    try:
        return str(int(domain.domain_id))
    except (TypeError, ValueError):
        return str(domain.domain_id)


def parse_years_confirmed(body, vervar_val, variable_id):
    """Which periods actually had a non-null datacontent value for the
    given `vervar_val`, decoded from the real BPS `data`-model response
    shape.

    `datacontent` keys are the concatenation of
    `{vervar}{var}{turvar}{th}{turth}` with no separators or fixed-width
    padding (e.g. vervar=1701, var=455, turvar=212, th=124, turth=0 ->
    "17014552121240"). This was decoded from live sample responses, not
    guessed. Since field widths aren't fixed, this matches by trying
    every (turvar, turth) combination actually listed in the response
    against each requested `th`, rather than slicing positions.
    """
    if not isinstance(body, dict) or vervar_val is None:
        return []
    datacontent = body.get("datacontent") or {}
    if not datacontent:
        return []

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


def fetch_th_chunked_responses(client, variable, period_ids, use_cache=True):
    """Fetches `data` responses (always domain=0000 — see module
    docstring) covering every period in `period_ids`, splitting into
    multiple calls if BPS rejects the batch as too large. Starts by
    requesting all periods in one call (cheapest); on BPS's "maximum
    allowed number of years... is N" error, shrinks to N and retries the
    same leftover periods rather than guessing a limit upfront. Returns
    the list of BpsResponse objects actually received.
    """
    responses = []
    remaining = list(period_ids)
    chunk_size = len(remaining) or 1
    while remaining:
        chunk = remaining[:chunk_size]
        resp = client.get(
            "data",
            domain=NATIONAL_DOMAIN_ID,
            var=variable.variable_id,
            th=";".join(chunk),
            use_cache=use_cache,
        )
        if resp.is_error and resp.error_detail:
            match = MAX_TH_ERROR_RE.search(resp.error_detail)
            if match and int(match.group(1)) < chunk_size:
                chunk_size = int(match.group(1))
                continue
        responses.append(resp)
        remaining = remaining[len(chunk):]
    return responses


def upsert_domain_coverage(variable, domain, response_log_pairs):
    """Decodes CONFIRMED/NOT_CONFIRMED/ERROR + years_confirmed for one
    `domain` (national, a province, or a kabupaten/kota) from a shared
    set of (BpsResponse, CoverageCheckLog) pairs already fetched for this
    variable at domain=0000 — no additional HTTP call needed per domain.
    A period is confirmed if any chunk's response confirms it for this
    domain's vervar entry; the record is only ERROR if every chunk
    errored.
    """
    years = []
    best_log = response_log_pairs[-1][1] if response_log_pairs else None
    any_success = False
    any_confirmed = False

    for resp, log in response_log_pairs:
        if resp.is_error:
            continue
        any_success = True
        body = resp.body or {}
        if body.get("data-availability") != "available":
            continue
        vervar_val = resolve_vervar_val(domain, body)
        resp_years = parse_years_confirmed(body, vervar_val, variable.variable_id)
        if resp_years:
            any_confirmed = True
            best_log = log
            for year in resp_years:
                if year not in years:
                    years.append(year)

    if any_confirmed:
        status = CoverageStatus.CONFIRMED
    elif any_success:
        # Either data-availability was never "available", or this
        # domain's vervar entry (or, for national, any "INDONESIA"
        # aggregate row) had no non-null value — a real, evidence-backed
        # absence per CLAUDE.md rule 1, not an assumption.
        status = CoverageStatus.NOT_CONFIRMED
    else:
        status = CoverageStatus.ERROR

    return _apply_coverage_result(variable, domain, status, years, best_log)
