"""Turns real BPS `data` responses (fetched via Cakupan's coverage-crawl
machinery — crawler.coverage.fetch_th_chunked_responses) into DataPoint
rows.

This module never decides *whether* to fetch a variable — that's
catalog.CoverageRecord's job (Cakupan). It only decodes values out of
responses the caller already has, for variables Cakupan has confirmed.

Architecture note (see crawler/coverage.py for the full story, confirmed
live): a `data` call scoped to domain=0000 returns the FULL regional
breakdown for a variable — every province and kabupaten/kota's value in
one response, keyed by each region's own vervar id. So decoding every
vervar row in one response set naturally yields national + every
province + every kabupaten/kota's data points, not just a sample —
exactly what "store it for each regency and province" needs, from the
same calls Cakupan's coverage crawl already made.
"""

from django.db.models import Q
from django.utils import timezone

from bps_client.client import BpsClient, BpsResponse
from bps_client.exceptions import BpsApiError, TooManyConsecutiveFailures
from catalog.models import AdminLevel, CoverageCheckLog, CoverageRecord, CoverageStatus, Domain, Variable
from crawler.coverage import _as_int, _clean_label, fetch_th_chunked_responses, known_domain_ints, record_check_log

from .models import DataPoint


def _drop_superseded(to_upsert):
    """The 2022 Papua split (crawler.vervar_domains): some responses carry a
    kabupaten under both its pre-2022 code and its new code for the same
    period, sometimes with different values (var 464, 2025: Yahukimo 9416 = 5,
    9707 = 0). Keep the new code, the one BPS now publishes under, and drop the
    old-code twin. Removes those keys from `to_upsert` in place and returns
    them, so stale rows from earlier ingests can be deleted too."""
    successor_of = dict(
        Domain.objects.filter(predecessor__isnull=False).values_list("predecessor_id", "id")
    )
    if not successor_of:
        return []
    present = {(dom, per, tv) for dom, per, _vv, tv in to_upsert}
    superseded = [
        key for key in to_upsert
        if key[0] in successor_of and (successor_of[key[0]], key[1], key[3]) in present
    ]
    for key in superseded:
        del to_upsert[key]
    return superseded


def ingest_from_responses(variable, response_log_pairs, report=None):
    """Decodes every (domain, period, vervar, turvar) data point present
    across `response_log_pairs` for `variable` and upserts them as
    DataPoint rows. Idempotent: re-ingesting the same responses updates
    existing rows (keyed on variable/domain/period/vervar_id/turvar_id)
    rather than duplicating them. Returns the number of data points
    written.

    vervar_id/vervar_label are always stored, not just when non-geographic
    (see DataPoint model docstring): for a geographic variable this is
    redundant with `domain`, but for a non-geographic one (commodity
    group, urban/rural — confirmed live) it's the only thing that
    distinguishes e.g. a poverty line's Kota/Desa/Kota+Desa values, which
    would otherwise collide on the same (domain=national, turvar) key and
    silently overwrite each other.
    """
    domains_by_vervar_val = {}
    national_domain = None
    for domain in Domain.objects.all():
        if domain.admin_level == AdminLevel.NATIONAL:
            national_domain = domain
        try:
            domains_by_vervar_val[str(int(domain.domain_id))] = domain
        except (TypeError, ValueError):
            continue
    geographic_ints = known_domain_ints()

    periods_by_th_id = {p.period_id: p for p in variable.periods.all()}

    now = timezone.now()
    to_upsert = {}

    for resp, log in response_log_pairs:
        if resp.is_error:
            continue
        body = resp.body or {}
        if body.get("data-availability") != "available":
            continue
        datacontent = body.get("datacontent") or {}
        if not datacontent:
            continue

        vervar_rows = body.get("vervar") or []
        turvar_rows = body.get("turvar") or [{"val": 0, "label": ""}]
        turth_rows = body.get("turtahun") or [{"val": 0, "label": ""}]
        tahun_rows = body.get("tahun") or []

        # Confirmed live: not every variable's vervar dimension is
        # geographic — some use it for a commodity-group or urban/rural
        # classification instead (see crawler.coverage.resolve_vervar_vals
        # for the full story). When it isn't, the whole dataset is
        # implicitly national: every vervar row belongs to national_domain
        # rather than being matched against a region code or an
        # "INDONESIA" label.
        is_geographic = any(_as_int(row.get("val")) in geographic_ints for row in vervar_rows)

        indonesia_vervar_val = None
        if is_geographic:
            for row in vervar_rows:
                if _clean_label(row.get("label")).upper() == "INDONESIA":
                    indonesia_vervar_val = str(row.get("val"))
                    break

        for vervar_row in vervar_rows:
            vervar_val = str(vervar_row.get("val"))
            if not is_geographic:
                domain = national_domain
            elif vervar_val == indonesia_vervar_val:
                domain = national_domain
            else:
                domain = domains_by_vervar_val.get(vervar_val)
            if domain is None:
                # BPS knows about this region/aggregate but crawl_domains
                # hasn't recorded it yet — skip rather than guess a Domain.
                continue

            for turvar_row in turvar_rows:
                turvar_val = str(turvar_row.get("val"))
                turvar_label = turvar_row.get("label", "")

                for th_row in tahun_rows:
                    th_val = str(th_row.get("val"))
                    period = periods_by_th_id.get(th_val)
                    if period is None:
                        continue

                    for turth_row in turth_rows:
                        turth_val = str(turth_row.get("val"))
                        key = f"{vervar_val}{variable.variable_id}{turvar_val}{th_val}{turth_val}"
                        value = datacontent.get(key)
                        if value in (None, "", "-"):
                            continue

                        to_upsert[(domain.id, period.id, vervar_val, turvar_val)] = DataPoint(
                            variable=variable,
                            domain=domain,
                            period=period,
                            admin_level=domain.admin_level,
                            year=period.year,
                            vervar_id=vervar_val,
                            vervar_label=_clean_label(vervar_row.get("label")),
                            turvar_id=turvar_val,
                            turvar_label=turvar_label,
                            value=value,
                            source_check_log=log,
                            fetched_at=now,
                        )

    superseded = _drop_superseded(to_upsert)
    if report is not None:
        report["superseded"] = report.get("superseded", 0) + len(superseded)
    if superseded:
        q = Q()
        for domain_id, period_id, vervar_val, turvar_val in superseded:
            q |= Q(domain_id=domain_id, period_id=period_id, vervar_id=vervar_val, turvar_id=turvar_val)
        DataPoint.objects.filter(q, variable=variable).delete()

    points = list(to_upsert.values())
    if points:
        DataPoint.objects.bulk_create(
            points,
            update_conflicts=True,
            unique_fields=["variable", "domain", "period", "vervar_id", "turvar_id"],
            update_fields=[
                "value",
                "vervar_label",
                "turvar_label",
                "admin_level",
                "year",
                "source_check_log",
                "fetched_at",
            ],
        )
    return len(points)


def reingest_from_logs(variable_ids=None, on_variable_done=None):
    """Re-decode every confirmed variable from the responses already stored in
    CoverageCheckLog: no BPS call and no new log rows. Each DataPoint keeps
    pointing at the stored log it was decoded from. Used after new Domain rows
    appear (crawler.vervar_domains), so values that were skipped for lack of a
    domain get stored. `variable_ids` limits it to some BPS variable ids."""
    from crawler.stored import latest_data_log_ids

    confirmed = (
        CoverageRecord.objects.filter(status=CoverageStatus.CONFIRMED).values_list("variable_id", flat=True).distinct()
    )
    variables = Variable.objects.filter(id__in=confirmed).prefetch_related("periods")
    if variable_ids:
        variables = variables.filter(variable_id__in=[str(v) for v in variable_ids])
    logs_by_var = latest_data_log_ids()

    report = {"data_points": 0, "variables": 0, "superseded": 0, "no_logs": []}
    for variable in variables:
        log_ids = logs_by_var.get(variable.variable_id, [])
        if not log_ids:
            report["no_logs"].append(variable.variable_id)
            continue
        pairs = [
            (BpsResponse(log.url, log.http_status, log.raw_body, log.response_hash, log.is_error, log.error_detail), log)
            for log in CoverageCheckLog.objects.filter(id__in=log_ids).order_by("id")
        ]
        count = ingest_from_responses(variable, pairs, report=report)
        report["data_points"] += count
        report["variables"] += 1
        if on_variable_done:
            on_variable_done(variable, count)

    from .aggregates import refresh_variable_stats

    refresh_variable_stats()
    return report


def ingest_all_confirmed(client=None, use_cache=True, on_variable_done=None):
    """Fetches and ingests real data points for every Variable Cakupan
    has confirmed as available. Shared by ingest_confirmed_data (the
    management command, for on-demand/first runs) and
    stats.tasks.ingest_confirmed_data_task (the Phase 6 periodic re-run),
    so both stay behind the same logic. `on_variable_done(variable,
    count)` is called after each variable, e.g. for command-line progress
    output; hard-stops (does not swallow) on TooManyConsecutiveFailures
    per CLAUDE.md rule 5.
    """
    client = client or BpsClient()

    variable_ids = (
        CoverageRecord.objects.filter(status=CoverageStatus.CONFIRMED)
        .values_list("variable_id", flat=True)
        .distinct()
    )
    variables = Variable.objects.filter(id__in=variable_ids).prefetch_related("periods")

    total_points = 0
    variables_processed = 0
    hard_stopped = False
    for variable in variables:
        period_ids = list(variable.periods.values_list("period_id", flat=True))
        if not period_ids:
            continue
        try:
            responses = fetch_th_chunked_responses(client, variable, period_ids, use_cache=use_cache)
        except TooManyConsecutiveFailures:
            hard_stopped = True
            break
        except BpsApiError:
            continue

        response_log_pairs = [(resp, record_check_log(resp)) for resp in responses]
        count = ingest_from_responses(variable, response_log_pairs)
        total_points += count
        variables_processed += 1
        if on_variable_done:
            on_variable_done(variable, count)

    # Keep the denormalized browse/filter figures in sync with what was
    # just ingested (see stats.aggregates).
    from .aggregates import refresh_variable_stats

    refresh_variable_stats()

    return {"data_points": total_points, "variables": variables_processed, "hard_stopped": hard_stopped}
