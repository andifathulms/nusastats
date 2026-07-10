from django.core.management.base import BaseCommand

from dukcapil.seed import seed_indicators


class Command(BaseCommand):
    help = "Seed/refresh the DukcapilIndicator catalog from dukcapil/indicators.py."

    def handle(self, *args, **options):
        result = seed_indicators()
        self.stdout.write(
            f"Indicators seeded: {result['seeded']} (removed {result['removed']} stale)."
        )
