"""Phase 4 (CLAUDE.md) CLI entrypoint — see crawler/coverage.py's
run_coverage_crawl for the actual crawl logic, shared with
crawler.tasks.run_incremental_crawl_task.
"""

from django.core.management.base import BaseCommand

from crawler.coverage import run_coverage_crawl


class Command(BaseCommand):
    help = "Confirm coverage for every known Variable at the sampled domains."

    def handle(self, *args, **options):
        result = run_coverage_crawl(log=self.stdout.write)
        self.stdout.write(
            f"Done. Checked {result['checked']} (variable, domain) pairs "
            f"across {result['variables']} variable(s)."
        )
