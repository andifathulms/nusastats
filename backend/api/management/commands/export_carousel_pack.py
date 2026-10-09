"""Export one ranked metric as a `carousel-data/1` pack for Carousel Press
(docs/RECON_CAROUSEL.md §5, built by api.carousel). Read-only: writes the pack
to stdout or --out, and optionally the provenance sidecar, the full map values
and a Peta Angka deck (api.carousel_deck). Nothing goes to the DB or Redis.

    manage.py export_carousel_pack --source bps --metric 415 --level kabupaten --period 2025
    manage.py export_carousel_pack --source dukcapil --metric sex_ratio --level kabupaten --prov 64 --out-dir exports/carousels

Refusals (incomplete coverage, an ambiguous BPS breakdown, duplicate regions)
print the reason and exit non-zero.
"""

import json
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError

from api.carousel import LEVELS, SOURCES, PackError, build_pack
from api.carousel_deck import MAP_BACKGROUNDS, RECIPES, deck_bundle


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
        p.add_argument("--out-dir", help="Write a full bundle: pack.json, provenance.json, map.json, deck.txt, README.md.")
        p.add_argument("--recipe", choices=RECIPES, default="top", help="Deck recipe for --out-dir.")
        p.add_argument("--map-bg", choices=MAP_BACKGROUNDS, default="terrain",
                       help="Peta Wilayah layer behind each ranked region's map card in --out-dir.")

    def handle(self, *args, **o):
        spec = {k: o[k] for k in ("source", "metric", "level", "period", "prov", "turvar", "th", "unit",
                                  "label_metric", "notes", "top", "bottom")}
        spec["allow_partial"] = "1" if o["allow_partial"] else None
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

        if o["out_dir"]:
            bundle = deck_bundle(result, spec, recipe=o["recipe"], map_bg=o["map_bg"])
            out = Path(o["out_dir"]) / result["pack"]["id"]
            out.mkdir(parents=True, exist_ok=True)
            for name, content in (("pack.json", dump(result["pack"])), ("provenance.json", dump(result["provenance"])),
                                  ("map.json", dump(result["map"])), ("deck.txt", bundle["deck"]),
                                  ("README.md", bundle["readme"])):
                (out / name).write_text(content, encoding="utf-8")
            self.stdout.write(f"Bundle written to {out}/")
            for w in bundle["warnings"]:
                self.stderr.write(f"  ! {w}")
            return

        if o["provenance"]:
            Path(o["provenance"]).write_text(dump(result["provenance"]), encoding="utf-8")
        if o["out"]:
            Path(o["out"]).write_text(dump(result["pack"]), encoding="utf-8")
            self.stdout.write(f"Pack {result['pack']['id']} written to {o['out']}")
        else:
            self.stdout.write(dump(result["pack"]), ending="")
