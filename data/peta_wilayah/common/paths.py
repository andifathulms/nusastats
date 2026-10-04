"""Filesystem layout for the Peta Wilayah pipeline (see docs/FEATURE-peta-wilayah.md §4.1)."""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent          # data/peta_wilayah
REPO = ROOT.parent.parent                              # repo root
CONFIG = ROOT / "config"
CACHE = ROOT / "cache"                                 # git-ignored
SOURCES = ROOT / "sources.json"                        # committed manifest

BIG_DIR = REPO / "data" / "big_boundaries"             # full-res BIG desa archive (shared)
PUBLIC = REPO / "frontend" / "public"
PUBLIC_PETA = PUBLIC / "peta"                          # derived outputs per kode


def big_desa_file(prov: str) -> Path:
    return BIG_DIR / f"big-villages-{prov}.geojson"
