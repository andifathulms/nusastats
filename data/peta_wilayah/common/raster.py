"""Raster helpers shared by the terrain and land cover steps."""
import math


def snap_bounds(transform, bounds):
    """Expand (west, south, east, north) outward onto the source pixel grid.

    rasterio's merge(bounds=…) puts the output origin exactly at the requested
    west/north, so unsnapped bounds shift the grid by a fraction of a pixel and
    every value becomes a nearest-neighbour re-pick that differs per area. Snapped
    bounds keep the mosaic on the tiles' own grid: values are the source pixels.
    """
    rx, ry = transform.a, -transform.e
    c, f = transform.c, transform.f
    w, s, e, n = bounds
    eps = 1e-9
    return (c + math.floor((w - c) / rx + eps) * rx,
            f - math.ceil((f - s) / ry - eps) * ry,
            c + math.ceil((e - c) / rx - eps) * rx,
            f - math.floor((f - n) / ry + eps) * ry)
