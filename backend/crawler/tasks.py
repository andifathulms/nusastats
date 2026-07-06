"""Phase 6 (CLAUDE.md): periodic re-crawl of previously-confirmed coverage,
to catch BPS silently adding/removing data. Re-uses the same chunked-fetch
and decode logic as the initial crawl, so a status flip is recorded as a
CoverageStatusChange rather than a silent overwrite.
"""

from collections import defaultdict

from celery import shared_task
from django.utils import timezone

from bps_client.client import BpsClient
from bps_client.exceptions import BpsApiError, TooManyConsecutiveFailures
from catalog.models import CoverageRecord, CoverageStatus
from crawler.coverage import fetch_th_chunked_responses, record_check_log, run_coverage_crawl, upsert_domain_coverage
from crawler.metadata import run_metadata_crawl
from crawler.models import CrawlRun, CrawlRunStatus


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


@shared_task
def run_incremental_crawl_task(
    crawl_run_id, subcat=None, max_subjects=None, max_variables=None, crawl_vervar=False
):
    """Admin on-demand equivalent of the weekly schedule, run in one pass:
    discover more metadata -> confirm coverage -> ingest real data points.
    Backs the staff-only "populate my DB now" button (crawler/views.py) —
    runs in Celery so the triggering HTTP request never blocks on what
    can be hundreds of rate-limited BPS calls.
    """
    from stats.ingest import ingest_all_confirmed

    run = CrawlRun.objects.get(id=crawl_run_id)
    run.status = CrawlRunStatus.RUNNING
    run.save(update_fields=["status"])

    log_lines = []

    def log(msg):
        log_lines.append(msg)

    try:
        metadata_result = run_metadata_crawl(
            subcat=subcat,
            max_subjects=max_subjects,
            max_variables=max_variables,
            crawl_vervar=crawl_vervar,
            log=log,
        )
        coverage_result = run_coverage_crawl(log=log)
        ingest_result = ingest_all_confirmed(on_variable_done=lambda v, c: log(f"  var={v.variable_id}: {c} points"))

        run.status = CrawlRunStatus.DONE
        run.result = {
            "metadata": metadata_result,
            "coverage": coverage_result,
            "ingest": ingest_result,
            "log": log_lines,
        }
    except Exception as exc:  # noqa: BLE001 — surface any failure to the admin UI, don't lose it silently
        run.status = CrawlRunStatus.ERROR
        run.error_detail = str(exc)
        run.result = {"log": log_lines}
        raise
    finally:
        run.finished_at = timezone.now()
        run.save(update_fields=["status", "result", "error_detail", "finished_at"])

    return run.result
