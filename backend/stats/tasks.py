"""Phase 6 (CLAUDE.md): periodic re-ingestion of real data points for
every Variable Cakupan has confirmed, so DataPoint stays in sync when a
variable gains new confirmed years or newly becomes confirmed. Mirrors
crawler.tasks.recrawl_confirmed_coverage — scheduled to run after it (see
setup_periodic_tasks) so ingestion sees that run's freshly-updated
confirmations.
"""

from celery import shared_task

from .ingest import ingest_all_confirmed


@shared_task
def ingest_confirmed_data_task():
    return ingest_all_confirmed(use_cache=False)
