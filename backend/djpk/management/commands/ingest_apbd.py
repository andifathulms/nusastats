"""Crawl the DJPK/SIKD APBD portal and upsert regional finance data.

Examples:
  # Full-year realisasi for all provinces, 2022, seed accounts + crosswalk:
  python manage.py ingest_apbd --tahun 2022

  # Backfill a multi-year time series in one run (range or comma list):
  python manage.py ingest_apbd --tahun 2020-2023
  python manage.py ingest_apbd --tahun 2019,2021,2024

  # Budgeted (anggaran) figures instead of realisasi:
  python manage.py ingest_apbd --tahun 2024 --type apbd

  # Documented sample: just Bali + DKI, in-year cutoff June:
  python manage.py ingest_apbd --tahun 2023 --provinces 22,09 --periode 6

  # Re-seed the account catalog / rebuild crosswalk without crawling:
  python manage.py ingest_apbd --seed-only
"""

from django.core.management.base import BaseCommand, CommandError

from djpk.client import REPORT_TYPES
from djpk.crosswalk import build_crosswalk
from djpk.ingest import ingest
from djpk.seed import seed_accounts


def parse_years(spec):
    """'2024' -> [2024]; '2020-2023' -> [2020,2021,2022,2023]; '2019,2021' ->
    [2019,2021]. Ranges and comma lists may be mixed. Ascending, de-duplicated."""
    years = set()
    for part in str(spec).split(","):
        part = part.strip()
        if not part:
            continue
        if "-" in part:
            lo, hi = part.split("-", 1)
            lo, hi = int(lo), int(hi)
            if lo > hi:
                lo, hi = hi, lo
            years.update(range(lo, hi + 1))
        else:
            years.add(int(part))
    return sorted(years)


class Command(BaseCommand):
    help = "Crawl the DJPK/SIKD APBD portal and upsert ApbdRegion/Report/Line rows."

    def add_arguments(self, parser):
        parser.add_argument(
            "--tahun",
            help="Fiscal year(s): single (2022), range (2020-2023), or comma "
            "list (2019,2021,2024). Crawled oldest-first; crosswalk built once at end.",
        )
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
        try:
            years = parse_years(opts["tahun"])
        except ValueError:
            raise CommandError(f"Could not parse --tahun {opts['tahun']!r}.")
        if not years:
            raise CommandError("--tahun resolved to no years.")

        provinces = [p.strip() for p in opts["provinces"].split(",") if p.strip()] or None

        def on_progress(name, done, total):
            self.stdout.write(f"  [{done}/{total}] {name}")

        if len(years) > 1:
            self.stdout.write(self.style.SUCCESS(f"Backfilling {len(years)} years: {years}"))

        grand_errors = []
        for tahun in years:
            self.stdout.write(
                f"Crawling APBD {opts['type']} {tahun} periode {opts['periode']}"
                + (f" (provinces {provinces})" if provinces else " (all provinces)")
            )
            result = ingest(
                tahun=tahun,
                report_type=opts["type"],
                periode=opts["periode"],
                provinces=provinces,
                on_progress=on_progress,
            )
            self.stdout.write(self.style.SUCCESS(
                f"  {tahun}: {result['reports']}/{result['regions']} reports across "
                f"{len(result['provinces'])} provinces."
            ))
            for e in result["errors"]:
                grand_errors.append({**e, "tahun": tahun})

        if grand_errors:
            self.stdout.write(self.style.WARNING(f"{len(grand_errors)} region-year(s) failed:"))
            for e in grand_errors:
                self.stdout.write(f"  ! {e['tahun']} {e['region']} {e['name']}: {e['error']}")

        # Crosswalk depends only on the region set (shared across years), so
        # build it once after all years are ingested.
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
