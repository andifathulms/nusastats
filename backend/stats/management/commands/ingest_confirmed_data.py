"""Fetches and stores real statistical values for every Variable Cakupan
has confirmed as available (catalog.CoverageRecord.status == confirmed at
any domain) — never a variable that hasn't been confirmed.

Reuses Cakupan's crawl machinery (BpsClient rate limiting/backoff,
fetch_th_chunked_responses' adaptive th-chunking, one domain=0000 call
per variable) rather than crawling BPS a second time with different
logic. Since that single call already returns the full regional
breakdown, this naturally stores national + every province + every
kabupaten/kota's values, not just Cakupan's confirmation sample.
"""

from django.core.management.base import BaseCommand

from stats.ingest import ingest_all_confirmed


class Command(BaseCommand):
    help = "Ingest real data points for every Variable confirmed available by Cakupan's coverage crawl."

    def handle(self, *args, **options):
        def on_variable_done(variable, count):
            self.stdout.write(f"  var={variable.variable_id}: {count} data points")

        result = ingest_all_confirmed(on_variable_done=on_variable_done)

        if result["hard_stopped"]:
            self.stderr.write("Hard stop: too many consecutive BPS failures.")

        if result["variables"] == 0 and not result["hard_stopped"]:
            self.stderr.write("No confirmed variables with known periods found — run crawl_coverage first.")
            return

        self.stdout.write(
            f"Done. Ingested {result['data_points']} data points across {result['variables']} variable(s)."
        )
