"""Phase 6 (CLAUDE.md): periodic re-crawl of previously-confirmed coverage,
to catch BPS silently adding/removing data. Re-uses the same
upsert_coverage_record logic as the initial crawl, so a status flip is
recorded as a CoverageStatusChange rather than a silent overwrite.
"""

from celery import shared_task

from bps_client.client import BpsClient
from bps_client.exceptions import BpsApiError, TooManyConsecutiveFailures
from catalog.models import CoverageRecord, CoverageStatus
from crawler.coverage import upsert_coverage_record


@shared_task
def recrawl_confirmed_coverage():
    client = BpsClient()
    records = CoverageRecord.objects.filter(status=CoverageStatus.CONFIRMED).select_related(
        "variable", "domain"
    )

    checked = 0
    for record in records:
        try:
            resp = client.get(
                "data", domain=record.domain.domain_id, var=record.variable.variable_id, use_cache=False
            )
        except TooManyConsecutiveFailures:
            break
        except BpsApiError:
            continue

        upsert_coverage_record(record.variable, record.domain, resp)
        checked += 1

    return {"checked": checked}
