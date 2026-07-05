"""Phase 6 (CLAUDE.md): periodic re-crawl of previously-confirmed coverage,
to catch BPS silently adding/removing data. Re-uses the same chunked-fetch
and upsert logic as the initial crawl, so a status flip is recorded as a
CoverageStatusChange rather than a silent overwrite.
"""

from celery import shared_task

from bps_client.client import BpsClient
from bps_client.exceptions import BpsApiError, TooManyConsecutiveFailures
from catalog.models import CoverageRecord, CoverageStatus
from crawler.coverage import fetch_th_chunked_responses, upsert_coverage_record_multi


@shared_task
def recrawl_confirmed_coverage():
    client = BpsClient()
    records = CoverageRecord.objects.filter(status=CoverageStatus.CONFIRMED).select_related(
        "variable", "domain"
    )

    checked = 0
    for record in records:
        period_ids = list(record.variable.periods.values_list("period_id", flat=True))
        if not period_ids:
            continue
        try:
            responses = fetch_th_chunked_responses(
                client, record.domain, record.variable, period_ids, use_cache=False
            )
        except TooManyConsecutiveFailures:
            break
        except BpsApiError:
            continue

        upsert_coverage_record_multi(record.variable, record.domain, responses)
        checked += 1

    return {"checked": checked}
