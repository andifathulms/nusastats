from django.core.management.base import BaseCommand

from peta.ingest import DEFAULT_PATH, load_export


class Command(BaseCommand):
    help = "Load Peta Wilayah terrain/land cover indicators from peta/data/peta_export.json (idempotent)."

    def add_arguments(self, parser):
        parser.add_argument("--path", default=str(DEFAULT_PATH))

    def handle(self, *args, **opts):
        log = load_export(opts["path"])
        self.stdout.write(self.style.SUCCESS(
            f"load_peta: {log.areas} areas, {log.values} values (export sha256 {log.export_sha256[:12]})"))
