"""Phase 6 (CLAUDE.md): periodic re-crawl of previously-confirmed coverage,
to catch BPS silently adding/removing data. Re-uses the same chunked-fetch
and decode logic as the initial crawl, so a status flip is recorded as a
CoverageStatusChange rather than a silent overwrite.
"""

from collections import defaultdict

from celery import shared_task

from bps_client.client import BpsClient
from bps_client.exceptions import BpsApiError, TooManyConsecutiveFailures
from catalog.models import CoverageRecord, CoverageStatus
from crawler.coverage import fetch_th_chunked_responses, record_check_log, upsert_domain_coverage


@shared_task
def recrawl_confirmed_coverage():
    client = BpsClient()
    records = CoverageRecord.objects.filter(status=CoverageStatus.CONFIRMED).select_related(
        "variable", "domain"
    )

    # Group by variable: a `data` call is always domain=0000 (see
    # crawler/coverage.py) and decodes every domain at once, so a
    # variable confirmed at several domains needs only one fetch.
    domains_by_variable = defaultdict(list)
    for record in records:
        domains_by_variable[record.variable].append(record.domain)

    checked = 0
    for variable, domains in domains_by_variable.items():
        period_ids = list(variable.periods.values_list("period_id", flat=True))
        if not period_ids:
            continue
        try:
            responses = fetch_th_chunked_responses(client, variable, period_ids, use_cache=False)
        except TooManyConsecutiveFailures:
            break
        except BpsApiError:
            continue

        response_log_pairs = [(resp, record_check_log(resp)) for resp in responses]
        for domain in domains:
            upsert_domain_coverage(variable, domain, response_log_pairs)
            checked += 1

    return {"checked": checked}
