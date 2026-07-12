"""Crawl the DJPK/SIKD APBD portal and upsert regional finance data.

Examples:
  # Full-year realisasi for all provinces, 2022, seed accounts + crosswalk:
  python manage.py ingest_apbd --tahun 2022

  # Budgeted (anggaran) figures instead of realisasi:
  python manage.py ingest_apbd --tahun 2024 --type apbd

  # Documented sample: just Bali + DKI, in-year cutoff June:
  python manage.py ingest_apbd --tahun 2023 --provinces 22,09 --periode 6

  # Re-seed the account catalog / rebuild crosswalk without crawling:
  python manage.py ingest_apbd --seed-only
"""

from django.core.management.base import BaseCommand

from djpk.client import REPORT_TYPES
from djpk.crosswalk import build_crosswalk
from djpk.ingest import ingest
from djpk.seed import seed_accounts


class Command(BaseCommand):
    help = "Crawl the DJPK/SIKD APBD portal and upsert ApbdRegion/Report/Line rows."

    def add_arguments(self, parser):
        parser.add_argument("--tahun", type=int, help="Fiscal year, e.g. 2022.")
        parser.add_argument(
            "--type", default="realisasi", choices=list(REPORT_TYPES),
            help="apbd (anggaran) or realisasi (default).",
        )
        parser.add_argument(
            "--periode", type=int, default=12,
            help="Month cutoff 1..12 (default 12 = full year).",
        )
        parser.add_argument(
            "--provinces", default="",
            help="Comma-separated DJPK province codes to restrict the run "
            "(documented sampling). Default: all.",
        )
        parser.add_argument(
            "--seed-only", action="store_true",
            help="Only (re)seed the account catalog and rebuild the crosswalk; no crawl.",
        )
        parser.add_argument(
            "--no-crosswalk", action="store_true",
            help="Skip the DJPK->Kemendagri crosswalk step after crawling.",
        )

    def handle(self, *args, **opts):
        seeded = seed_accounts()
        self.stdout.write(self.style.SUCCESS(f"Account catalog seeded: {seeded} accounts"))

        if opts["seed_only"]:
            self._crosswalk()
            return

        if not opts["tahun"]:
            self.stdout.write(self.style.ERROR("--tahun is required (or use --seed-only)."))
            return

        provinces = [p.strip() for p in opts["provinces"].split(",") if p.strip()] or None

        def on_progress(name, done, total):
            self.stdout.write(f"  [{done}/{total}] {name}")

        self.stdout.write(
            f"Crawling APBD {opts['type']} {opts['tahun']} "
            f"periode {opts['periode']}"
            + (f" (provinces {provinces})" if provinces else " (all provinces)")
        )
        result = ingest(
            tahun=opts["tahun"],
            report_type=opts["type"],
            periode=opts["periode"],
            provinces=provinces,
            on_progress=on_progress,
        )

        self.stdout.write(self.style.SUCCESS(
            f"Done: {result['reports']}/{result['regions']} reports across "
            f"{len(result['provinces'])} provinces."
        ))
        if result["errors"]:
            self.stdout.write(self.style.WARNING(f"{len(result['errors'])} region(s) failed:"))
            for e in result["errors"]:
                self.stdout.write(f"  ! {e['region']} {e['name']}: {e['error']}")

        if not opts["no_crosswalk"]:
            self._crosswalk()

    def _crosswalk(self):
        cw = build_crosswalk()
        if cw.get("note"):
            self.stdout.write(self.style.WARNING(f"Crosswalk: {cw['note']}"))
            return
        self.stdout.write(self.style.SUCCESS(
            f"Crosswalk (vs dukcapil {cw['period']}): "
            f"{cw['matched']}/{cw['total']} matched, {cw['unmatched']} unmatched."
        ))
        for name in cw["unmatched_names"]:
            self.stdout.write(f"  ? unmatched: {name}")
