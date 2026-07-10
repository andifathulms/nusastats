"""Derived Dukcapil indicators — demographic metrics computed on the fly from
the raw fields, never stored. Each spec declares the raw fields it needs
(`requires`) and a function mapping a {field: value} dict to a single number
(or None when undefined, e.g. divide-by-zero or a missing input).

Only metrics whose inputs are populated at every admin level are included
(profiled from the live data): jml_lahir is empty everywhere, so no birth
rate; but luas_wilayah, jml_meninggal, the KTP fields, education attainment
and every age bucket are present at province/regency/district/village.
"""

# 5-year age buckets grouped into the standard demographic bands.
AGE_YOUNG = ("u0", "u5", "u10")  # 0-14
AGE_WORK = ("u15", "u20", "u25", "u30", "u35", "u40", "u45", "u50", "u55", "u60")  # 15-64
AGE_OLD = ("u65", "u70", "u75")  # 65+
SARJANA = ("s1", "s2", "s3")  # s1 label is "Diploma IV/Strata I"
SLTA_PLUS = ("slta", "d1_dan_d2", "d3", "s1", "s2", "s3")


def _val(v, spec):
    """A single field value, or the sum of several (spec may be a str or tuple)."""
    if isinstance(spec, str):
        return v.get(spec)
    total, seen = 0.0, False
    for k in spec:
        x = v.get(k)
        if x is not None:
            total += x
            seen = True
    return total if seen else None


def _mk(field, label_id, group, unit, num, den, scale, cap=None):
    num_t = (num,) if isinstance(num, str) else tuple(num)
    den_t = (den,) if isinstance(den, str) else tuple(den)
    requires = tuple(dict.fromkeys(num_t + den_t))  # dedup, keep order

    def fn(v, num=num, den=den, scale=scale, cap=cap):
        n, d = _val(v, num), _val(v, den)
        if n is None or not d:
            return None
        r = round(n / d * scale, 2)
        # `cap` guards against corrupt source denominators (e.g. one kabupaten
        # has luas_wilayah=0.125 km², yielding a 20M/km² "density"). Above a
        # physically-impossible ceiling we decline to report rather than
        # fabricate — and rather than let one bad row wreck the colour scale.
        if cap is not None and r > cap:
            return None
        return r

    return {"field": field, "label_id": label_id, "group": group, "unit": unit,
            "requires": requires, "fn": fn, "derived": True}


DERIVED = [
    _mk("sex_ratio", "Rasio Jenis Kelamin", "Rasio & Turunan", "L per 100 P",
        "pria", "wanita", 100),
    _mk("dependency_ratio", "Rasio Ketergantungan", "Rasio & Turunan", "per 100 produktif",
        AGE_YOUNG + AGE_OLD, AGE_WORK, 100),
    _mk("dependency_young", "Rasio Ketergantungan Muda", "Rasio & Turunan", "per 100",
        AGE_YOUNG, AGE_WORK, 100),
    _mk("dependency_old", "Rasio Ketergantungan Lansia", "Rasio & Turunan", "per 100",
        AGE_OLD, AGE_WORK, 100),
    _mk("pct_productive", "% Usia Produktif (15-64)", "Rasio & Turunan", "%",
        AGE_WORK, "jumlah_penduduk", 100),
    _mk("pct_elderly", "% Lansia (65+)", "Rasio & Turunan", "%",
        AGE_OLD, "jumlah_penduduk", 100),
    _mk("pop_density", "Kepadatan Penduduk (turunan)", "Kependudukan", "jiwa/km²",
        "jumlah_penduduk", "luas_wilayah", 1, cap=200000),
    _mk("avg_household", "Rata-rata Jiwa per KK", "Kependudukan", "jiwa/KK",
        "jumlah_penduduk", "jumlah_kk", 1),
    _mk("pct_sarjana", "% Sarjana ke atas (S1+)", "Pendidikan (Tamat)", "%",
        SARJANA, "jumlah_penduduk", 100),
    _mk("pct_slta_plus", "% Tamat SLTA ke atas", "Pendidikan (Tamat)", "%",
        SLTA_PLUS, "jumlah_penduduk", 100),
    _mk("ktp_coverage", "Cakupan Perekaman KTP-el", "Adminduk", "%",
        "jml_rekam_wktp", "jml_wktp", 100),
    _mk("crude_death_rate", "Angka Kematian Kasar", "Peristiwa Vital", "per 1.000",
        "jml_meninggal", "jumlah_penduduk", 1000),
    _mk("pct_married", "% Berstatus Kawin", "Status Perkawinan", "%",
        "kawin", "jumlah_penduduk", 100),
]

DERIVED_BY_FIELD = {d["field"]: d for d in DERIVED}


def meta(spec):
    """Catalog-shaped dict (matches DukcapilIndicatorSerializer output + a
    `derived` flag) for a derived spec, so the API can list/return it like a
    raw indicator."""
    return {
        "field": spec["field"], "label_id": spec["label_id"], "group": spec["group"],
        "unit": spec["unit"], "is_string": False, "sort": 900, "derived": True,
    }
