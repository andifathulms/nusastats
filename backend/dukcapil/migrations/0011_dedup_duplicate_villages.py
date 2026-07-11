"""Remove the exact-duplicate village rows the source returned twice (identical
kode_desa_spatial + data, different objectid). Ingest kept the second copy as an
`<code>-<objectid>` row; those inflate village counts and double-count ~97k
people. A suffixed village row is a duplicate iff its base code (before the "-")
exists as a clean row — those are deleted, keeping the clean copy. Genuinely
dirty suffixed rows (no clean base, e.g. "vil-<oid>") are left untouched.

Ingest is fixed in the same change to dedup on kode_desa_spatial, so re-crawls
won't recreate these."""
from django.db import migrations


def dedup(apps, schema_editor):
    Region = apps.get_model("dukcapil", "DukcapilRegion")
    clean = set(
        Region.objects.filter(level="village")
        .exclude(code__contains="-")
        .values_list("code", flat=True)
    )
    to_delete = [
        pk
        for pk, code in Region.objects.filter(level="village", code__contains="-").values_list("id", "code")
        if code.split("-")[0] in clean
    ]
    Region.objects.filter(id__in=to_delete).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("dukcapil", "0010_maluku_papua_village_status"),
    ]

    operations = [
        migrations.RunPython(dedup, migrations.RunPython.noop),
    ]
