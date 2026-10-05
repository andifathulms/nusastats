"""The Peta Wilayah indicator catalog — the single source of truth for which
values are stored, their labels, units and how each is read from the export.

`path` is a tuple into an area record of peta_export.json; ("landcover_class",
code) reads that WorldCover class's share (0 when the class is absent: shares
are over all classified pixels, so absence is a true zero, not a gap).
"""

T = "Copernicus DEM GLO-30"
W = "ESA WorldCover 2021 v200"
SHARE = "Share of area: equal-area UTM pixels (centroid zone) whose centre lies inside the full-detail BIG polygon."

INDICATORS = [
    # key, label_id, group, unit, dataset, path, method
    ("area_km2", "Luas wilayah (poligon BIG)", "umum", "km²", "BIG 1:10K",
     ("terrain", "area_km2"), "Geodesic area of the dissolved BIG desa polygon on the WGS84 ellipsoid."),
    ("elevation_mean", "Rata-rata elevasi", "medan", "m", T, ("terrain", "elevation_m", "mean"),
     "Mean of 30 m UTM pixels. Surface model: includes canopy and buildings; EGM2008 heights."),
    ("elevation_median", "Median elevasi", "medan", "m", T, ("terrain", "elevation_m", "median"),
     "Median of 30 m UTM pixels."),
    ("elevation_max", "Titik tertinggi", "medan", "m", T, ("terrain", "elevation_m", "max"),
     "Highest native 1 arc-second DEM pixel inside the polygon."),
    ("relief", "Relief (p95 − p5)", "medan", "m", T, ("terrain", "relief_m"),
     "95th minus 5th percentile of elevation."),
    ("share_elev_lt_100", "Luas di bawah 100 m", "medan", "%", T, ("terrain", "metrics_pct", "share_elev_lt_100"), SHARE),
    ("share_elev_ge_1000", "Luas di atas 1.000 m", "medan", "%", T, ("terrain", "metrics_pct", "share_elev_ge_1000"), SHARE),
    ("slope_mean", "Lereng rata-rata", "medan", "°", T, ("terrain", "slope_deg", "mean"),
     "Mean Horn 3x3 slope on the 30 m UTM grid."),
    ("share_slope_ge_25", "Luas lereng ≥25°", "medan", "%", T, ("terrain", "metrics_pct", "share_slope_ge_25"), SHARE),
    ("lowland_lt_5", "Luas di bawah 5 m (batas bawah)", "medan", "%", T, ("terrain", "lowland_pct", "lt_5"),
     "Share of area with DEM surface below 5 m. LOWER BOUND: the DEM is a surface model, so canopy and "
     "buildings read high (coastal mangrove 5-9 m, forest 10-23 m). Counts all low land, not only the coast. " + SHARE),
    ("lowland_lt_10", "Luas di bawah 10 m (batas bawah)", "medan", "%", T, ("terrain", "lowland_pct", "lt_10"),
     "As lowland_lt_5, below 10 m. LOWER BOUND. " + SHARE),
    ("local_relief_mean", "Relief lokal rata-rata (1 km)", "medan", "m", T, ("terrain", "local_relief", "mean_m"),
     "Mean of (max - min elevation in a 1 km window) over 30 m UTM pixels: how rugged the land is."),
    ("relief_bergunung", "Luas bergunung (relief lokal ≥300 m)", "medan", "%", T,
     ("terrain", "local_relief", "classes_pct", "bergunung"),
     "Share of area whose 1 km local relief is at least 300 m. NusaStats class, shown alongside the terrain class. " + SHARE),
    ("relief_datar", "Luas datar (relief lokal <30 m)", "medan", "%", T,
     ("terrain", "local_relief", "classes_pct", "datar"),
     "Share of area whose 1 km local relief is under 30 m. NusaStats class. " + SHARE),
    ("lc_tree", "Tutupan pohon", "tutupan", "%", W, ("landcover_class", 10),
     "WorldCover class 10. Includes plantations (sawit, akasia): not 'hutan'. " + SHARE),
    ("lc_cropland", "Lahan pertanian", "tutupan", "%", W, ("landcover_class", 40), "WorldCover class 40. " + SHARE),
    ("lc_builtup", "Lahan terbangun", "tutupan", "%", W, ("landcover_class", 50), "WorldCover class 50. " + SHARE),
    ("lc_grassland", "Padang rumput", "tutupan", "%", W, ("landcover_class", 30), "WorldCover class 30. " + SHARE),
    ("lc_shrubland", "Semak belukar", "tutupan", "%", W, ("landcover_class", 20), "WorldCover class 20. " + SHARE),
    ("lc_mangrove", "Mangrove", "tutupan", "%", W, ("landcover_class", 95), "WorldCover class 95. " + SHARE),
    ("lc_water", "Badan air", "tutupan", "%", W, ("landcover_class", 80), "WorldCover class 80. " + SHARE),
    ("lc_wetland", "Lahan basah", "tutupan", "%", W, ("landcover_class", 90), "WorldCover class 90. " + SHARE),
    ("lc_bare", "Lahan terbuka", "tutupan", "%", W, ("landcover_class", 60), "WorldCover class 60. " + SHARE),
]


def read(area: dict, path: tuple):
    """Value for `path` in an export area record, or None if that layer is absent."""
    if path[0] == "landcover_class":
        lc = area.get("landcover")
        if lc is None:
            return None
        return next((c["share_pct"] for c in lc["classes"] if c["code"] == path[1]), 0.0)
    cur = area
    for p in path:
        if not isinstance(cur, dict) or p not in cur:
            return None
        cur = cur[p]
    return float(cur)
