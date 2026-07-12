"""Build the DJPK -> Kemendagri wilayah-code crosswalk by name match.

DJPK numbers regions with its own sequential scheme (province 01..38, pemda
00/01..NN) that has no arithmetic relation to the Kemendagri wilayah codes
(prov 2-digit, kab/kota 4-digit) that `dukcapil` — and the rest of NusaStats —
join on. We resolve the mapping by matching region NAMES against the ingested
`DukcapilRegion` rows:

  1. provinces: DJPK province name  -> DukcapilRegion(level=province) 2-digit code
  2. regencies: within the matched province, DJPK kab/kota name
                -> DukcapilRegion(level=regency) 4-digit code

Matching is exact on a normalized key (uppercased, type-prefix and punctuation
stripped, KEP.->KEPULAUAN). Anything that does not match is left blank with
`match_method=""` and REPORTED — never guessed — honouring the project's
"explicit, never silent partial" rule. If dukcapil has not been ingested, the
crosswalk is a no-op (all regions stay unmatched) and says so.

This is source-join metadata, not finance data: it changes no stored figure,
only which Kemendagri region a figure is attributed to.
"""

import re

# Words that only denote the administrative TYPE, not the place identity.
_TYPE_TOKENS = {
    "PROV", "PROVINSI", "KAB", "KABUPATEN", "KOTA", "ADM", "ADMINISTRASI",
}


def normalize_name(name):
    """Bare comparison key: uppercase, drop type tokens & punctuation, expand
    KEP.->KEPULAUAN, collapse to alnum. 'Kab. Badung' -> 'BADUNG';
    'Prov. Kepulauan Riau' -> 'KEPULAUANRIAU'; 'Kota Denpasar' -> 'DENPASAR'."""
    s = (name or "").upper().replace(".", " ")
    s = re.sub(r"\bKEP\b", "KEPULAUAN", s)
    tokens = [t for t in re.split(r"[^A-Z0-9]+", s) if t and t not in _TYPE_TOKENS]
    return "".join(tokens)


def _dukcapil_index():
    """Return (prov_by_norm, reg_by_prov_norm, latest_period) or None if the
    dukcapil app / data is unavailable.

      prov_by_norm:      {normalized_prov_name: prov_code}       (2-digit)
      reg_by_prov_norm:  {prov_code: {normalized_reg_name: reg_code}} (4-digit)
    """
    try:
        from dukcapil.models import DukcapilRegion
    except Exception:
        return None

    latest = (
        DukcapilRegion.objects.filter(level="province")
        .order_by("-period")
        .values_list("period", flat=True)
        .first()
    )
    if not latest:
        return None

    prov_by_norm = {}
    for code, name in DukcapilRegion.objects.filter(
        level="province", period=latest
    ).values_list("code", "name"):
        prov_by_norm.setdefault(normalize_name(name), code)

    reg_by_prov = {}
    for code, name, prov_code in DukcapilRegion.objects.filter(
        level="regency", period=latest
    ).values_list("code", "name", "prov_code"):
        reg_by_prov.setdefault(prov_code, {}).setdefault(normalize_name(name), code)

    return prov_by_norm, reg_by_prov, latest


def build_crosswalk():
    """Resolve `kemendagri_code`/`match_method` for every ApbdRegion.

    Returns a dict summary: {matched, unmatched, total, period, unmatched_names}.
    Idempotent — safe to re-run after new regions or a fresh dukcapil crawl.
    """
    from .models import ApbdRegion

    idx = _dukcapil_index()
    regions = list(ApbdRegion.objects.all())
    if idx is None:
        return {
            "matched": 0,
            "unmatched": len(regions),
            "total": len(regions),
            "period": None,
            "unmatched_names": [],
            "note": "dukcapil regions not ingested; crosswalk skipped",
        }

    prov_by_norm, reg_by_prov, period = idx

    # Pass 1: provinces. Build DJPK-prov -> kemendagri-prov code map as we go,
    # so regencies can be matched within the right province.
    djpkprov_to_kemenprov = {}
    updated = []
    unmatched_names = []

    for r in regions:
        if r.level != "province":
            continue
        key = normalize_name(r.name)
        code = prov_by_norm.get(key)
        if code:
            r.kemendagri_code = code
            r.match_method = "name-exact"
            r.matched_name = r.name
            djpkprov_to_kemenprov[r.djpk_prov] = code
        else:
            r.kemendagri_code = ""
            r.match_method = ""
            unmatched_names.append(f"[prov] {r.djpk_code} {r.name}")
        updated.append(r)

    # Pass 2: regencies, scoped to their province's kemendagri code.
    for r in regions:
        if r.level != "regency":
            continue
        kemenprov = djpkprov_to_kemenprov.get(r.djpk_prov)
        code = None
        if kemenprov:
            code = reg_by_prov.get(kemenprov, {}).get(normalize_name(r.name))
        if code:
            r.kemendagri_code = code
            r.match_method = "name-exact"
            r.matched_name = r.name
        else:
            r.kemendagri_code = ""
            r.match_method = ""
            unmatched_names.append(f"[reg]  {r.djpk_code} {r.name}")
        updated.append(r)

    ApbdRegion.objects.bulk_update(
        updated, ["kemendagri_code", "match_method", "matched_name"]
    )

    matched = sum(1 for r in updated if r.kemendagri_code)
    return {
        "matched": matched,
        "unmatched": len(updated) - matched,
        "total": len(updated),
        "period": period,
        "unmatched_names": unmatched_names,
    }
