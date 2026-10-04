import numpy as np
import pytest
import yaml

from common import display, worldcover
from common.paths import CONFIG
from landcover.compute import LandcoverCheckFailed, check_render_palette, lut

CLASSES = yaml.safe_load((CONFIG / "landcover.yaml").read_text())["classes"]

# The palette published in the spec (docs/FEATURE-peta-wilayah.md §3).
SPEC = {10: "#006400", 20: "#ffbb22", 30: "#ffff4c", 40: "#f096ff", 50: "#fa0000", 60: "#b4b4b4",
        70: "#f0f0f0", 80: "#0064c8", 90: "#0096a0", 95: "#00cf75", 100: "#fae6a0"}


def test_config_palette_matches_spec():
    assert {c["code"]: c["color"] for c in CLASSES} == SPEC
    assert next(c for c in CLASSES if c["code"] == 10)["label"] == "Tutupan pohon"


def test_tile_names():
    assert worldcover.tiles_for_bounds(116.33, -1.6, 116.95, -0.79) == ["S03E114"]
    assert worldcover.tiles_for_bounds(116.5, -0.5, 117.5, 0.5) == ["S03E114", "S03E117", "N00E114", "N00E117"]
    assert worldcover.tiles_for_bounds(114.0, -3.0, 117.0, 0.0) == ["S03E114"]


def test_lossless_render_keeps_exact_palette():
    codes = np.array([[0, 10, 20, 95], [100, 50, 80, 0]], dtype=np.uint8)
    img = display.webp(lut(CLASSES)[codes], lossless=True)
    assert check_render_palette(img, CLASSES) == 6


def test_lossy_render_is_rejected():
    rng = np.random.default_rng(0)
    codes = rng.choice([10, 20, 40, 50], size=(64, 64)).astype(np.uint8)
    img = display.webp(lut(CLASSES)[codes], quality=50)
    with pytest.raises(LandcoverCheckFailed):
        check_render_palette(img, CLASSES)
