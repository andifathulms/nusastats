"""Normalize Dukcapil region names and derive a structured status.

The source stores names in UPPERCASE, and encodes city-vs-regency only as a
"KOTA " prefix on the name (kabupaten have no prefix). This turns e.g.
"KOTA TANGERANG" into ("Tangerang", "Kota") and "TANGERANG" into
("Tangerang", "Kabupaten").

Note: desa vs kelurahan is NOT present anywhere in the Dukcapil population
data, so village status is left blank (would need an external MFD reference).
"""

import re

# Acronyms to keep uppercase through title-casing.
_KEEP_UPPER = {"DKI", "DIY", "DI"}


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


def name_and_status(level, raw):
    """(clean_name, status) for a region. status is Provinsi / Kota /
    Kabupaten / Kecamatan; blank for village (desa/kelurahan not in source)."""
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
    return title_case(raw), ""  # village
