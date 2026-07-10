"""Normalize Dukcapil region names and derive a structured status.

The source stores names in UPPERCASE, and encodes city-vs-regency only as a
"KOTA " prefix on the name (kabupaten have no prefix). This turns e.g.
"KOTA TANGERANG" into ("Tangerang", "Kota") and "TANGERANG" into
("Tangerang", "Kabupaten").

Desa vs kelurahan isn't in a data field, but the standard Kemendagri 10-digit
region code encodes it: the 7th digit (first of the 4-digit village part) is
1 for Kelurahan and 2 for Desa. Verified against the live data — 8,468 (1) vs
74,929 (2), matching Indonesia's real ~8.5k kelurahan / ~75k desa split.
"""

import re

# Acronyms to keep uppercase through title-casing.
_KEEP_UPPER = {"DKI", "DIY", "DI"}


def village_status(code):
    """'Kelurahan' / 'Desa' from the 7th digit of the 10-digit code, or '' for
    the ~0.1% with a non-standard code (dirty/objectid-suffixed rows)."""
    if code and len(code) >= 10 and code[:10].isdigit():
        return {"1": "Kelurahan", "2": "Desa"}.get(code[6], "")
    return ""


def _cap_word(w):
    if w.upper() in _KEEP_UPPER:
        return w.upper()
    # Capitalize each alphabetic run, preserving separators like - . '
    return re.sub(r"[A-Za-z']+", lambda m: m.group(0).capitalize(), w)


def title_case(s):
    """UPPERCASE region name -> Title Case (MAKASSAR -> Makassar), keeping
    known acronyms (DKI JAKARTA -> DKI Jakarta)."""
    return " ".join(_cap_word(w) for w in (s or "").split())


_KABUPATEN_PREFIXES = ("KABUPATEN ", "KAB. ", "KAB ")


def name_and_status(level, raw, code=None):
    """(clean_name, status) for a region. status is Provinsi / Kota /
    Kabupaten / Kecamatan / Kelurahan / Desa (village from `code`)."""
    raw = (raw or "").strip()
    up = raw.upper()
    if level == "regency":
        if up.startswith("KOTA "):
            return title_case(raw[5:]), "Kota"
        for pre in _KABUPATEN_PREFIXES:  # defensive: some layers add "KAB."
            if up.startswith(pre):
                return title_case(raw[len(pre):]), "Kabupaten"
        return title_case(raw), "Kabupaten"
    if level == "province":
        return title_case(raw), "Provinsi"
    if level == "district":
        return title_case(raw), "Kecamatan"
    return title_case(raw), village_status(code)  # village
