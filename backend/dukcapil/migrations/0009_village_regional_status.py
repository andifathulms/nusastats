"""Re-derive village status for the regional naming conventions: Aceh Gampong
(Kute in Aceh Tenggara) and Sumatera Barat Nagari. Code-driven; only villages
whose designation changes are written."""
from django.db import migrations


def backfill(apps, schema_editor):
    from dukcapil.normalize import village_status

    Region = apps.get_model("dukcapil", "DukcapilRegion")
    batch = []
    for r in Region.objects.filter(level="village").only("id", "code", "status").iterator():
        status = village_status(r.code)
        if status and status != r.status:
            r.status = status
            batch.append(r)
        if len(batch) >= 2000:
            Region.objects.bulk_update(batch, ["status"])
            batch = []
    if batch:
        Region.objects.bulk_update(batch, ["status"])


class Migration(migrations.Migration):

    dependencies = [
        ("dukcapil", "0008_region_special_status"),
    ]

    operations = [
        migrations.RunPython(backfill, migrations.RunPython.noop),
    ]
