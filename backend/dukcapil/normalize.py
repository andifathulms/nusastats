"""Normalize Dukcapil region names and derive a structured status.

The source stores names in UPPERCASE, and encodes city-vs-regency only as a
"KOTA " prefix on the name (kabupaten have no prefix). This turns e.g.
"KOTA TANGERANG" into ("Tangerang", "Kota") and "TANGERANG" into
("Tangerang", "Kabupaten").

Beyond the plain Kota/Kabupaten split, some regions carry special designations
that are NOT in any data field but follow the Kemendagri wilayah code:

- **Provinsi:** default "Provinsi"; "Daerah Khusus" for Aceh, DKI Jakarta and
  the six Papua provinces; "Daerah Istimewa" for DI Yogyakarta and Aceh — so
  Aceh is both (comma-joined, Istimewa first).
- **Kabupaten/Kota:** DKI Jakarta's five kota are "Kota Administrasi" and
  Kepulauan Seribu is "Kabupaten Administrasi".
- **Kecamatan:** default "Kecamatan"; "Distrik" throughout Papua (prov 91-96);
  in DI Yogyakarta "Kemantren" inside Kota Yogyakarta (3471) and "Kapanewon"
  elsewhere in the province.

Desa vs kelurahan isn't in a data field either, but the standard Kemendagri
10-digit region code encodes it: the 7th digit (first of the 4-digit village
part) is 1 for Kelurahan and 2 for Desa. Verified against the live data —
8,468 (1) vs 74,929 (2), matching Indonesia's ~8.5k kelurahan / ~75k desa split.
"""

import re

# Acronyms to keep uppercase through title-casing.
_KEEP_UPPER = {"DKI", "DIY", "DI"}

# --- code-driven special designations ---------------------------------------
_PROV_KHUSUS = {"11", "31", "91", "92", "93", "94", "95", "96"}  # Aceh, DKI, 6× Papua
_PROV_ISTIMEWA = {"34", "11"}  # DI Yogyakarta, Aceh
_JKT_KOTA = {"3171", "3172", "3173", "3174", "3175"}  # DKI kota administrasi
_JKT_KAB = "3101"  # Kepulauan Seribu (kabupaten administrasi)
_PAPUA_PROVS = {"91", "92", "93", "94", "95", "96"}
_DIY_PROV = "34"
_YOGYA_KOTA = "3471"

# Regency name prefixes to strip (longest first) before title-casing.
_REGENCY_PREFIXES = (
    "KOTA ADMINISTRASI ", "KOTA ADM. ", "KOTA ADM ",
    "KABUPATEN ADMINISTRASI ", "KAB. ADM. ", "KAB ADM ",
    "KOTA ", "KABUPATEN ", "KAB. ", "KAB ",
)
# District name prefixes to strip.
_DISTRICT_PREFIXES = ("KECAMATAN ", "KEC. ", "KEC ", "DISTRIK ", "KAPANEWON ", "KEMANTREN ")


def village_status(code):
    """Village-level designation from the 10-digit code, or '' for the ~0.1%
    with a non-standard code (dirty/objectid-suffixed rows).

    Base is the Kemendagri 7th-digit convention (1=Kelurahan, 2=Desa), with
    regional names overriding it:
    - Aceh (prov 11): "Gampong" everywhere, "Kute" in Aceh Tenggara (kab 1102).
    - Sumatera Barat (prov 13): the desa-equivalent is "Nagari" (kelurahan stay
      kelurahan).

    NOTE: Maluku's Negeri (adat villages, e.g. Batu Merah / Soya) are NOT
    distinguishable here — Kemendagri codes them as plain Desa (7th digit 2) and
    the data carries no adat/jenis field, so they fall under "Desa". Separating
    them would need an external Negeri registry.
    """
    if not (code and len(code) >= 10 and code[:10].isdigit()):
        return ""
    prov, kab = code[:2], code[:4]
    if prov == "11":  # Aceh
        return "Kute" if kab == "1102" else "Gampong"
    base = {"1": "Kelurahan", "2": "Desa"}.get(code[6], "")
    if prov == "13" and base == "Desa":  # Sumatera Barat
        return "Nagari"
    return base


def _collapse_spaced(s):
    """Collapse a name written as spaced single letters ("P A P U A" -> "PAPUA").
    Only fires when every whitespace token is one alphabetic character."""
    toks = s.split()
    if len(toks) > 1 and all(len(t) == 1 and t.isalpha() for t in toks):
        return "".join(toks)
    return s


def _cap_word(w):
    if w.upper() in _KEEP_UPPER:
        return w.upper()
    return re.sub(r"[A-Za-z']+", lambda m: m.group(0).capitalize(), w)


def title_case(s):
    """UPPERCASE region name -> Title Case (MAKASSAR -> Makassar), keeping known
    acronyms (DKI JAKARTA -> DKI Jakarta) and collapsing spaced letters."""
    return " ".join(_cap_word(w) for w in _collapse_spaced((s or "").strip()).split())


def _strip_prefix(up, prefixes):
    for pre in prefixes:
        if up.startswith(pre):
            return up[len(pre):]
    return up


def province_status(code):
    """Province designation(s) from its 2-digit code. Aceh is both; joined with
    Daerah Istimewa first."""
    tags = []
    if code in _PROV_ISTIMEWA:
        tags.append("Daerah Istimewa")
    if code in _PROV_KHUSUS:
        tags.append("Daerah Khusus")
    return ", ".join(tags) if tags else "Provinsi"


def district_status(code):
    """Kecamatan / Distrik / Kapanewon / Kemantren from the 6-digit code."""
    prov, kab = code[:2], code[:4]
    if prov in _PAPUA_PROVS:
        return "Distrik"
    if prov == _DIY_PROV:
        return "Kemantren" if kab == _YOGYA_KOTA else "Kapanewon"
    return "Kecamatan"


def regency_status(code, raw_upper):
    """(status, is_administrative). DKI's kota/kab are 'administrasi'; otherwise
    fall back to the "KOTA " name prefix (kota) vs none (kabupaten)."""
    if code in _JKT_KOTA:
        return "Kota Administrasi", True
    if code == _JKT_KAB:
        return "Kabupaten Administrasi", True
    if raw_upper.startswith("KOTA "):
        return "Kota", False
    return "Kabupaten", False


def name_and_status(level, raw, code=None):
    """(clean_name, status) for a region. status is one of: Provinsi / Daerah
    Istimewa / Daerah Khusus (province, comma-joined if both) · Kota / Kabupaten
    / Kota Administrasi / Kabupaten Administrasi (regency) · Kecamatan / Distrik
    / Kapanewon / Kemantren (district) · Kelurahan / Desa (village)."""
    raw = (raw or "").strip()
    up = raw.upper()
    code = code or ""
    if level == "province":
        return title_case(raw), province_status(code)
    if level == "regency":
        status, _ = regency_status(code, up)
        return title_case(_strip_prefix(up, _REGENCY_PREFIXES)), status
    if level == "district":
        return title_case(_strip_prefix(up, _DISTRICT_PREFIXES)), district_status(code)
    return title_case(raw), village_status(code)  # village
