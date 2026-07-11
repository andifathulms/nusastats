"""Re-derive village status/name for Maluku (Negeri/Ohoi + Kota Ambon mix) and
Papua (Kampung / Kampung Adat, stripping the "Desa Adat" name prefix).

Recomputes every village via name_and_status from its current (clean) name +
code; only changed rows are written. Non-affected provinces are unchanged."""
from django.db import migrations


def backfill(apps, schema_editor):
    from dukcapil.normalize import name_and_status

    Region = apps.get_model("dukcapil", "DukcapilRegion")
    batch = []
    for r in Region.objects.filter(level="village").only("id", "code", "name", "status").iterator():
        name, status = name_and_status("village", r.name, r.code)
        if name != r.name or status != r.status:
            r.name, r.status = name, status
            batch.append(r)
        if len(batch) >= 2000:
            Region.objects.bulk_update(batch, ["name", "status"])
            batch = []
    if batch:
        Region.objects.bulk_update(batch, ["name", "status"])


class Migration(migrations.Migration):

    dependencies = [
        ("dukcapil", "0009_village_regional_status"),
    ]

    operations = [
        migrations.RunPython(backfill, migrations.RunPython.noop),
    ]
