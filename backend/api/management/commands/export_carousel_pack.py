"""Export one ranked metric as a `carousel-data/1` pack for Carousel Press
(docs/RECON_CAROUSEL.md §5, built by api.carousel). Read-only: writes the pack
to stdout or --out, and optionally the provenance sidecar. Nothing goes to the
DB or Redis.

    manage.py export_carousel_pack --source bps --metric 415 --level kabupaten --period 2025
    manage.py export_carousel_pack --source dukcapil --metric sex_ratio --level kabupaten --prov 64

Refusals (incomplete coverage, an ambiguous BPS breakdown, duplicate regions)
print the reason and exit non-zero.
"""

import json
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError

from api.carousel import LEVELS, SOURCES, PackError, build_pack


class Command(BaseCommand):
    help = "Export a carousel-data/1 pack (one source, one metric, one level and period)."

    def add_arguments(self, p):
        p.add_argument("--source", required=True, choices=SOURCES)
        p.add_argument("--metric", required=True, help="BPS var id, Dukcapil field/derived key, or DJPK akun/ratio key.")
        p.add_argument("--level", required=True, choices=LEVELS)
        p.add_argument("--period", help="Year (BPS, DJPK) or YYYY-MM snapshot (Dukcapil, default latest).")
        p.add_argument("--prov", help="Kemendagri 2-digit province code: rank only that province's regions.")
        p.add_argument("--turvar", help="BPS breakdown id, required when the variable has several.")
        p.add_argument("--th", help="BPS period id, required when a year has several periods.")
        p.add_argument("--top", type=int, default=5)
        p.add_argument("--bottom", type=int, default=5)
        p.add_argument("--id", dest="pack_id")
        p.add_argument("--label-metric", help="Human metric name (default: the source's).")
        p.add_argument("--unit", help="Human unit (required when BPS gives none).")
        p.add_argument("--notes", help="Extra caveat appended to the pack notes.")
        p.add_argument("--allow-partial", action="store_true")
        p.add_argument("--out", help="Write the pack here instead of stdout.")
        p.add_argument("--provenance", help="Write the provenance sidecar here.")

    def handle(self, *args, **o):
        try:
            result = build_pack(
                o["source"], o["metric"], o["level"], o["period"], prov=o["prov"], top=o["top"],
                bottom=o["bottom"], allow_partial=o["allow_partial"], turvar=o["turvar"], th=o["th"],
                unit=o["unit"], label_metric=o["label_metric"], notes=o["notes"], pack_id=o["pack_id"],
            )
        except PackError as exc:
            raise CommandError(str(exc)) from exc

        def dump(obj):
            return json.dumps(obj, ensure_ascii=False, indent=2) + "\n"

        if o["provenance"]:
            Path(o["provenance"]).write_text(dump(result["provenance"]), encoding="utf-8")
        if o["out"]:
            Path(o["out"]).write_text(dump(result["pack"]), encoding="utf-8")
            self.stdout.write(f"Pack {result['pack']['id']} written to {o['out']}")
        else:
            self.stdout.write(dump(result["pack"]), ending="")
