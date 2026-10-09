"""Re-decode DataPoints from the BPS responses already stored in
CoverageCheckLog, with no BPS call. Run it after `add_vervar_domains` so the
values BPS publishes under the 2022 Papua codes get stored. Idempotent (upserts
on the DataPoint natural key); prints how many old-code twins were superseded.
"""

from django.core.management.base import BaseCommand

from stats.ingest import reingest_from_logs


class Command(BaseCommand):
    help = "Re-decode confirmed variables from stored CoverageCheckLog responses (no BPS calls)."

    def add_arguments(self, parser):
        parser.add_argument("--var", action="append", help="BPS variable id (repeatable). Default: all confirmed.")

    def handle(self, *args, var=None, **options):
        def on_variable_done(variable, count):
            self.stdout.write(f"  var={variable.variable_id}: {count} data points")

        report = reingest_from_logs(variable_ids=var, on_variable_done=on_variable_done)
        if report["no_logs"]:
            self.stderr.write(
                f"{len(report['no_logs'])} confirmed variable(s) have no stored data response: "
                + ", ".join(report["no_logs"][:50])
            )
        self.stdout.write(
            f"Done. {report['data_points']} data points across {report['variables']} variable(s); "
            f"{report['superseded']} old-code Papua twin(s) superseded."
        )
