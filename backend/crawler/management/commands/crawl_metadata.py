"""Phase 3 (CLAUDE.md) CLI entrypoint — see crawler/metadata.py for the
actual crawl logic, shared with crawler.tasks.run_incremental_crawl_task.
"""

from django.core.management.base import BaseCommand

from crawler.metadata import run_metadata_crawl


class Command(BaseCommand):
    help = "Crawl subject categories, subjects, variables and periods for the national domain."

    def add_arguments(self, parser):
        parser.add_argument(
            "--subcat",
            help="Only crawl this subject_category_id (e.g. for a small scoped validation run).",
        )
        parser.add_argument(
            "--max-subjects",
            type=int,
            default=None,
            help="Resume cursor: how many not-yet-crawled subjects to process this run (default: all).",
        )
        parser.add_argument(
            "--max-variables",
            type=int,
            default=None,
            help="Cap the number of variables fetched per subject processed this run.",
        )
        parser.add_argument(
            "--with-vervar",
            action="store_true",
            help="Also crawl vervar (region-breakdown claims) metadata — slow (~45s/variable); "
            "not needed for coverage confirmation or data ingestion.",
        )

    def handle(self, *args, **options):
        result = run_metadata_crawl(
            subcat=options["subcat"],
            max_subjects=options["max_subjects"],
            max_variables=options["max_variables"],
            crawl_vervar=options["with_vervar"],
            log=self.stdout.write,
        )
        self.stdout.write(
            f"Done. {result['categories']} categories, "
            f"{result['subjects_crawled']}/{result['subjects_discovered']} subjects crawled this run, "
            f"{result['variables']} variables."
        )
