"""Read API for DJPK/SIKD regional-finance (APBD) data (`/api/djpk/`).

A source-separated parallel to the BPS `stats` and Kemendagri `dukcapil` APIs:
it reads the `djpk` app's ApbdReport/ApbdLine rows and the ApbdAccount catalog,
and reuses the pure analytics helpers in `api.analytics` (rank_rows,
distribution, pearson, percentile_rank, growth_rows) — the same shape the other
ranking endpoints use, so nothing about the BPS or dukcapil stacks is touched.

A "scope" is a (tahun, report_type, periode) triple. `report_type` is `apbd`
(budgeted) or `realisasi` (realised); `periode` is the month cutoff (12 = full
year). A "measure" picks which column of an account line to read: `realisasi`,
`anggaran`, or `persentase` (realisasi/anggaran %). Accounts are addressed by
`akun_key` (e.g. `pad`, `belanja_modal`), joined to the ApbdAccount catalog for
label/group/hierarchy.
"""

from django.db.models import Count
from rest_framework.decorators import api_view
from rest_framework.response import Response

from djpk.derived import DERIVED, DERIVED_BY_KEY
from djpk.derived import meta as derived_meta
from djpk.models import ApbdAccount, ApbdLine, ApbdRegion, ApbdReport, RegionLevel

from .analytics import distribution, growth_rows, pearson, percentile_rank, rank_rows
from .params import MAX_PAGE, int_param, paginate
from .djpk_serializers import ApbdAccountSerializer, ApbdRegionSerializer

MEASURES = {"realisasi": "realisasi", "anggaran": "anggaran", "persentase": "persentase"}
DEFAULT_MEASURE = "realisasi"

# Headline accounts summed for the overview cards / national totals.
_HEADLINE = ["pendapatan_daerah", "pad", "belanja_daerah", "pembiayaan_daerah"]


# --- scope resolution ----------------------------------------------------

def _scopes():
    """Distinct (tahun, report_type, periode) triples that have reports,
    newest year first."""
    return list(
        ApbdReport.objects.order_by("-tahun", "report_type", "-periode")
        .values("tahun", "report_type", "periode")
        .distinct()
    )


def _resolve_scope(request):
    """(tahun, report_type, periode) from query params, defaulting to the
    latest realisasi scope present. Missing/invalid params fall back."""
    scopes = _scopes()
    tahun = request.query_params.get("tahun")
    rtype = request.query_params.get("type", "realisasi")
    periode = request.query_params.get("periode")

    tahun = int(tahun) if tahun and tahun.isdigit() else None
    periode = int(periode) if periode and periode.isdigit() else None

    # Default year: newest available (for the chosen type if given).
    if tahun is None:
        cand = [s for s in scopes if s["report_type"] == rtype] or scopes
        tahun = cand[0]["tahun"] if cand else None
    # Default periode: the largest available for (tahun, rtype) — usually 12.
    if periode is None:
        cand = [s["periode"] for s in scopes if s["tahun"] == tahun and s["report_type"] == rtype]
        periode = max(cand) if cand else 12
    return tahun, rtype, periode


def _measure(request):
    m = request.query_params.get("measure", DEFAULT_MEASURE)
    return m if m in MEASURES else DEFAULT_MEASURE


# --- value extraction ----------------------------------------------------

def _line_values(tahun, rtype, periode, level, akun_key, measure, prov=None):
    """{djpk_code: (name, value, kemendagri_code)} for one account+measure in a
    scope+level. First line per region wins (guards the few duplicate-label
    rows, whose values are identical)."""
    field = MEASURES[measure]
    qs = ApbdLine.objects.filter(
        report__tahun=tahun,
        report__report_type=rtype,
        report__periode=periode,
        report__region__level=level,
        akun_key=akun_key,
    )
    if prov:
        qs = qs.filter(report__region__djpk_prov=prov)
    qs = qs.order_by("report__region__djpk_code", "line_index").values_list(
        "report__region__djpk_code",
        "report__region__name",
        "report__region__kemendagri_code",
        field,
    )
    out = {}
    for code, name, kemen, val in qs:
        if val is not None and code not in out:
            out[code] = (name, val, kemen or "")
    return out


def _derived_values(tahun, rtype, periode, level, spec, measure, prov=None):
    """{djpk_code: (name, ratio, kemendagri_code)} for a derived ratio. Ratios
    are computed on one basis — realisasi unless `measure=anggaran` is asked —
    from the required accounts pulled in a single query. A region missing any
    required account (or with a zero denominator) is dropped, never faked."""
    field = "anggaran" if measure == "anggaran" else "realisasi"
    qs = ApbdLine.objects.filter(
        report__tahun=tahun,
        report__report_type=rtype,
        report__periode=periode,
        report__region__level=level,
        akun_key__in=spec["requires"],
    )
    if prov:
        qs = qs.filter(report__region__djpk_prov=prov)
    qs = qs.order_by("report__region__djpk_code", "line_index").values_list(
        "report__region__djpk_code",
        "report__region__name",
        "report__region__kemendagri_code",
        "akun_key",
        field,
    )
    acc = {}
    for code, name, kemen, akun_key, val in qs:
        name0, kemen0, vals = acc.setdefault(code, (name, kemen or "", {}))
        if val is not None and akun_key not in vals:
            vals[akun_key] = val
    out = {}
    for code, (name, kemen, vals) in acc.items():
        v = spec["fn"](vals)
        if v is not None:
            out[code] = (name, v, kemen)
    return out


def _metric_values(tahun, rtype, periode, level, akun_key, measure, prov=None):
    """Values for either a raw account or a derived ratio (dispatched by key).
    Returns (value_map, unit, account_meta)."""
    spec = DERIVED_BY_KEY.get(akun_key)
    if spec:
        return _derived_values(tahun, rtype, periode, level, spec, measure, prov), spec["unit"], derived_meta(spec)
    account = ApbdAccount.objects.filter(akun_key=akun_key).first()
    unit = "%" if measure == "persentase" else "Rp"
    meta = ApbdAccountSerializer(account).data if account else {"akun_key": akun_key}
    return _line_values(tahun, rtype, periode, level, akun_key, measure, prov), unit, meta


# --- endpoints -----------------------------------------------------------

@api_view(["GET"])
def summary(request):
    """`/api/djpk/summary/` — available scopes, region counts, and national
    headline totals (summed from provinces for the resolved scope)."""
    tahun, rtype, periode = _resolve_scope(request)
    years = sorted({s["tahun"] for s in _scopes()}, reverse=True)
    types = sorted({s["report_type"] for s in _scopes()})

    # Count regions that actually have data in the resolved scope — NOT all-time
    # region rows. The two differ because the Papua reorg left ~26 kab/kota under
    # old province codes (26/32) whose data stops after 2022 (superseded by the
    # new 35–38 codes), so an all-time count over-reports the current coverage.
    counts = {
        row["region__level"]: row["c"]
        for row in ApbdReport.objects.filter(tahun=tahun, report_type=rtype, periode=periode)
        .order_by()
        .values("region__level")
        .annotate(c=Count("region_id", distinct=True))
    }
    by_level = [
        {"level": lv, "label": lb, "regions": counts.get(lv, 0)}
        for lv, lb in RegionLevel.choices
    ]

    # All headline accounts in one scan of the province lines instead of one
    # query per key. First line per (region, akun) wins, matching _line_values.
    seen = set()
    totals = {key: 0 for key in _HEADLINE}
    rows = (
        ApbdLine.objects.filter(
            report__tahun=tahun,
            report__report_type=rtype,
            report__periode=periode,
            report__region__level=RegionLevel.PROVINCE,
            akun_key__in=_HEADLINE,
        )
        .order_by("report__region__djpk_code", "line_index")
        .values_list("report__region__djpk_code", "akun_key", "realisasi")
    )
    for code, akun_key, val in rows:
        if val is not None and (code, akun_key) not in seen:
            seen.add((code, akun_key))
            totals[akun_key] += val
    totals = {k: round(v) for k, v in totals.items()}

    last = ApbdReport.objects.order_by("-fetched_at").first()
    return Response({
        "source": "Kemenkeu / Ditjen Perimbangan Keuangan (DJPK–SIKD)",
        "scope": {"tahun": tahun, "type": rtype, "periode": periode},
        "years": years,
        "types": types,
        "scopes": _scopes(),
        "by_level": by_level,
        "national_totals": totals,
        "last_fetched_at": last.fetched_at if last else None,
    })


@api_view(["GET"])
def accounts(request):
    """`/api/djpk/accounts/` — the APBD chart-of-accounts catalog, grouped
    (pendapatan / belanja / pembiayaan) with parent_key hierarchy for a picker
    or a tree view."""
    rows = list(ApbdAccount.objects.all())
    by_group = {}
    for r in rows:
        d = ApbdAccountSerializer(r).data
        d["derived"] = False
        by_group.setdefault(r.group, []).append(d)
    # Derived ratios (kemandirian fiskal, rasio belanja pegawai, …) as their own
    # group, so the picker lists them alongside the raw accounts.
    by_group["rasio"] = [derived_meta(spec) for spec in DERIVED]
    order = ["pendapatan", "belanja", "pembiayaan", "rasio"]
    groups = [{"group": g, "accounts": by_group[g]} for g in order if g in by_group]
    return Response({"count": len(rows) + len(DERIVED), "groups": groups})


@api_view(["GET"])
def regions(request):
    """`/api/djpk/regions/?level=&prov=&search=&limit=` — region list with the
    Kemendagri crosswalk. Defaults to provinces; `prov` (DJPK province code)
    narrows to one province's kab/kota."""
    qs = ApbdRegion.objects.all()
    level = request.query_params.get("level", RegionLevel.PROVINCE)
    qs = qs.filter(level=level)
    prov = request.query_params.get("prov")
    if prov:
        qs = qs.filter(djpk_prov=str(prov).zfill(2))
    search = request.query_params.get("search")
    if search:
        qs = qs.filter(name__icontains=search)
    limit = int_param(request, "limit", 1000, lo=1, hi=MAX_PAGE)
    qs = qs.order_by("djpk_code")[:limit]
    return Response(ApbdRegionSerializer(qs, many=True).data)


@api_view(["GET"])
def rank(request):
    """`/api/djpk/rank/?akun=&measure=&level=&prov=&tahun=&type=&periode=&order=`
    — rank regions at a level by one account+measure, plus distribution stats."""
    akun_key = request.query_params.get("akun", "pad")
    measure = _measure(request)
    level = request.query_params.get("level", RegionLevel.PROVINCE)
    prov = request.query_params.get("prov")
    order = request.query_params.get("order", "desc")
    tahun, rtype, periode = _resolve_scope(request)

    vals, unit, account = _metric_values(tahun, rtype, periode, level, akun_key, measure,
                                         prov=str(prov).zfill(2) if prov else None)
    rows = [
        {"domain_id": code, "domain_name": name, "kemendagri_code": kemen, "value": v}
        for code, (name, v, kemen) in vals.items()
    ]
    stats = distribution([r["value"] for r in rows])
    page, page_meta = paginate(rank_rows(rows, order=order), request)

    return Response({
        "account": account,
        "measure": measure,
        "level": level,
        "prov": prov,
        "scope": {"tahun": tahun, "type": rtype, "periode": periode},
        "order": order,
        "unit": unit,
        "stats": stats,
        **page_meta,
        "results": page,
    })


@api_view(["GET"])
def correlate(request):
    """`/api/djpk/correlate/?x=&y=&measure=&level=&tahun=&type=&periode=` — two
    accounts across regions at a level (one point per region) + Pearson r."""
    x_key = request.query_params.get("x")
    y_key = request.query_params.get("y")
    if not x_key or not y_key:
        return Response({"detail": "x and y account keys are required."}, status=400)
    measure = _measure(request)
    level = request.query_params.get("level", RegionLevel.PROVINCE)
    tahun, rtype, periode = _resolve_scope(request)

    x_by, x_unit, x_meta = _metric_values(tahun, rtype, periode, level, x_key, measure)
    y_by, y_unit, y_meta = _metric_values(tahun, rtype, periode, level, y_key, measure)
    results = [
        {"domain_id": c, "domain_name": x_by[c][0], "x": x_by[c][1], "y": y_by[c][1]}
        for c in x_by if c in y_by
    ]
    results.sort(key=lambda p: p["x"])
    r = pearson([p["x"] for p in results], [p["y"] for p in results])

    return Response({
        "x": x_meta, "y": y_meta, "x_unit": x_unit, "y_unit": y_unit,
        "measure": measure, "level": level,
        "scope": {"tahun": tahun, "type": rtype, "periode": periode},
        "n": len(results), "r": r, "results": results,
    })


@api_view(["GET"])
def growth(request):
    """`/api/djpk/growth/?akun=&measure=&level=&from=&to=&type=&periode=` —
    per-region change of one account+measure between two years."""
    akun_key = request.query_params.get("akun", "pad")
    measure = _measure(request)
    level = request.query_params.get("level", RegionLevel.PROVINCE)
    rtype = request.query_params.get("type", "realisasi")
    periode = request.query_params.get("periode")
    periode = int(periode) if periode and periode.isdigit() else 12
    order = request.query_params.get("order", "desc")

    years = sorted({s["tahun"] for s in _scopes() if s["report_type"] == rtype})
    y_from = request.query_params.get("from")
    y_to = request.query_params.get("to")
    y_from = int(y_from) if y_from and y_from.isdigit() else (years[0] if years else None)
    y_to = int(y_to) if y_to and y_to.isdigit() else (years[-1] if years else None)
    if y_from is None or y_to is None:
        return Response({"detail": "no data to compare."}, status=404)

    from_vals, unit, account = _metric_values(y_from, rtype, periode, level, akun_key, measure)
    to_vals, _u, _m = _metric_values(y_to, rtype, periode, level, akun_key, measure)
    from_by = {c: (n, v) for c, (n, v, _) in from_vals.items()}
    to_by = {c: (n, v) for c, (n, v, _) in to_vals.items()}
    page, page_meta = paginate(growth_rows(from_by, to_by, order=order), request)

    return Response({
        "account": account, "unit": unit,
        "measure": measure, "level": level, "type": rtype, "periode": periode,
        "from": y_from, "to": y_to, **page_meta, "results": page,
    })


@api_view(["GET"])
def region_detail(request, code):
    """`/api/djpk/regions/{djpk_code}/?tahun=&type=&periode=` — one region's
    full APBD tree for the scope (every account line, joined to the catalog for
    group/label/hierarchy), each headline account ranked among peers (same
    level; regencies scoped to their province)."""
    region = ApbdRegion.objects.filter(djpk_code=code).first()
    if not region:
        return Response({"detail": "Unknown region code."}, status=404)
    tahun, rtype, periode = _resolve_scope(request)

    report = ApbdReport.objects.filter(
        region=region, tahun=tahun, report_type=rtype, periode=periode
    ).first()
    if not report:
        return Response({
            "region": ApbdRegionSerializer(region).data,
            "scope": {"tahun": tahun, "type": rtype, "periode": periode},
            "detail": "No report for this scope.", "groups": [],
        }, status=404)

    catalog = {a.akun_key: a for a in ApbdAccount.objects.all()}

    # Peer realisasi values per akun_key, for ranking. Province peers = all
    # provinces; regency peers = kab/kota in the same DJPK province.
    peer_prov = region.djpk_prov if region.level == RegionLevel.REGENCY else None
    peer_scope = ("kab/kota dalam provinsi yang sama" if peer_prov
                  else "seluruh wilayah setingkat")
    peer_lists = {}
    peer_qs = ApbdLine.objects.filter(
        report__tahun=tahun, report__report_type=rtype, report__periode=periode,
        report__region__level=region.level,
    )
    if peer_prov:
        peer_qs = peer_qs.filter(report__region__djpk_prov=peer_prov)
    # One scan of the peer lines feeds both the per-akun rank lists and the
    # per-region operand values the derived ratios need (previously each of the
    # DERIVED specs re-scanned the whole peer set). First line per (region,
    # akun) wins for the operands, matching _derived_values.
    _derived_requires = {k for spec in DERIVED for k in spec["requires"]}
    region_akun = {}
    seen_peer = set()
    peer_rows = peer_qs.order_by("report__region__djpk_code", "line_index").values_list(
        "report__region__djpk_code", "akun_key", "realisasi"
    )
    for code, akun_key, realisasi in peer_rows:
        if realisasi is None or (code, akun_key) in seen_peer:
            continue
        # First line per (region, akun) wins — a region with duplicate-label
        # rows must count once among its peers, or `of` is inflated and the
        # percentiles shift.
        seen_peer.add((code, akun_key))
        peer_lists.setdefault(akun_key, []).append(realisasi)
        if akun_key in _derived_requires:
            vals = region_akun.setdefault(code, {})
            if akun_key not in vals:
                vals[akun_key] = realisasi

    by_group = {}
    for line in report.lines.all():
        acc = catalog.get(line.akun_key)
        group = acc.group if acc else "lainnya"
        rank_val = of = pct = None
        if line.realisasi is not None and line.akun_key in peer_lists:
            rank_val, of, pct = percentile_rank(line.realisasi, peer_lists[line.akun_key])
        by_group.setdefault(group, []).append({
            "line_index": line.line_index,
            "akun": line.akun,
            "akun_key": line.akun_key,
            "label_id": acc.label_id if acc else line.akun,
            "parent_key": acc.parent_key if acc else "",
            "anggaran": line.anggaran,
            "realisasi": line.realisasi,
            "persentase": line.persentase,
            "rank": rank_val,
            "of": of,
            "percentile": pct,
        })

    order = ["pendapatan", "belanja", "pembiayaan"]
    groups = [{"group": g, "lines": by_group[g]} for g in order if g in by_group]
    for g, items in by_group.items():
        if g not in order:
            groups.append({"group": g, "lines": items})

    # Derived ratios for this region (kemandirian fiskal, rasio belanja pegawai,
    # …), each ranked among the same peers — computed from the operand values
    # already collected in the single peer scan above (no extra queries). A
    # region missing an operand (or with a zero denominator) is dropped, same
    # as _derived_values.
    ratios = []
    for spec in DERIVED:
        peer_values = []
        value = None
        for code, vals in region_akun.items():
            v = spec["fn"](vals)
            if v is None:
                continue
            peer_values.append(v)
            if code == region.djpk_code:
                value = v
        if value is None:
            continue
        rk, of, pct = percentile_rank(value, peer_values)
        ratios.append({
            "akun_key": spec["akun_key"],
            "label_id": spec["label_id"],
            "unit": spec["unit"],
            "desc": spec["desc"],
            "value": value,
            "rank": rk,
            "of": of,
            "percentile": pct,
        })

    return Response({
        "region": ApbdRegionSerializer(region).data,
        "scope": {"tahun": tahun, "type": rtype, "periode": periode},
        "peer_scope": peer_scope,
        "fetched_at": report.fetched_at,
        "groups": groups,
        "ratios": ratios,
    })
