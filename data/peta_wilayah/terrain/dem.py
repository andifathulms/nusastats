"""Pure raster math: slope and hillshade with Horn's 3x3 method (as GDAL/ESRI).

Rows run north->south. `dx`/`dy` are cell sizes in metres; `dx` may be a
per-row array (lon/lat grids, where a degree of longitude shrinks with cos lat).
Edge cells and cells next to NaN come out NaN.
"""
import numpy as np


def _horn(z, dx, dy):
    p = np.pad(z, 1, constant_values=np.nan)
    a, b, c = p[:-2, :-2], p[:-2, 1:-1], p[:-2, 2:]
    d, f = p[1:-1, :-2], p[1:-1, 2:]
    g, h, i = p[2:, :-2], p[2:, 1:-1], p[2:, 2:]
    dx = np.asarray(dx, dtype=np.float64)
    if dx.ndim == 1:
        dx = dx[:, None]
    dzdx = ((c + 2 * f + i) - (a + 2 * d + g)) / (8 * dx)   # +east
    dzdy = ((g + 2 * h + i) - (a + 2 * b + c)) / (8 * dy)   # +south (ESRI convention)
    return dzdx, dzdy


def slope_deg(z, dx, dy):
    dzdx, dzdy = _horn(z, dx, dy)
    return np.degrees(np.arctan(np.hypot(dzdx, dzdy)))


def hillshade(z, dx, dy, azimuth_deg=315.0, altitude_deg=45.0, z_factor=1.0):
    """0..1 illumination (ESRI formula). NaN where slope is undefined."""
    dzdx, dzdy = _horn(z * z_factor, dx, dy)
    slope = np.arctan(np.hypot(dzdx, dzdy))
    aspect = np.arctan2(dzdy, -dzdx)
    aspect = np.where(aspect < 0, aspect + 2 * np.pi, aspect)
    zenith = np.radians(90.0 - altitude_deg)
    az_math = np.radians((360.0 - azimuth_deg + 90.0) % 360.0)
    hs = np.cos(zenith) * np.cos(slope) + np.sin(zenith) * np.sin(slope) * np.cos(az_math - aspect)
    return np.clip(hs, 0.0, 1.0)


def tint(z, stops):
    """Hypsometric RGB (uint8) by linear interpolation between absolute stops."""
    xs = np.array([s[0] for s in stops], dtype=np.float64)
    rgb = np.array([[int(s[1][k:k + 2], 16) for k in (1, 3, 5)] for s in stops], dtype=np.float64)
    zz = np.nan_to_num(z, nan=0.0)
    out = np.stack([np.interp(zz, xs, rgb[:, k]) for k in range(3)], axis=-1)
    return np.round(out).astype(np.uint8)
