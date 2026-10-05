"""Write peta/data/kecamatan_names.json: kecamatan code -> name, from the
Dukcapil *village* records (kec_code / nama_kec), for the Peta Wilayah outline
step to fall back on.

Why: ~30 real kecamatan (e.g. 730511 Polongbangkeng Timur, 730603 Tompobulu)
have no row in Dukcapil's kecamatan layer, so the display boundary file carries
them nameless, and the batch runner would skip them as if they were stale
codes. Their villages do name them. Each entry records the village row and the
DukcapilFetchLog it came from. A code no village names is simply absent; the
pipeline keeps skipping it.
"""
import json
from pathlib import Path

from django.core.management.base import BaseCommand

from dukcapil.models import DukcapilLevel, DukcapilRegion

OUT = Path(__file__).resolve().parents[2] / "data" / "kecamatan_names.json"


class Command(BaseCommand):
    help = "Export kecamatan names from Dukcapil village records for the Peta Wilayah pipeline."

    def handle(self, *args, **opts):
        names = {}
        conflicts = {}
        rows = (DukcapilRegion.objects.filter(level=DukcapilLevel.VILLAGE)
                .exclude(kec_code="").exclude(nama_kec="")
                .order_by("kec_code", "code", "-period")
                .values_list("kec_code", "nama_kec", "nama_kab", "code", "fetch_log_id"))
        for kec, name, kab, village, log_id in rows:
            if kec in names:
                if names[kec]["name"] != name:
                    conflicts.setdefault(kec, {names[kec]["name"]}).add(name)
                continue
            names[kec] = {"name": name, "kabupaten": kab, "from_village": village, "fetch_log_id": log_id}
        for kec in conflicts:  # ambiguous: never pick one
            names.pop(kec, None)
        OUT.parent.mkdir(parents=True, exist_ok=True)
        # One compact line per kecamatan: small, and diffs stay readable.
        lines = [f"{json.dumps(k)}:{json.dumps(v, ensure_ascii=False, sort_keys=True, separators=(',', ':'))}"
                 for k, v in sorted(names.items())]
        OUT.write_text('{"source":"dukcapil village records (kec_code -> nama_kec)","names":{\n'
                       + ",\n".join(lines) + "\n}}\n")
        self.stdout.write(self.style.SUCCESS(
            f"export_kecamatan_names: {len(names)} kecamatan -> {OUT} "
            f"({len(conflicts)} with conflicting names left out: {sorted(conflicts)[:10]})"))
