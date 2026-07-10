from django.db import migrations


def backfill_village_status(apps, schema_editor):
    """Derive Kelurahan/Desa for village rows from the 7th digit of the
    10-digit code (1=Kelurahan, 2=Desa)."""
    from dukcapil.normalize import village_status

    Region = apps.get_model("dukcapil", "DukcapilRegion")
    batch = []
    for r in Region.objects.filter(level="village").only("id", "code").iterator():
        s = village_status(r.code)
        if s:
            r.status = s
            batch.append(r)
        if len(batch) >= 2000:
            Region.objects.bulk_update(batch, ["status"])
            batch = []
    if batch:
        Region.objects.bulk_update(batch, ["status"])


class Migration(migrations.Migration):

    dependencies = [
        ("dukcapil", "0005_dukcapilregion_status"),
    ]

    operations = [
        migrations.RunPython(backfill_village_status, migrations.RunPython.noop),
    ]
