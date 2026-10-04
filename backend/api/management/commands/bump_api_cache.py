from django.core.management.base import BaseCommand, CommandError

from api.caching import SOURCES, bump_data_version


class Command(BaseCommand):
    help = (
        "Invalidate the read-API response cache for one or more sources "
        f"({', '.join(SOURCES)}; default: all). Ingests do this automatically; "
        "use it after editing data by hand (admin, shell, SQL)."
    )

    def add_arguments(self, parser):
        parser.add_argument("sources", nargs="*", metavar="source")

    def handle(self, *args, **options):
        sources = options["sources"] or list(SOURCES)
        unknown = set(sources) - set(SOURCES)
        if unknown:
            raise CommandError(f"Unknown source(s): {', '.join(sorted(unknown))}")
        bump_data_version(*sources)
        self.stdout.write(self.style.SUCCESS(f"API cache invalidated for: {', '.join(sources)}"))
