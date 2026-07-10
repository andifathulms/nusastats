from django.core.management.base import BaseCommand, CommandError

from dukcapil.client import SERVICES
from dukcapil.ingest import ingest

# Friendly CLI aliases for the four levels.
ALIASES = {
    "PROP": "province", "PROVINCE": "province",
    "KAB": "regency", "REGENCY": "regency",
    "KEC": "district", "DISTRICT": "district",
    "KEL": "village", "VILLAGE": "village",
}
ORDER = ["province", "regency", "district", "village"]


class Command(BaseCommand):
    help = "Crawl the Kemendagri/Dukcapil ArcGIS API and upsert region data."

    def add_arguments(self, parser):
        parser.add_argument(
            "--level",
            default="all",
            help="PROP|KAB|KEC|KEL (or province|regency|district|village), or 'all'.",
        )
        parser.add_argument(
            "--period",
            default=None,
            help="Snapshot month 'YYYY-MM' (default: current month). Each period is kept "
            "separately to build a monthly time series.",
        )

    def handle(self, *args, **options):
        raw = options["level"].strip()
        if raw.lower() == "all":
            levels = list(ORDER)
        else:
            key = raw.upper()
            if key not in ALIASES and raw.lower() not in SERVICES:
                raise CommandError(f"Unknown level {raw!r}. Use PROP|KAB|KEC|KEL or 'all'.")
            levels = [ALIASES.get(key, raw.lower())]

        def on_page(level, total):
            self.stdout.write(f"  {level}: {total} rows...")

        self.stdout.write(f"Ingesting levels: {', '.join(levels)}")
        result = ingest(levels, period=options["period"], on_page=on_page)
        self.stdout.write(self.style.SUCCESS(f"Period: {result['period']}"))
        for level, count in result["counts"].items():
            self.stdout.write(self.style.SUCCESS(f"{level}: {count} regions"))
        self.stdout.write(f"Parent links resolved: {result['relinked']}")
