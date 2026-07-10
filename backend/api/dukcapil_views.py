"""Read API for Kemendagri/Dukcapil population data (`/api/dukcapil/`).

A source-separated parallel to the BPS `stats` API: it reads
`dukcapil.DukcapilRegion` (raw ArcGIS attributes in JSONB) and the
`DukcapilIndicator` catalog, and reuses the pure analytics helpers in
`api.analytics` (rank_rows, distribution, pearson, percentile_rank) by
extracting `{code: value}` maps from JSONB — the same shape the BPS ranking
endpoints use, so nothing about the BPS/`stats` stack is touched.
"""

from django.db.models import Count
from django.db.models.fields.json import KeyTextTransform
from rest_framework.decorators import api_view
from rest_framework.response import Response

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


def _value_map(qs, field):
    """{code: (name, value)} for one JSON field, pulled without loading the
    whole attributes blob per row (KeyTextTransform extracts just the key)."""
    out = {}
    for code, name, raw in qs.annotate(_v=KeyTextTransform(field, "attributes")).values_list(
        "code", "name", "_v"
    ):
        v = to_number(raw)
        if v is not None:
            out[code] = (name, v)
    return out


def _extract(qs, fields):
    """{code: (name, {field: value})} for several JSON fields in one query
    (each field extracted with its own KeyTextTransform). Used where a row
    needs more than one field at once — e.g. a value and its % denominator."""
    ann = {f"f{i}": KeyTextTransform(f, "attributes") for i, f in enumerate(fields)}
    out = {}
    for row in qs.annotate(**ann).values("code", "name", *ann.keys()):
        vals = {}
        for i, f in enumerate(fields):
            v = to_number(row[f"f{i}"])
            if v is not None:
                vals[f] = v
        out[row["code"]] = (row["name"], vals)
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
    """`/api/dukcapil/indicators/` — the catalog, grouped for the picker."""
    rows = list(DukcapilIndicator.objects.all())
    by_group = {}
    for r in rows:
        by_group.setdefault(r.group, []).append(DukcapilIndicatorSerializer(r).data)
    groups = [
        {"group": g, "indicators": by_group[g]}
        for g in GROUP_ORDER
        if g in by_group
    ]
    # Any groups not in the explicit order (defensive) appended at the end.
    for g, items in by_group.items():
        if g not in GROUP_ORDER:
            groups.append({"group": g, "indicators": items})
    return Response({"count": len(rows), "groups": groups})


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
    ann = {f"f{i}": KeyTextTransform(f, "attributes") for i, f in enumerate(fields)}
    peer_values = {f: [] for f in fields}
    for row in peers_qs.annotate(**ann).values(*ann.keys()):
        for i, f in enumerate(fields):
            v = to_number(row[f"f{i}"])
            if v is not None:
                peer_values[f].append(v)

    by_group = {}
    for ind in catalog:
        value = region_value(region.attributes, ind.field)
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
            }
        )

    groups = [{"group": g, "indicators": by_group[g]} for g in GROUP_ORDER if g in by_group]
    return Response(
        {
            "region": {
                "code": region.code,
                "level": region.level,
                "name": region.name,
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
    ind = DukcapilIndicator.objects.filter(field=field).first()
    if not ind:
        return Response({"detail": f"Unknown indicator {field!r}."}, status=404)

    level = request.query_params.get("level", DukcapilLevel.PROVINCE)
    order = request.query_params.get("order", "desc")
    period, _ = _resolve_period(request)
    qs = DukcapilRegion.objects.filter(level=level, period=period)
    qs, scope = _apply_ancestor(qs, request)

    # Optional: express the value as a percentage of another field (usually
    # jumlah_penduduk) per region — e.g. "% penduduk beragama Islam".
    percent_of = request.query_params.get("percent_of")
    if percent_of and percent_of != field:
        data = _extract(qs, [field, percent_of])
        rows = []
        for code, (name, vals) in data.items():
            v, base = vals.get(field), vals.get(percent_of)
            if v is None or not base:
                continue
            rows.append({"domain_id": code, "domain_name": name, "value": round(v / base * 100, 2)})
    else:
        percent_of = None
        rows = [
            {"domain_id": code, "domain_name": name, "value": v}
            for code, (name, v) in _value_map(qs, field).items()
        ]

    stats = distribution([r["value"] for r in rows])
    ranked = rank_rows(rows, order=order)
    limit = request.query_params.get("limit")
    if limit:
        ranked = ranked[: int(limit)]

    return Response(
        {
            "indicator": DukcapilIndicatorSerializer(ind).data,
            "level": level,
            "scope": scope,
            "order": order,
            "percent_of": percent_of,
            "unit": "%" if percent_of else ind.unit,
            "stats": stats,
            "results": ranked,
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

    x_ind = DukcapilIndicator.objects.filter(field=x_field).first()
    y_ind = DukcapilIndicator.objects.filter(field=y_field).first()
    if not x_ind or not y_ind:
        return Response({"detail": "Unknown x or y indicator."}, status=404)

    level = request.query_params.get("level", DukcapilLevel.PROVINCE)
    period, _ = _resolve_period(request)
    qs = DukcapilRegion.objects.filter(level=level, period=period)
    qs, _scope = _apply_ancestor(qs, request)

    x_by = _value_map(qs, x_field)
    y_by = _value_map(qs, y_field)
    results = [
        {"domain_id": c, "domain_name": x_by[c][0], "x": x_by[c][1], "y": y_by[c][1]}
        for c in x_by
        if c in y_by
    ]
    results.sort(key=lambda p: p["x"])
    r = pearson([p["x"] for p in results], [p["y"] for p in results])

    return Response(
        {
            "x": DukcapilIndicatorSerializer(x_ind).data,
            "y": DukcapilIndicatorSerializer(y_ind).data,
            "level": level,
            "n": len(results),
            "r": r,
            "results": results,
        }
    )
