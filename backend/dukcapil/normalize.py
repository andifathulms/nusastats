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

# Maluku desa-equivalent terms, by kabupaten (all verified against the data —
# these kabupaten have zero Negeri/Ohoi exceptions, every "2" unit takes the
# adat term). Kota Ambon is a Negeri/Desa mix at the same code digit, so it
# needs a name list (below).
_MALUKU_NEGERI_KAB = {"8101", "8105", "8106"}  # Maluku Tengah, Seram Bagian Timur/Barat
_MALUKU_OHOI_KAB = {"8102", "8172"}  # Maluku Tenggara, Kota Tual (Kei/Evav)


def _vnorm(s):
    return re.sub(r"[^a-z0-9]", "", (s or "").lower())


# Kota Ambon (8171) Negeri, keyed by (6-digit kecamatan code, normalized name).
# Ambon mixes Negeri and Desa at the same 7th digit (2), so Negeri can't be read
# off the code — this list is reconciled against the live data. Nusaniwe &
# Urimessing are Negeri that the source codes as kelurahan (7th digit 1, with
# duplicate rows); matching by name resolves both. Leitimur Selatan (817105) is
# 100% Negeri.
_AMBON_NEGERI = (
    {("817101", n) for n in ("nusaniwe", "urimessing", "latuhalat", "seilale", "amahusu")}
    | {("817102", n) for n in ("batumerah", "hativekecil", "soya")}
    | {("817103", n) for n in ("passo", "halong")}
    | {("817104", n) for n in ("hativebesar", "laha", "rumahtiga", "tawiri")}
    | {("817105", n) for n in ("ema", "hatalai", "hukurila", "hutumury", "kilang", "leahari", "naku", "rutong")}
)

# Regency name prefixes to strip (longest first) before title-casing.
_REGENCY_PREFIXES = (
    "KOTA ADMINISTRASI ", "KOTA ADM. ", "KOTA ADM ",
    "KABUPATEN ADMINISTRASI ", "KAB. ADM. ", "KAB ADM ",
    "KOTA ", "KABUPATEN ", "KAB. ", "KAB ",
)
# District name prefixes to strip.
_DISTRICT_PREFIXES = ("KECAMATAN ", "KEC. ", "KEC ", "DISTRIK ", "KAPANEWON ", "KEMANTREN ")


def village_status(code, name=""):
    """Village-level designation from the 10-digit code (+ name, needed only for
    Kota Ambon), or '' for the ~0.1% with a non-standard code.

    Base is the Kemendagri 7th-digit convention (1=Kelurahan, 2=Desa; 3=adat),
    with regional terms overriding it:
    - Papua (91-96): 2=Kampung, 3=Kampung Adat (only Kab Jayapura 9103 uses 3,
      its 14 units), 1=Kelurahan.
    - Maluku (81): Negeri in Maluku Tengah / Seram Bagian Timur+Barat; Ohoi in
      Maluku Tenggara / Kota Tual; Kota Ambon is a Negeri/Desa mix resolved by
      name (_AMBON_NEGERI); the rest plain Desa. All 1=Kelurahan.
    - Aceh (11): Gampong, Kute in Aceh Tenggara (kab 1102).
    - Sumatera Barat (13): 2=Nagari (kelurahan stay kelurahan).
    """
    if not (code and len(code) >= 10 and code[:10].isdigit()):
        return ""
    prov, kab, d = code[:2], code[:4], code[6]
    if prov in _PAPUA_PROVS:
        if d == "1":
            return "Kelurahan"
        return "Kampung Adat" if d == "3" else "Kampung"
    if prov == "11":  # Aceh
        return "Kute" if kab == "1102" else "Gampong"
    if prov == "81":  # Maluku
        if kab == "8171" and (code[:6], _vnorm(name)) in _AMBON_NEGERI:
            return "Negeri"  # incl. the two kelurahan-coded Negeri (Nusaniwe/Urimessing)
        if d == "1":
            return "Kelurahan"
        if d == "2":
            if kab in _MALUKU_NEGERI_KAB:
                return "Negeri"
            if kab in _MALUKU_OHOI_KAB:
                return "Ohoi"
            return "Desa"
        return ""
    base = {"1": "Kelurahan", "2": "Desa"}.get(d, "")
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
    # village: Papua's Kampung Adat carry a "DESA ADAT " name prefix (7th
    # digit 3) — strip it; the term lives in `status`.
    d = code[6] if len(code) >= 10 and code[:10].isdigit() else ""
    clean = up[len("DESA ADAT "):] if d == "3" and up.startswith("DESA ADAT ") else raw
    return title_case(clean), village_status(code, raw)
