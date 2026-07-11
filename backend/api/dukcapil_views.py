"""Read API for Kemendagri/Dukcapil population data (`/api/dukcapil/`).

A source-separated parallel to the BPS `stats` API: it reads
`dukcapil.DukcapilRegion` (raw ArcGIS attributes in JSONB) and the
`DukcapilIndicator` catalog, and reuses the pure analytics helpers in
`api.analytics` (rank_rows, distribution, pearson, percentile_rank) by
extracting `{code: value}` maps from JSONB — the same shape the BPS ranking
endpoints use, so nothing about the BPS/`stats` stack is touched.
"""

import re

from django.db.models import Count, F
from django.db.models.fields.json import KeyTextTransform
from rest_framework.decorators import api_view
from rest_framework.response import Response

from catalog.models import Domain
from dukcapil.derived import DERIVED, DERIVED_BY_FIELD
from dukcapil.derived import meta as derived_meta
from dukcapil.indicators import GROUP_ORDER
from dukcapil.models import DukcapilFetchLog, DukcapilIndicator, DukcapilLevel, DukcapilRegion
from dukcapil.values import region_value, to_number

from .analytics import distribution, pearson, percentile_rank, rank_rows
from .dukcapil_serializers import DukcapilIndicatorSerializer, DukcapilRegionSerializer

# Headline indicators summed for the overview cards.
_SUMMARY_FIELDS = ["jumlah_penduduk", "jumlah_kk", "pria", "wanita", "jml_lahir", "jml_meninggal"]


def _periods():
    """All snapshot periods, newest first."""
    return list(
        DukcapilRegion.objects.order_by("-period").values_list("period", flat=True).distinct()
    )


def _resolve_period(request):
    """The period to read: an explicit ?period= (if it exists) else the latest."""
    periods = _periods()
    want = request.query_params.get("period")
    if want and want in periods:
        return want, periods
    return (periods[0] if periods else None), periods


def _apply_ancestor(qs, request):
    """Narrow to the deepest selected ancestor (kec > kab > prov). This makes
    filtering adaptive: picking only a province, or province+kabupaten, both
    work — a level is filtered by whichever ancestor code is given, not by
    requiring its immediate parent. Returns (queryset, applied_scope)."""
    for param, field in (("kec", "kec_code"), ("kab", "kab_code"), ("prov", "prov_code")):
        val = request.query_params.get(param)
        if val:
            return qs.filter(**{field: val}), {param: val}
    return qs, {}


# Indicator fields backed by a real model column instead of the raw
# `attributes` JSONB (computed post-ingest — currently just the BIG polygon
# area). Sourced from the column in queries and per-region reads alike.
_COLUMN_FIELDS = {"luas_big"}


def _field_expr(field):
    """Query expression for one indicator field: the model column when it's a
    computed field, else the raw key pulled out of the attributes JSONB."""
    return F(field) if field in _COLUMN_FIELDS else KeyTextTransform(field, "attributes")


def _region_field(region, field):
    """One region's value for `field` — from the column for computed fields,
    else parsed out of its raw attributes."""
    return getattr(region, field) if field in _COLUMN_FIELDS else region_value(region.attributes, field)


def _value_map(qs, field):
    """{code: (name, value)} for one field, pulled without loading the whole
    attributes blob per row (extracted as just that key / column)."""
    out = {}
    for code, name, raw in qs.annotate(_v=_field_expr(field)).values_list(
        "code", "name", "_v"
    ):
        v = to_number(raw)
        if v is not None:
            out[code] = (name, v)
    return out


def _extract(qs, fields):
    """{code: (name, {field: value})} for several fields in one query (each
    extracted from its own key/column). Used where a row needs more than one
    field at once — e.g. a value and its % denominator, or the several raw
    inputs of a derived metric."""
    ann = {f"f{i}": _field_expr(f) for i, f in enumerate(fields)}
    out = {}
    for row in qs.annotate(**ann).values("code", "name", *ann.keys()):
        vals = {}
        for i, f in enumerate(fields):
            v = to_number(row[f"f{i}"])
            if v is not None:
                vals[f] = v
        out[row["code"]] = (row["name"], vals)
    return out


def _metric_values(qs, field):
    """{code: (name, value)} for either a raw JSON field or a derived
    indicator (computed from its required raw fields per region)."""
    spec = DERIVED_BY_FIELD.get(field)
    if not spec:
        return _value_map(qs, field)
    out = {}
    for code, (name, vals) in _extract(qs, spec["requires"]).items():
        val = spec["fn"](vals)
        if val is not None:
            out[code] = (name, val)
    return out


@api_view(["GET"])
def summary(request):
    """`/api/dukcapil/summary/` — per-level region counts and national
    aggregates (summed from provinces on the fly; no synthetic national row
    is stored)."""
    period, periods = _resolve_period(request)
    scope = DukcapilRegion.objects.filter(period=period)
    counts = {
        row["level"]: row["c"]
        for row in scope.order_by().values("level").annotate(c=Count("id"))
    }
    by_level = [
        {"level": level, "label": label, "regions": counts.get(level, 0)}
        for level, label in DukcapilLevel.choices
    ]

    provinces = scope.filter(level=DukcapilLevel.PROVINCE)
    totals = {}
    for field in _SUMMARY_FIELDS:
        totals[field] = round(sum(v for _, v in _value_map(provinces, field).values()))

    last = DukcapilFetchLog.objects.filter(period=period).order_by("-fetched_at").first()
    return Response(
        {
            "source": "Kemendagri / Ditjen Dukcapil",
            "period": period,
            "periods": periods,
            "by_level": by_level,
            "national_totals": totals,
            "last_fetched_at": last.fetched_at if last else None,
        }
    )


@api_view(["GET"])
def indicators(request):
    """`/api/dukcapil/indicators/` — the catalog, grouped for the picker.
    Includes derived demographic indicators (sex ratio, dependency ratio,
    density, % Sarjana, KTP coverage, …) alongside the raw fields, each
    flagged `derived` so the UI can badge them and disable the % toggle."""
    rows = list(DukcapilIndicator.objects.all())
    by_group = {}
    for r in rows:
        d = DukcapilIndicatorSerializer(r).data
        d["derived"] = False
        by_group.setdefault(r.group, []).append(d)
    for spec in DERIVED:
        by_group.setdefault(spec["group"], []).append(derived_meta(spec))

    # Derived group ordering: keep known groups in place, add "Rasio & Turunan".
    order = list(GROUP_ORDER)
    if "Rasio & Turunan" not in order:
        order.insert(order.index("Kelompok Umur") + 1 if "Kelompok Umur" in order else len(order),
                     "Rasio & Turunan")
    groups = [{"group": g, "indicators": by_group[g]} for g in order if g in by_group]
    for g, items in by_group.items():
        if g not in order:
            groups.append({"group": g, "indicators": items})
    return Response({"count": len(rows) + len(DERIVED), "groups": groups})


@api_view(["GET"])
def regions(request):
    """`/api/dukcapil/regions/?level=&parent=&search=&limit=` — region
    picker/list. Defaults to provinces; `parent` narrows to one parent's
    children (essential for the 83k village level)."""
    period, _ = _resolve_period(request)
    qs = DukcapilRegion.objects.filter(period=period)
    level = request.query_params.get("level", DukcapilLevel.PROVINCE)
    qs = qs.filter(level=level)
    qs, _scope = _apply_ancestor(qs, request)
    search = request.query_params.get("search")
    if search:
        qs = qs.filter(name__icontains=search)
    limit = int(request.query_params.get("limit", 1000))
    qs = qs.select_related("parent").order_by("code")[:limit]
    return Response(DukcapilRegionSerializer(qs, many=True).data)


@api_view(["GET"])
def region_detail(request, code):
    """`/api/dukcapil/regions/{code}/` — one region's full indicator profile,
    grouped, each with the region's rank/percentile among peers at its level."""
    period, _ = _resolve_period(request)
    region = (
        DukcapilRegion.objects.filter(code=code, period=period).select_related("parent").first()
    )
    if not region:
        return Response({"detail": "Unknown region code."}, status=404)

    catalog = list(DukcapilIndicator.objects.all())
    # Peers = regions at the same level in the same period. For regions with a
    # parent (regency, district, village) that means same-parent siblings —
    # both far cheaper than scanning all 83k villages per indicator, and more
    # meaningful ("ranks Nth among desa in its kecamatan"). Province -> all.
    peers_qs = DukcapilRegion.objects.filter(level=region.level, period=period)
    if region.parent_code:
        peers_qs = peers_qs.filter(parent_code=region.parent_code)
    peer_scope = "wilayah setingkat dalam induk yang sama" if region.parent_code else "seluruh wilayah setingkat"

    # One combined pass over the peer set (all indicator fields annotated),
    # rather than one full scan per indicator.
    fields = [ind.field for ind in catalog]
    ann = {f"f{i}": _field_expr(f) for i, f in enumerate(fields)}
    peer_values = {f: [] for f in fields}
    derived_peer_values = {d["field"]: [] for d in DERIVED}
    for row in peers_qs.annotate(**ann).values(*ann.keys()):
        rowvals = {}
        for i, f in enumerate(fields):
            v = to_number(row[f"f{i}"])
            if v is not None:
                peer_values[f].append(v)
                rowvals[f] = v
        for d in DERIVED:  # derived inputs are a subset of the raw fields
            dv = d["fn"](rowvals)
            if dv is not None:
                derived_peer_values[d["field"]].append(dv)

    by_group = {}
    for ind in catalog:
        value = _region_field(region, ind.field)
        if value is None:
            continue
        rank, of, pct = percentile_rank(value, peer_values[ind.field])
        by_group.setdefault(ind.group, []).append(
            {
                "field": ind.field,
                "label_id": ind.label_id,
                "unit": ind.unit,
                "value": value,
                "rank": rank,
                "of": of,
                "percentile": pct,
                "derived": False,
            }
        )

    # Derived demographic metrics for this region, ranked against peers.
    for d in DERIVED:
        rvals = {k: _region_field(region, k) for k in d["requires"]}
        value = d["fn"](rvals)
        if value is None:
            continue
        rank, of, pct = percentile_rank(value, derived_peer_values[d["field"]])
        by_group.setdefault(d["group"], []).append(
            {
                "field": d["field"],
                "label_id": d["label_id"],
                "unit": d["unit"],
                "value": value,
                "rank": rank,
                "of": of,
                "percentile": pct,
                "derived": True,
            }
        )

    order = list(GROUP_ORDER)
    if "Rasio & Turunan" not in order:
        order.append("Rasio & Turunan")
    groups = [{"group": g, "indicators": by_group[g]} for g in order if g in by_group]
    return Response(
        {
            "region": {
                "code": region.code,
                "level": region.level,
                "name": region.name,
                "status": region.status,
                "parent_code": region.parent_code,
                "parent_name": region.parent.name if region.parent else None,
                "nama_prop": region.nama_prop,
                "nama_kab": region.nama_kab,
                "nama_kec": region.nama_kec,
            },
            "peer_scope": peer_scope,
            "groups": groups,
        }
    )


@api_view(["GET"])
def rank(request):
    """`/api/dukcapil/rank/?indicator=&level=&parent=&order=&limit=` — rank
    regions at a level by one indicator, plus distribution stats. `parent`
    keeps the village level usable (rank desa within one kabupaten)."""
    field = request.query_params.get("indicator", "jumlah_penduduk")
    spec = DERIVED_BY_FIELD.get(field)
    ind = None if spec else DukcapilIndicator.objects.filter(field=field).first()
    if not spec and not ind:
        return Response({"detail": f"Unknown indicator {field!r}."}, status=404)

    level = request.query_params.get("level", DukcapilLevel.PROVINCE)
    order = request.query_params.get("order", "desc")
    period, _ = _resolve_period(request)
    qs = DukcapilRegion.objects.filter(level=level, period=period)
    qs, scope = _apply_ancestor(qs, request)

    percent_of = request.query_params.get("percent_of")
    if spec:
        # Derived metrics are already ratios/rates — no percentage base.
        percent_of = None
        # For small ratios (e.g. density = penduduk / luas) surface the operand
        # values, labelled, so a tooltip can show what produced the number.
        parts = list(spec["requires"]) if len(spec["requires"]) <= 3 else None
        part_meta = (
            {i.field: (i.label_id, i.unit) for i in DukcapilIndicator.objects.filter(field__in=parts)}
            if parts else {}
        )
        rows = []
        for code, (name, vals) in _extract(qs, spec["requires"]).items():
            v = spec["fn"](vals)
            if v is None:
                continue
            row = {"domain_id": code, "domain_name": name, "value": v}
            if parts:
                row["components"] = [
                    {"field": f, "value": vals[f],
                     "label": part_meta.get(f, (f, ""))[0], "unit": part_meta.get(f, (f, ""))[1]}
                    for f in parts if vals.get(f) is not None
                ]
            rows.append(row)
        indicator_data, unit = derived_meta(spec), spec["unit"]
    elif percent_of and percent_of != field:
        # Express the value as a percentage of another field (usually
        # jumlah_penduduk) per region — e.g. "% penduduk beragama Islam".
        rows = []
        for code, (name, vals) in _extract(qs, [field, percent_of]).items():
            v, base = vals.get(field), vals.get(percent_of)
            if v is None or not base:
                continue
            rows.append({"domain_id": code, "domain_name": name, "value": round(v / base * 100, 2)})
        indicator_data, unit = DukcapilIndicatorSerializer(ind).data, "%"
    else:
        percent_of = None
        rows = [
            {"domain_id": code, "domain_name": name, "value": v}
            for code, (name, v) in _value_map(qs, field).items()
        ]
        indicator_data, unit = DukcapilIndicatorSerializer(ind).data, ind.unit

    stats = distribution([r["value"] for r in rows])
    full = rank_rows(rows, order=order)
    total = len(full)

    # Pagination: distribution stats are over the full set; only a page of
    # ranked rows is returned.
    offset = max(0, int(request.query_params.get("offset", 0)))
    limit = request.query_params.get("limit")
    page = full[offset : offset + int(limit)] if limit else full[offset:]

    # Enrich the page rows with status + denormalized ancestor names so the UI
    # can show where each region sits (kab -> its prov; kec -> prov + kab; desa
    # -> prov + kab + kec). One query over just the page's codes.
    meta = {
        row[0]: row[1:]
        for row in qs.filter(code__in=[r["domain_id"] for r in page]).values_list(
            "code", "status", "nama_prop", "nama_kab", "nama_kec"
        )
    }
    for r in page:
        m = meta.get(r["domain_id"])
        r["status"] = (m[0] if m else "") or ""
        r["nama_prop"] = (m[1] if m else "") or ""
        r["nama_kab"] = (m[2] if m else "") or ""
        r["nama_kec"] = (m[3] if m else "") or ""

    return Response(
        {
            "indicator": indicator_data,
            "level": level,
            "scope": scope,
            "order": order,
            "percent_of": percent_of,
            "unit": unit,
            "stats": stats,
            "total": total,
            "offset": offset,
            "results": page,
        }
    )


@api_view(["GET"])
def correlate(request):
    """`/api/dukcapil/correlate/?x=&y=&level=` — two indicators across regions
    at a level, one point per region, plus the Pearson correlation."""
    x_field = request.query_params.get("x")
    y_field = request.query_params.get("y")
    if not x_field or not y_field:
        return Response({"detail": "x and y indicator params are required."}, status=400)

    def resolve(f):
        spec = DERIVED_BY_FIELD.get(f)
        if spec:
            return derived_meta(spec)
        ind = DukcapilIndicator.objects.filter(field=f).first()
        return DukcapilIndicatorSerializer(ind).data if ind else None

    x_meta, y_meta = resolve(x_field), resolve(y_field)
    if not x_meta or not y_meta:
        return Response({"detail": "Unknown x or y indicator."}, status=404)

    level = request.query_params.get("level", DukcapilLevel.PROVINCE)
    period, _ = _resolve_period(request)
    qs = DukcapilRegion.objects.filter(level=level, period=period)
    qs, _scope = _apply_ancestor(qs, request)

    x_by = _metric_values(qs, x_field)
    y_by = _metric_values(qs, y_field)
    status_by = dict(qs.values_list("code", "status"))
    results = [
        {"domain_id": c, "domain_name": x_by[c][0], "status": status_by.get(c, ""), "x": x_by[c][1], "y": y_by[c][1]}
        for c in x_by
        if c in y_by
    ]
    results.sort(key=lambda p: p["x"])
    r = pearson([p["x"] for p in results], [p["y"] for p in results])

    return Response(
        {
            "x": x_meta,
            "y": y_meta,
            "level": level,
            "n": len(results),
            "r": r,
            "results": results,
        }
    )


def _norm(s):
    return re.sub(r"[^a-z0-9]", "", (s or "").lower())


def bps_regency_status(domain_id):
    """BPS/Kemendagri convention: the kab-number (3rd-4th digit) >= 71 => Kota."""
    try:
        return "Kota" if int(domain_id[2:4]) >= 71 else "Kabupaten"
    except (ValueError, IndexError):
        return ""


def _status_family(s):
    """Collapse a regency status to its family so administrative variants match
    the plain BPS-derived status: 'Kota Administrasi' -> kota, 'Kabupaten
    Administrasi' -> kabupaten."""
    s = (s or "").lower()
    if s.startswith("kota"):
        return "kota"
    if s.startswith("kab"):
        return "kabupaten"
    return s


# BPS regency domain_id -> Dukcapil regency code, for the four regencies whose
# BPS and Kemendagri names diverge enough that normalized-name matching fails
# (three spelling variants + one rename). Hand-verified against the Dukcapil
# catalog. Everything else resolves by (province, status, name) or a national
# (status, name) match, so only genuine renames need to live here.
_REGENCY_CROSSWALK = {
    "1277": "1277",  # Padangsidimpuan -> Padang Sidempuan
    "7108": "7109",  # Siau Tagulandang Biaro -> Kep. Siau Tagulandang Biaro
    "7309": "7310",  # Pangkajene Dan Kepulauan -> Pangkajene Kepulauan
    "8101": "8103",  # Maluku Tenggara Barat -> Kepulauan Tanimbar (renamed)
}


def _resolve_dukcapil_regency(domain_id, bps_name, period):
    """A BPS regency domain_id -> the matching Dukcapil regency.

    BPS and Kemendagri number regencies DIFFERENTLY within most provinces, so
    matching on code identity is wrong: a BPS code routinely collides with a
    *different* Kemendagri region (e.g. BPS 7309 Pangkajene would hit Dukcapil
    7309 Maros — a real, silent mismatch). We instead match on the identity of
    the region itself — normalized name + Kota/Kabupaten status — scoped to the
    province first, then nationally (the Papua reorg moved regencies onto new
    province codes, and DKI labels its kota as 'Kabupaten'), with a small
    hand-verified crosswalk for the few genuine renames/spelling splits."""
    xcode = _REGENCY_CROSSWALK.get(domain_id)
    if xcode:
        r = DukcapilRegion.objects.filter(level="regency", period=period, code=xcode).first()
        if r:
            return r
    status, key = bps_regency_status(domain_id), _norm(bps_name)
    if not key:
        return None
    regs = list(DukcapilRegion.objects.filter(level="regency", period=period))
    fam = _status_family(status)
    prov = domain_id[:2]
    # 1) same province + status + name (resolves the vast majority)
    m = [r for r in regs if r.code[:2] == prov and _status_family(r.status) == fam and _norm(r.name) == key]
    if len(m) == 1:
        return m[0]
    # 2) national + status + name (Papua reorg: regency moved to a new province)
    m = [r for r in regs if _status_family(r.status) == fam and _norm(r.name) == key]
    if len(m) == 1:
        return m[0]
    # 3) national name only, last resort (DKI kota are labeled 'Kabupaten')
    m = [r for r in regs if _norm(r.name) == key]
    if len(m) == 1:
        return m[0]
    return None


@api_view(["GET"])
def regency_bridge(request, domain_id):
    """`/api/dukcapil/regency-bridge/<bps_domain_id>/` — bridge a BPS regency
    to the Dukcapil side: the matched Dukcapil regency plus its kecamatan (with
    population + village counts), so the BPS region page can drill into the
    Dukcapil administrative tree. Villages per kecamatan come from the rank
    endpoint (level=village&kec=<code>)."""
    period, _ = _resolve_period(request)
    bps = Domain.objects.filter(domain_id=domain_id).first()
    reg = _resolve_dukcapil_regency(domain_id, bps.domain_name if bps else "", period)
    if not reg:
        return Response({"bps_domain_id": domain_id, "dukcapil": None, "districts": []})

    code = reg.code
    districts = DukcapilRegion.objects.filter(level="district", period=period, kab_code=code)
    pop = _value_map(districts, "jumlah_penduduk")
    vcounts = dict(
        DukcapilRegion.objects.filter(level="village", period=period, kab_code=code)
        .values("kec_code")
        .order_by()
        .annotate(c=Count("id"))
        .values_list("kec_code", "c")
    )
    dist = [
        {
            "code": d["code"],
            "name": d["name"],
            "status": d["status"],
            "population": pop.get(d["code"], (None, None))[1],
            "village_count": vcounts.get(d["code"], 0),
        }
        for d in districts.values("code", "name", "status")
    ]
    dist.sort(key=lambda x: -(x["population"] or 0))
    return Response(
        {
            "bps_domain_id": domain_id,
            "dukcapil": {
                "code": reg.code,
                "name": reg.name,
                "status": reg.status,
                "population": region_value(reg.attributes, "jumlah_penduduk"),
                "district_count": len(dist),
                "village_count": sum(vcounts.values()),
            },
            "districts": dist,
        }
    )
