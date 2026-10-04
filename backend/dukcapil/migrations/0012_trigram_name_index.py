"""Trigram GIN index on DukcapilRegion names for the ⌘K search (kecamatan +
desa, ~180k rows across periods). See catalog 0005 for why the index is on
UPPER(name). Postgres-only; a no-op on sqlite."""

from django.db import migrations


def forwards(apps, schema_editor):
    if schema_editor.connection.vendor != "postgresql":
        return
    schema_editor.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")
    schema_editor.execute(
        "CREATE INDEX IF NOT EXISTS dukcapil_region_name_trgm ON dukcapil_dukcapilregion "
        'USING gin ((UPPER("name"::text)) gin_trgm_ops)'
    )


def backwards(apps, schema_editor):
    if schema_editor.connection.vendor != "postgresql":
        return
    schema_editor.execute("DROP INDEX IF EXISTS dukcapil_region_name_trgm")


class Migration(migrations.Migration):
    dependencies = [("dukcapil", "0011_dedup_duplicate_villages"), ("catalog", "0005_trigram_search_indexes")]
    operations = [migrations.RunPython(forwards, backwards)]
