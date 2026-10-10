import numpy as np

from desa.compute import label_shares


def test_label_shares_counts_and_breaks_per_label():
    labels = np.array([[1, 1, 2], [1, 2, 2], [0, 0, 0]])
    z = np.array([[3.0, 12.0, 4.0], [np.nan, 9.0, 30.0], [1.0, 1.0, 1.0]])
    sh = label_shares(labels, z, 2, [5, 10])
    assert list(sh["count"]) == [0, 2, 3]          # NaN pixel and label 0 are ignored
    assert sh[5][1] == 50.0 and sh[10][1] == 50.0  # desa 1: 3 m and 12 m
    assert round(sh[5][2], 2) == 33.33 and round(sh[10][2], 2) == 66.67


def test_label_without_pixels_is_nan_not_zero():
    sh = label_shares(np.array([[1]]), np.array([[2.0]]), 2, [5])
    assert sh["count"][2] == 0 and np.isnan(sh[5][2])
