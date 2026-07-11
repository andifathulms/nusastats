"""Load per-region BIG polygon areas into DukcapilRegion.luas_big.

Villages get their area directly from backend/dukcapil/data/big_area.json
(keyed by the 10-digit Kemendagri code == DukcapilRegion.code). Kecamatan /
kabupaten / province areas are summed from their villages (area is additive),
using the app's own kec_code/kab_code/prov_code grouping so the aggregates match
the hierarchy the UI navigates.

Run AFTER ingest (ingest overwrites `attributes` but never touches `luas_big`,
so re-running this only after a fresh crawl is enough). Idempotent.

    python manage.py load_big_area [--period YYYY-MM]

Regenerate the JSON (from the full-res BIG archive) with
`python3 data/big_boundaries/compute_area.py`.
"""
import json
import os

from django.conf import settings
from django.core.management.base import BaseCommand
from django.db.models import Sum

from dukcapil.models import DukcapilLevel, DukcapilRegion, current_period

CHUNK = 2000
DATA = os.path.join(settings.BASE_DIR, "dukcapil", "data", "big_area.json")


class Command(BaseCommand):
    help = "Populate DukcapilRegion.luas_big from BIG polygon areas (villages) + hierarchy sums."

    def add_arguments(self, parser):
        parser.add_argument("--period", default=None, help="Snapshot period (default: latest with villages).")
        parser.add_argument("--path", default=DATA, help="big_area.json path.")

    def handle(self, *args, **opts):
        area = json.load(open(opts["path"]))
        self.stdout.write(f"loaded {len(area):,} desa areas from {opts['path']}")

        period = opts["period"] or self._period()
        if not period:
            self.stderr.write("no ingested villages found; nothing to do.")
            return
        self.stdout.write(f"period: {period}")

        # 1) Villages: area straight from the JSON, matched by code.
        villages = DukcapilRegion.objects.filter(level=DukcapilLevel.VILLAGE, period=period)
        updates, matched = [], 0
        for code, pk in villages.values_list("code", "id"):
            a = area.get(code)
            if a is not None:
                matched += 1
            updates.append(DukcapilRegion(id=pk, luas_big=a))
        self._bulk(updates)
        self.stdout.write(f"villages: {matched:,}/{len(updates):,} matched a BIG area")

        # 2) Kecamatan / kabupaten / province: sum villages up the hierarchy.
        for level, group in (
            (DukcapilLevel.DISTRICT, "kec_code"),
            (DukcapilLevel.REGENCY, "kab_code"),
            (DukcapilLevel.PROVINCE, "prov_code"),
        ):
            sums = dict(
                villages.exclude(luas_big=None)
                .values(group)
                .order_by()
                .annotate(s=Sum("luas_big"))
                .values_list(group, "s")
            )
            rows = DukcapilRegion.objects.filter(level=level, period=period)
            updates = [
                DukcapilRegion(id=pk, luas_big=(round(sums[code], 4) if sums.get(code) is not None else None))
                for code, pk in rows.values_list("code", "id")
            ]
            self._bulk(updates)
            self.stdout.write(f"{level}: {sum(1 for u in updates if u.luas_big is not None):,}/{len(updates):,} set")

        self.stdout.write(self.style.SUCCESS("done"))

    def _period(self):
        row = (
            DukcapilRegion.objects.filter(level=DukcapilLevel.VILLAGE)
            .order_by("-period")
            .values_list("period", flat=True)
            .first()
        )
        return row or current_period()

    @staticmethod
    def _bulk(updates):
        for i in range(0, len(updates), CHUNK):
            DukcapilRegion.objects.bulk_update(updates[i : i + CHUNK], ["luas_big"])
