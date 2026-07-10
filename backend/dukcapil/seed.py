"""Seed the DukcapilIndicator catalog from `indicators.INDICATORS`.

Idempotent: upserts by `field` and prunes catalog rows no longer listed, so
editing `indicators.py` and re-running keeps the table in sync.
"""

from .indicators import INDICATORS
from .models import DukcapilIndicator


def seed_indicators():
    seen = []
    for sort, (field, label_id, group, unit, is_string) in enumerate(INDICATORS):
        DukcapilIndicator.objects.update_or_create(
            field=field,
            defaults={
                "label_id": label_id,
                "group": group,
                "unit": unit,
                "is_string": is_string,
                "sort": sort,
            },
        )
        seen.append(field)
    removed, _ = DukcapilIndicator.objects.exclude(field__in=seen).delete()
    return {"seeded": len(seen), "removed": removed}
