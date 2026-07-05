"""Phase 5 (CLAUDE.md): mandatory validation-gate deliverable. Generates
the coverage report (Markdown + JSON) from whatever is currently in the
catalog. Run this only after a real crawl (crawl_domains, crawl_metadata,
crawl_coverage, and optionally crawl_simdasi) so its numbers are backed by
real evidence — never run this against an empty/scaffold database and
present the output as if it were a completed crawl.
"""

import json
from pathlib import Path

from django.core.management.base import BaseCommand

from crawler.report import build_report, render_markdown


class Command(BaseCommand):
    help = "Generate the coverage report (Markdown + JSON) from the current catalog state."

    def add_arguments(self, parser):
        parser.add_argument(
            "--out-dir",
            default="reports",
            help="Directory (relative to backend/) to write coverage_report.md/.json into.",
        )

    def handle(self, *args, **options):
        report = build_report()

        out_dir = Path(options["out_dir"])
        out_dir.mkdir(parents=True, exist_ok=True)

        json_path = out_dir / "coverage_report.json"
        md_path = out_dir / "coverage_report.md"

        json_path.write_text(json.dumps(report, indent=2, default=str))
        md_path.write_text(render_markdown(report))

        self.stdout.write(f"Wrote {json_path} and {md_path}")
        self.stdout.write(render_markdown(report))
