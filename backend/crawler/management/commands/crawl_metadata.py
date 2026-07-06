"""Phase 3 (CLAUDE.md) CLI entrypoint — see crawler/metadata.py for the
actual crawl logic, shared with crawler.tasks.run_incremental_crawl_task.
"""

from django.core.management.base import BaseCommand

from crawler.metadata import run_metadata_crawl


class Command(BaseCommand):
    help = "Crawl subject categories, subjects, variables, vervar and periods for the national domain."

    def add_arguments(self, parser):
        parser.add_argument(
            "--subcat",
            help="Only crawl this subject_category_id (e.g. for a small scoped validation run).",
        )
        parser.add_argument(
            "--max-subjects",
            type=int,
            default=None,
            help="Cap the number of subjects crawled per subject category.",
        )
        parser.add_argument(
            "--max-variables",
            type=int,
            default=None,
            help="Cap the number of variables crawled per subject.",
        )

    def handle(self, *args, **options):
        result = run_metadata_crawl(
            subcat=options["subcat"],
            max_subjects=options["max_subjects"],
            max_variables=options["max_variables"],
            log=self.stdout.write,
        )
        self.stdout.write(
            f"Done. {result['categories']} categories, {result['subjects']} subjects, "
            f"{result['variables']} variables."
        )
