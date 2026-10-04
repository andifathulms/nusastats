"""`/api/search/?q=` — one query across regions and indicators, for the
frontend's global search palette (⌘K).

Read-only and source-separated in its output: each hit says which source it
comes from (`bps` / `dukcapil`), so the palette never blends the two; the
frontend owns the routes. Sorotan posts are authored in frontend config and searched client-side.
"""

from django.db.models import Case, IntegerField, Q, Value, When
from rest_framework.decorators import api_view
from rest_framework.response import Response

from catalog.models import AdminLevel, Domain, Variable
from dukcapil.models import DukcapilLevel, DukcapilRegion

from .caching import cached_api
from .dukcapil_views import _resolve_period

MIN_QUERY = 2
LIMITS = {"region": 8, "subregion": 8, "variable": 8}


def _tokens(q):
    return [t for t in q.split() if t]


def _all_tokens(field, tokens):
    """AND of `field__icontains=token` — "jawa barat" matches "Jawa Barat"
    but also "Barat, Jawa"-style names; each word must appear."""
    cond = Q()
    for t in tokens:
        cond &= Q(**{f"{field}__icontains": t})
    return cond


def _prefix_first(field, q):
    """Rank names that start with the query (or a word in them that does)
    above mere substring hits: "maka" → "Makassar" before "Kemakmuran"."""
    return Case(
        When(**{f"{field}__istartswith": q}, then=Value(0)),
        When(**{f"{field}__icontains": f" {q}"}, then=Value(1)),
        default=Value(2),
        output_field=IntegerField(),
    )


def _bps_level_label(d):
    if d.admin_level == AdminLevel.NATIONAL:
        return "Nasional"
    if d.admin_level == AdminLevel.PROVINCE:
        return "Provinsi"
    # BPS names don't carry Kota/Kabupaten; the kab number does (>= 71 = Kota).
    try:
        kota = int(d.domain_id[2:4]) >= 71
    except ValueError:
        kota = False
    return "Kota" if kota else "Kabupaten"


@api_view(["GET"])
@cached_api("bps", "dukcapil")
def search(request):
    q = (request.query_params.get("q") or "").strip()
    tokens = _tokens(q)
    if len(q) < MIN_QUERY:
        return Response({"q": q, "regions": [], "subregions": [], "variables": []})

    # BPS domains: nasional, provinsi, kab/kota.
    domains = (
        Domain.objects.filter(_all_tokens("domain_name", tokens))
        .select_related("parent_province")
        .annotate(rank=_prefix_first("domain_name", tokens[0]))
        .order_by("rank", "admin_level", "domain_name")[: LIMITS["region"]]
    )
    regions = [
        {
            "source": "bps",
            "code": d.domain_id,
            "name": d.domain_name,
            "level": d.admin_level,
            "label": _bps_level_label(d),
            "context": d.parent_province.domain_name if d.parent_province else "",
        }
        for d in domains
    ]

    # Dukcapil kecamatan + desa/kelurahan (BPS stops at kab/kota).
    period, _ = _resolve_period(request)
    subs = (
        DukcapilRegion.objects.filter(
            period=period,
            level__in=[DukcapilLevel.DISTRICT, DukcapilLevel.VILLAGE],
        )
        .filter(_all_tokens("name", tokens))
        .select_related("parent", "parent__parent")
        # Only the display columns: a bare select_related pulled each row's
        # (and both ancestors') full `attributes` JSONB just to print names.
        .only("code", "name", "level", "status", "parent__name", "parent__parent__name")
        .annotate(
            rank=_prefix_first("name", tokens[0]),
            lvl=Case(When(level=DukcapilLevel.DISTRICT, then=Value(0)), default=Value(1), output_field=IntegerField()),
        )
        .order_by("rank", "lvl", "name")[: LIMITS["subregion"]]
    )
    subregions = []
    for r in subs:
        chain = [p.name for p in (r.parent, r.parent.parent if r.parent else None) if p]
        subregions.append(
            {
                "source": "dukcapil",
                "code": r.code,
                "name": r.name,
                "level": r.level,
                "label": r.status or r.get_level_display(),
                "context": " · ".join(chain),
            }
        )

    # BPS indicators that actually have data.
    vars_qs = (
        Variable.objects.filter(stat_data_points__gt=0)
        .filter(_all_tokens("name", tokens))
        .select_related("subject__subject_category")
        .only("variable_id", "name", "unit", "stat_year_min", "stat_year_max", "subject__subject_category__name")
        .annotate(rank=_prefix_first("name", tokens[0]))
        .order_by("rank", "-stat_data_points")[: LIMITS["variable"]]
    )
    variables = [
        {
            "source": "bps",
            "code": v.variable_id,
            "name": v.name,
            "unit": v.unit,
            "context": v.subject.subject_category.name if v.subject and v.subject.subject_category else "",
            "years": [v.stat_year_min, v.stat_year_max],
        }
        for v in vars_qs
    ]

    return Response({"q": q, "regions": regions, "subregions": subregions, "variables": variables})
