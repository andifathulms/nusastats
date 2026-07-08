"""Recompute the denormalized per-variable data-availability figures (see
stats.aggregates). Run after a bulk data load; ingest_confirmed_data also
calls this automatically at the end of a run."""

from django.core.management.base import BaseCommand

from stats.aggregates import refresh_variable_stats


class Command(BaseCommand):
    help = "Refresh denormalized data-availability stats on every Variable."

    def handle(self, *args, **options):
        count = refresh_variable_stats()
        self.stdout.write(f"Refreshed stats for {count} variable(s) with data.")
