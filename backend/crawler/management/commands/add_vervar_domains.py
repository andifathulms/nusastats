"""Create the 2022 Papua provinces and their kabupaten/kota as Domain rows,
from the stored BPS `data` responses that name them (see
crawler.vervar_domains). No BPS call. Idempotent: re-running updates the same
rows. Prints every planned row, every unmatched code and every other unknown
code, then applies unless --dry-run.

Run `reingest_from_logs` afterwards so the stored responses are decoded
against the new domains.
"""

from django.core.management.base import BaseCommand

from crawler import vervar_domains


class Command(BaseCommand):
    help = "Add BPS domains that appear only in data-response vervar codes (2022 Papua split)."

    def add_arguments(self, parser):
        parser.add_argument("--dry-run", action="store_true", help="Print the plan, write nothing.")

    def handle(self, *args, dry_run=False, **options):
        plan = vervar_domains.discover()
        for item in plan["create"]:
            rel = f" parent={item['parent']}" if item["parent"] else ""
            pred = f" predecessor={item['predecessor']}" if item["predecessor"] else ""
            self.stdout.write(
                f"  {item['domain_id']} {item['domain_name']!r} [{item['admin_level']}]{rel}{pred}"
                f" log=#{item['source_check_log_id']} labels={item['labels']}"
            )
        for item in plan["unmatched"]:
            self.stderr.write(f"  UNMATCHED {item['domain_id']} {item['labels']}: {item['reason']}")
        if plan["other_unknown"]:
            listed = ", ".join(f"{c} {lbl!r}" for c, lbl in plan["other_unknown"].items())
            self.stdout.write(f"Other unknown vervar codes, not created (out of scope): {listed}")
        self.stdout.write(f"Planned {len(plan['create'])} domain(s), {len(plan['unmatched'])} unmatched.")
        if dry_run:
            return

        written = vervar_domains.apply(plan)
        from api.caching import bump_data_version

        bump_data_version("bps")
        self.stdout.write(f"Wrote {written} domain(s).")
