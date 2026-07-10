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
RELIGIONS = ("islam", "kristen", "katholik", "hindu", "budha", "konghucu", "kepercayaan")
BLOOD_O = ("o", "o_", "o1")
BLOOD_KNOWN = ("a", "a_", "a1", "b", "b_", "b1", "ab", "ab_", "ab1", "o", "o_", "o1")
# (field, lower-bound age) for the 16 five-year bands; u75 is open-ended.
AGE_BANDS = [
    ("u0", 0), ("u5", 5), ("u10", 10), ("u15", 15), ("u20", 20), ("u25", 25),
    ("u30", 30), ("u35", 35), ("u40", 40), ("u45", 45), ("u50", 50), ("u55", 55),
    ("u60", 60), ("u65", 65), ("u70", 70), ("u75", 75),
]


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


def _custom(field, label_id, group, unit, requires, fn):
    """A derived indicator whose value isn't a simple num/den ratio."""
    return {"field": field, "label_id": label_id, "group": group, "unit": unit,
            "requires": tuple(requires), "fn": fn, "derived": True}


def _religion_diversity(v):
    """Simpson diversity index across the 7 religions, ×100: the chance two
    random residents follow different religions (0 = uniform, ~100 = evenly
    mixed)."""
    counts = [v.get(r) for r in RELIGIONS if v.get(r) is not None]
    tot = sum(counts)
    if tot <= 0:
        return None
    return round((1 - sum((c / tot) ** 2 for c in counts)) * 100, 2)


def _median_age(v):
    """Median age interpolated from the 16 five-year age bands."""
    bands = [(lb, v.get(f)) for f, lb in AGE_BANDS if v.get(f) is not None]
    total = sum(c for _, c in bands)
    if total <= 0:
        return None
    half, cum = total / 2, 0.0
    for lb, c in bands:
        if cum + c >= half and c > 0:
            return round(lb + (half - cum) / c * 5, 1)  # 5-year band width
        cum += c
    return None


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

    # --- Easy adds -----------------------------------------------------------
    _mk("pct_children", "% Anak (0-14)", "Rasio & Turunan", "%",
        AGE_YOUNG, "jumlah_penduduk", 100),
    _custom("median_age", "Usia Median (perkiraan)", "Rasio & Turunan", "tahun",
            [f for f, _ in AGE_BANDS], _median_age),
    _mk("child_woman_ratio", "Rasio Anak per 1.000 Wanita", "Rasio & Turunan", "per 1.000 ♀",
        "u0", "wanita", 1000),
    _custom("religion_diversity", "Indeks Keragaman Agama", "Agama", "0-100",
            RELIGIONS, _religion_diversity),
    _mk("pct_unmarried", "% Belum Kawin", "Status Perkawinan", "%",
        "belum_kawin", "jumlah_penduduk", 100),
    _mk("pct_divorced", "% Cerai Hidup", "Status Perkawinan", "%",
        "cerai_hidup", "jumlah_penduduk", 100),
    _mk("pct_blood_o", "% Golongan Darah O", "Golongan Darah", "%",
        BLOOD_O, BLOOD_KNOWN, 100),
    _mk("pct_fisher", "% Nelayan", "Pekerjaan", "%",
        "nelayan", "jumlah_penduduk", 100),
    _mk("pct_entrepreneur", "% Wiraswasta", "Pekerjaan", "%",
        "wiraswasta", "jumlah_penduduk", 100),
    _mk("net_migration_rate", "Perpindahan per 1.000", "Peristiwa Vital", "per 1.000",
        "perpindahan_pddk", "jumlah_penduduk", 1000),
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
