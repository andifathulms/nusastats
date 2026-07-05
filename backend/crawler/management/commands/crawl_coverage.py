"""Phase 4 (CLAUDE.md): Coverage Confirmation Crawler.

For each Variable, issues real `data` calls at national (always), a fixed
documented sample of provinces, and a fixed documented sample of
kabupaten/kota within those provinces (PRD §5.3, CLAUDE.md rule 4). The
sample is computed once via crawler.sampling.get_sample_domains() and
logged explicitly so it can be reproduced in the Phase 5 report.

Hard-stops (does not swallow) on TooManyConsecutiveFailures per CLAUDE.md
rule 5, rather than continuing to hammer the API.
"""

from django.core.management.base import BaseCommand

from bps_client.client import BpsClient
from bps_client.exceptions import BpsApiError, TooManyConsecutiveFailures
from catalog.models import Variable
from crawler.coverage import fetch_th_chunked_responses, upsert_coverage_record_multi
from crawler.sampling import flatten_sample_domains, get_sample_domains


class Command(BaseCommand):
    help = "Confirm coverage for every known Variable at the sampled domains."

    def handle(self, *args, **options):
        sample = get_sample_domains()
        if not sample["national"]:
            self.stderr.write("No national domain found — run crawl_domains first.")
            return

        domains = flatten_sample_domains(sample)
        self.stdout.write(
            "Sampled domains ({} total): national={}, provinces={}, kabupaten={}".format(
                len(domains),
                sample["national"].domain_id,
                [p.domain_id for p in sample["provinces"]],
                {
                    prov_id: [k.domain_id for k in kabs]
                    for prov_id, kabs in sample["kabupaten_by_province"].items()
                },
            )
        )

        variables = list(Variable.objects.select_related("subject", "domain").prefetch_related("periods"))
        if not variables:
            self.stderr.write("No variables found — run crawl_metadata first.")
            return

        client = BpsClient()
        checked = 0
        for variable in variables:
            # `th` is a mandatory param on real `data` calls (confirmed
            # live — omitting it is an application error, not optional).
            # Check every period crawl_metadata found for this variable,
            # using BPS's documented `;`-separated multi-value syntax —
            # chunked across calls if BPS rejects the batch as too large
            # (the max varies by request, see crawler.coverage).
            period_ids = list(variable.periods.values_list("period_id", flat=True))
            if not period_ids:
                self.stderr.write(
                    f"Skipping var={variable.variable_id}: no known periods "
                    "(run crawl_metadata first)."
                )
                continue

            for domain in domains:
                try:
                    responses = fetch_th_chunked_responses(client, domain, variable, period_ids)
                except TooManyConsecutiveFailures as exc:
                    self.stderr.write(f"Hard stop: {exc}")
                    self.stdout.write(f"Checked {checked} (variable, domain) pairs before stopping.")
                    return
                except BpsApiError as exc:
                    self.stderr.write(
                        f"Request failed for var={variable.variable_id} domain={domain.domain_id}: {exc}"
                    )
                    continue

                record = upsert_coverage_record_multi(variable, domain, responses)
                checked += 1
                self.stdout.write(
                    f"  var={variable.variable_id} domain={domain.domain_id} -> {record.status}"
                    f" ({len(responses)} call(s))"
                )

        self.stdout.write(f"Done. Checked {checked} (variable, domain) pairs.")
