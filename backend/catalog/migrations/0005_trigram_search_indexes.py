"""Trigram GIN indexes for the ⌘K search's `icontains` lookups.

Django compiles `name__icontains=q` on Postgres to `UPPER(name::text) LIKE
UPPER('%q%')`, so the indexes are on that exact expression — a plain index on
`name` would never be used. Postgres-only (pg_trgm); a no-op on the sqlite
test database. Not declared in model Meta for the same reason.
"""

from django.db import migrations

INDEXES = [
    ("catalog_domain_name_trgm", "catalog_domain", "domain_name"),
    ("catalog_variable_name_trgm", "catalog_variable", "name"),
]


def forwards(apps, schema_editor):
    if schema_editor.connection.vendor != "postgresql":
        return
    schema_editor.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")
    for name, table, column in INDEXES:
        schema_editor.execute(
            f'CREATE INDEX IF NOT EXISTS {name} ON {table} USING gin ((UPPER("{column}"::text)) gin_trgm_ops)'
        )


def backwards(apps, schema_editor):
    if schema_editor.connection.vendor != "postgresql":
        return
    for name, _table, _column in INDEXES:
        schema_editor.execute(f"DROP INDEX IF EXISTS {name}")


class Migration(migrations.Migration):
    dependencies = [("catalog", "0004_variable_stat_admin_levels_variable_stat_data_points_and_more")]
    operations = [migrations.RunPython(forwards, backwards)]
