"""Second polygon parts that the Dukcapil ArcGIS layer ships as separate rows.

Some regions are drawn as two features, and each feature carries a full copy
of the region's statistics. The ingest keeps both (the second under its
fallback code `{code}-{objectid}`, see ingest._unique_code), so nothing is
lost; consumers that count or rank regions must count such a twin once.
A row is a twin only when the base code exists at the same level and period
and every attribute except the shape fields is identical."""

SHAPE_KEYS = {"objectid", "st_area(shape)", "st_length(shape)"}


def _stats(attrs):
    return {k: v for k, v in (attrs or {}).items() if k not in SHAPE_KEYS}


def polygon_twins(qs):
    """{twin code: base code} for the rows of `qs` (one level and period) that
    duplicate another row's statistics."""
    candidates = list(qs.filter(code__contains="-").values("code", "attributes"))
    if not candidates:
        return {}
    bases = {c["code"].split("-", 1)[0] for c in candidates}
    base_attrs = dict(qs.filter(code__in=bases).values_list("code", "attributes"))
    twins = {}
    for c in candidates:
        base = c["code"].split("-", 1)[0]
        if base in base_attrs and _stats(base_attrs[base]) == _stats(c["attributes"]):
            twins[c["code"]] = base
    return twins
