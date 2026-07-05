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

from bps_client.client import BpsClient
from bps_client.exceptions import BpsApiError, TooManyConsecutiveFailures
from catalog.models import CoverageRecord, CoverageStatus, Variable
from crawler.coverage import fetch_th_chunked_responses, record_check_log
from stats.ingest import ingest_from_responses


class Command(BaseCommand):
    help = "Ingest real data points for every Variable confirmed available by Cakupan's coverage crawl."

    def handle(self, *args, **options):
        variable_ids = (
            CoverageRecord.objects.filter(status=CoverageStatus.CONFIRMED)
            .values_list("variable_id", flat=True)
            .distinct()
        )
        variables = Variable.objects.filter(id__in=variable_ids).prefetch_related("periods")
        if not variables:
            self.stderr.write("No confirmed variables found — run crawl_coverage first.")
            return

        client = BpsClient()
        total_points = 0
        for variable in variables:
            period_ids = list(variable.periods.values_list("period_id", flat=True))
            if not period_ids:
                continue
            try:
                responses = fetch_th_chunked_responses(client, variable, period_ids)
            except TooManyConsecutiveFailures as exc:
                self.stderr.write(f"Hard stop: {exc}")
                self.stdout.write(f"Ingested {total_points} data points before stopping.")
                return
            except BpsApiError as exc:
                self.stderr.write(f"Request failed for var={variable.variable_id}: {exc}")
                continue

            response_log_pairs = [(resp, record_check_log(resp)) for resp in responses]
            count = ingest_from_responses(variable, response_log_pairs)
            total_points += count
            self.stdout.write(f"  var={variable.variable_id}: {count} data points")

        self.stdout.write(f"Done. Ingested {total_points} data points across {len(variables)} variable(s).")
