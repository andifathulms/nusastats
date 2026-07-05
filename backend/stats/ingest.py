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

import re

from django.utils import timezone

from catalog.models import AdminLevel, Domain

from .models import DataPoint


def _clean_label(label):
    return re.sub(r"<[^>]+>", "", str(label or "")).strip()


def ingest_from_responses(variable, response_log_pairs):
    """Decodes every (domain, period, turvar) data point present across
    `response_log_pairs` for `variable` and upserts them as DataPoint
    rows. Idempotent: re-ingesting the same responses updates existing
    rows (keyed on variable/domain/period/turvar_id) rather than
    duplicating them. Returns the number of data points written.
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

        indonesia_vervar_val = None
        for row in vervar_rows:
            if _clean_label(row.get("label")).upper() == "INDONESIA":
                indonesia_vervar_val = str(row.get("val"))
                break

        for vervar_row in vervar_rows:
            vervar_val = str(vervar_row.get("val"))
            if vervar_val == indonesia_vervar_val:
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

                        to_upsert[(domain.id, period.id, turvar_val)] = DataPoint(
                            variable=variable,
                            domain=domain,
                            period=period,
                            admin_level=domain.admin_level,
                            year=period.year,
                            turvar_id=turvar_val,
                            turvar_label=turvar_label,
                            value=value,
                            source_check_log=log,
                            fetched_at=now,
                        )

    points = list(to_upsert.values())
    if points:
        DataPoint.objects.bulk_create(
            points,
            update_conflicts=True,
            unique_fields=["variable", "domain", "period", "turvar_id"],
            update_fields=["value", "turvar_label", "admin_level", "year", "source_check_log", "fetched_at"],
        )
    return len(points)
