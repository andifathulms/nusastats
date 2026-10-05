import numpy as np
from rasterio.transform import from_origin
from shapely.geometry import box

from nightlights.annual import annual_median
from nightlights.compute import coverage, row_areas_km2


def test_annual_median_ignores_cloudy_months_and_spikes():
    rad = np.array([[[2.0]], [[3.0]], [[50.0]], [[0.0]]])   # a fire spike in month 3, a cloudy month 4
    cf = np.array([[[1]], [[2]], [[1]], [[0]]])
    med, n = annual_median(rad, cf)
    assert med[0, 0] == 3.0 and n[0, 0] == 3             # median of 2, 3, 50; month 4 excluded


def test_annual_median_no_cloud_free_month_is_nan_not_zero():
    med, n = annual_median(np.zeros((3, 1, 1)), np.zeros((3, 1, 1), dtype=int))
    assert np.isnan(med[0, 0]) and n[0, 0] == 0


def test_coverage_fraction_half_pixel():
    tr = from_origin(0, 2, 1, 1)                          # 2x2 pixels of 1 degree
    frac = coverage(box(0, 1, 0.5, 2), tr, (2, 2), 8)     # left half of the top-left pixel
    assert abs(frac[0, 0] - 0.5) < 1e-9 and frac[1, 1] == 0


def test_row_areas_shrink_away_from_equator():
    tr = from_origin(100, 10, 0.0041666667, 0.0041666667)
    a = row_areas_km2(tr, 1)[0]
    eq = row_areas_km2(from_origin(100, 0.0041666667, 0.0041666667, 0.0041666667), 1)[0]
    assert 0.2 < a < eq < 0.22                            # ~0.213 km² at the equator


def test_annual_cache_key_ignores_stats_and_render_settings():
    from nightlights.annual import annual_key
    a = {"annual": {"statistic": "median", "min_months": 6, "window_pad_deg": 0.02}, "stats": {"x": 1}}
    b = {**a, "stats": {"x": 2}, "render": {"y": 3}}
    assert annual_key(a) == annual_key(b)
    assert annual_key(a) != annual_key({"annual": {**a["annual"], "min_months": 7}})
