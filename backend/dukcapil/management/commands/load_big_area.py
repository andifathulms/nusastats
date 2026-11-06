"""Load per-region BIG polygon areas into DukcapilRegion.luas_big.

Villages get their area directly from backend/dukcapil/data/big_area.json
(keyed by the 10-digit Kemendagri code == DukcapilRegion.code). Kecamatan and
kabupaten areas are the sum of EVERY BIG desa under their code, not only the
desa Dukcapil lists: BIG's map has newer desa Dukcapil has no row for yet
(Takalar: 110 vs 100), and leaving them out understated the area and
overstated density. Province areas are the sum of their kabupaten rows, so BIG
desa under a kabupaten code Dukcapil doesn't have (Papua Barat Daya's old 92xx
codes in BIG's pre-split Papua Barat archive) never count; they are reported.

Run AFTER ingest (ingest overwrites `attributes` but never touches `luas_big`,
so re-running this only after a fresh crawl is enough). Idempotent.

    python manage.py load_big_area [--period YYYY-MM]

Regenerate the JSON (from the full-res BIG archive) with
`python3 data/big_boundaries/compute_area.py`.
"""
import json
import os
from collections import defaultdict

from django.conf import settings
from django.core.management.base import BaseCommand

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

        listed = set(villages.values_list("code", flat=True))
        unlisted = [c for c in area if c not in listed]
        self.stdout.write(f"BIG desa Dukcapil doesn't list: {len(unlisted):,} (counted in their kecamatan/kabupaten area)")

        # 2) Kecamatan / kabupaten: every BIG desa under the code. Province: its kabupaten rows.
        sums = {6: defaultdict(float), 4: defaultdict(float)}
        for code, a in area.items():
            sums[6][code[:6]] += a
            sums[4][code[:4]] += a
        kab_area = {}
        for level, n in ((DukcapilLevel.DISTRICT, 6), (DukcapilLevel.REGENCY, 4)):
            rows = DukcapilRegion.objects.filter(level=level, period=period)
            updates = [
                DukcapilRegion(id=pk, luas_big=(round(sums[n][code], 4) if code in sums[n] else None))
                for code, pk in rows.values_list("code", "id")
            ]
            self._bulk(updates)
            self.stdout.write(f"{level}: {sum(1 for u in updates if u.luas_big is not None):,}/{len(updates):,} set")
            if level == DukcapilLevel.REGENCY:
                kab_area = {code: sums[4][code] for code in rows.values_list("code", flat=True) if code in sums[4]}
        orphan = defaultdict(int)
        for code in area:
            if code[:4] not in kab_area:
                orphan[code[:4]] += 1
        if orphan:
            self.stdout.write(
                "BIG desa under no Dukcapil kabupaten (not counted): "
                + ", ".join(f"{k} ({v})" for k, v in sorted(orphan.items()))
            )
        prov_area = defaultdict(float)
        for code, a in kab_area.items():
            prov_area[code[:2]] += a
        rows = DukcapilRegion.objects.filter(level=DukcapilLevel.PROVINCE, period=period)
        updates = [
            DukcapilRegion(id=pk, luas_big=(round(prov_area[code], 4) if code in prov_area else None))
            for code, pk in rows.values_list("code", "id")
        ]
        self._bulk(updates)
        self.stdout.write(f"{DukcapilLevel.PROVINCE}: {sum(1 for u in updates if u.luas_big is not None):,}/{len(updates):,} set")

        from api.caching import bump_data_version

        bump_data_version("dukcapil")
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
