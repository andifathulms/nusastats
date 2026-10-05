import numpy as np
import pytest

from common.projection import utm_epsg
from common.tiles import tile_name, tiles_for_bounds
from terrain import dem, rules


def test_tile_names():
    assert tile_name(-1, 116) == "Copernicus_DSM_COG_10_S01_00_E116_00_DEM"
    assert tile_name(0, 116) == "Copernicus_DSM_COG_10_N00_00_E116_00_DEM"
    assert tile_name(5, -3) == "Copernicus_DSM_COG_10_N05_00_W003_00_DEM"


def test_tiles_for_bounds():
    t = tiles_for_bounds(116.3, -1.6, 116.95, -0.79)
    assert t == [tile_name(-2, 116), tile_name(-1, 116)]
    assert tiles_for_bounds(116.0, -1.0, 117.0, 0.0) == [tile_name(-1, 116)]  # edges don't spill


def test_utm():
    assert utm_epsg(116.6, -1.2) == 32750
    assert utm_epsg(95.3, 5.5) == 32646
    assert utm_epsg(140.7, -2.5) == 32754


def test_slope_plane():
    y, x = np.mgrid[0:10, 0:10] * 30.0
    z = x * 1.0  # rises 1 m per m eastward -> 45°
    s = dem.slope_deg(z, 30.0, 30.0)
    assert np.allclose(s[1:-1, 1:-1], 45.0)
    assert np.isnan(s[0, 0])


def test_hillshade_faces_northwest_light():
    rows, cols = np.mgrid[0:10, 0:10] * 30.0
    flat = dem.hillshade(np.zeros((10, 10)), 30.0, 30.0)[5, 5]
    nw_facing = dem.hillshade(0.3 * cols + 0.3 * rows, 30.0, 30.0)[5, 5]   # rises E and S
    se_facing = dem.hillshade(-0.3 * cols - 0.3 * rows, 30.0, 30.0)[5, 5]
    assert nw_facing > flat > se_facing
    assert flat == pytest.approx(np.cos(np.radians(45)))


def test_tint_stops():
    stops = [[0, "#000000"], [100, "#ffffff"]]
    t = dem.tint(np.array([[0.0, 40.0, 100.0, 500.0]]), stops)
    assert t[0, :, 0].tolist() == [0, 102, 255, 255]  # clamps above the top stop


@pytest.fixture
def cfg():
    return rules.load()[0]


def _m(**kw):
    base = dict(share_elev_ge_1000=0, share_elev_ge_200=0, share_elev_lt_100=0,
                share_slope_ge_25=0, share_slope_ge_8=0, share_slope_lt_8=100)
    return {**base, **kw}


def test_rules_order_and_reason(cfg):
    assert rules.classify(_m(share_elev_ge_1000=45, share_slope_ge_8=90), cfg)[0] == "pegunungan"
    c, _, reason = rules.classify(_m(share_slope_ge_8=58.04, share_slope_lt_8=41.96), cfg)
    assert c == "perbukitan" and reason == "Perbukitan: 58,0% area lereng ≥8°"
    c, _, reason = rules.classify(_m(share_elev_lt_100=70, share_slope_lt_8=80), cfg)
    assert c == "dataran_rendah" and reason == "Dataran rendah: 70,0% area <100 m dan 80,0% area lereng <8°"
    assert rules.classify(_m(share_elev_lt_100=50, share_slope_lt_8=80), cfg)[0] == "campuran"


def test_snap_bounds_lands_on_source_grid():
    from rasterio.transform import from_origin

    from common.raster import snap_bounds
    res = 1 / 3600
    t = from_origin(116 - res / 2, 0 + res / 2, res, res)  # Copernicus: half-pixel shifted
    w, s, e, n = snap_bounds(t, (116.33395, -1.59578, 116.94518, -0.79777))
    for v, origin in ((w, t.c), (e, t.c), (n, t.f), (s, t.f)):
        k = (v - origin) / res
        assert abs(k - round(k)) < 1e-6
    assert w <= 116.33395 and e >= 116.94518 and s <= -1.59578 and n >= -0.79777
