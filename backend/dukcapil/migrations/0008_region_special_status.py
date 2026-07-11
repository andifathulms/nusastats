"""Widen `status` and re-derive the special region designations:
province Daerah Istimewa/Khusus, DKI Kota/Kabupaten Administrasi, Papua Distrik
+ Yogyakarta Kapanewon/Kemantren, and collapse the "P A P U A" province name.

Backfill is code-driven and does not touch the raw `attributes`: names are
already clean from 0005/0006 (title_case only re-collapses spaced letters), and
the new statuses follow the wilayah code. Non-DKI Kota/Kabupaten and village
Kelurahan/Desa are preserved as-is; only the code-special cases are overridden.
"""
from django.db import migrations, models


def backfill(apps, schema_editor):
    from dukcapil.normalize import (
        _JKT_KAB, _JKT_KOTA, district_status, province_status, title_case,
    )

    Region = apps.get_model("dukcapil", "DukcapilRegion")
    batch = []
    for r in Region.objects.only("id", "level", "code", "name", "status").iterator():
        name = title_case(r.name)  # re-collapse "P A P U A" -> "Papua"; else no-op
        status = r.status
        if r.level == "province":
            status = province_status(r.code)
        elif r.level == "regency":
            if r.code in _JKT_KOTA:
                status = "Kota Administrasi"
            elif r.code == _JKT_KAB:
                status = "Kabupaten Administrasi"
            # else keep existing Kota / Kabupaten (name prefix already stripped)
        elif r.level == "district":
            status = district_status(r.code)
        # village: leave Kelurahan / Desa untouched
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
        ("dukcapil", "0007_dukcapilregion_luas_big"),
    ]

    operations = [
        migrations.AlterField(
            model_name="dukcapilregion",
            name="status",
            field=models.CharField(blank=True, max_length=64),
        ),
        migrations.RunPython(backfill, migrations.RunPython.noop),
    ]
