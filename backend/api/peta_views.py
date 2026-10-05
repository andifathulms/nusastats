"""Peta Wilayah read API (`/api/peta/`): terrain & land cover indicators per
Kemendagri region, from the self-contained `peta` app. Same shapes as the
dukcapil/djpk endpoints (rank envelope, peer ranks), cached on the `peta`
data version (bumped by `load_peta`).

Peers for a rank are the same level within the same parent: kabupaten/kota
within their provinsi, kecamatan within their kabupaten, provinsi nationally.
"""

from collections import defaultdict

from rest_framework.decorators import api_view
from rest_framework.response import Response

from peta.models import PetaIndicator, PetaLevel, PetaLoadLog, PetaRegion, PetaValue

from .analytics import distribution, percentile_rank, rank_rows
from .caching import cached_api
from .params import paginate

PEER_SCOPE = {PetaLevel.PROVINCE: "provinsi", PetaLevel.REGENCY: "kabupaten/kota di provinsi",
              PetaLevel.DISTRICT: "kecamatan di kabupaten/kota"}


def _indicator_payload(i):
    return {"key": i.key, "label": i.label_id, "group": i.group, "unit": i.unit,
            "dataset": i.dataset, "method": i.method, "yearly": i.yearly}


def _datasets():
    log = PetaLoadLog.objects.first()
    return log.datasets if log else {}


@api_view(["GET"])
@cached_api("peta")
def indicators(request):
    """`/api/peta/indicators/` — catalog + dataset licences/attribution + coverage counts."""
    counts = defaultdict(int)
    for lvl in PetaRegion.objects.values_list("level", flat=True):
        counts[lvl] += 1
    return Response({
        "indicators": [_indicator_payload(i) for i in PetaIndicator.objects.all()],
        "datasets": _datasets(),
        "regions": dict(counts),
        "classification_note": "Kelas medan adalah klasifikasi NusaStats (aturan terbuka), bukan klasifikasi resmi.",
    })


@api_view(["GET"])
@cached_api("peta")
def region_detail(request, code):
    """`/api/peta/regions/{kemendagri_code}/` — every indicator with its rank
    among peers (same level, same parent)."""
    region = PetaRegion.objects.filter(code=code).first()
    if region is None:
        return Response({"detail": "No Peta Wilayah data for this region code."}, status=404)
    peer_ids = PetaRegion.objects.filter(level=region.level, parent_code=region.parent_code).values_list("id", flat=True)
    peer_vals = defaultdict(list)
    for ind_id, yr, v in PetaValue.objects.filter(region_id__in=list(peer_ids)).values_list("indicator_id", "year", "value"):
        peer_vals[(ind_id, yr)].append(v)
    own = defaultdict(dict)
    indicators = {}
    for pv in region.values.select_related("indicator"):
        own[pv.indicator_id][pv.year] = pv.value
        indicators[pv.indicator_id] = pv.indicator
    rows = []
    for ind_id, ind in sorted(indicators.items(), key=lambda kv: (kv[1].sort, kv[1].key)):
        # Yearly series rank on their latest year; static indicators are stored as year 0.
        year = max(own[ind_id])
        value = own[ind_id][year]
        rank, of, pct = percentile_rank(value, peer_vals[(ind_id, year)])
        row = {**_indicator_payload(ind), "value": value, "rank": rank, "of": of, "percentile": pct}
        if ind.yearly:
            row["year"] = year
            row["series"] = {str(y): v for y, v in sorted(own[ind_id].items())}
        rows.append(row)
    return Response({
        "region": {"code": region.code, "level": region.level, "name": region.name,
                   "prov_code": region.prov_code, "parent_code": region.parent_code,
                   "area_km2": region.area_km2},
        "terrain_class": {"key": region.terrain_class, "label": region.terrain_class_label,
                          "reason": region.terrain_class_reason, "official": False} if region.terrain_class else None,
        "highest_point": region.highest_point,
        "landcover_year": region.landcover_year,
        "peer_scope": PEER_SCOPE[region.level],
        "indicators": rows,
        "provenance": {"terrain": region.terrain_provenance, "landcover": region.landcover_provenance,
                       "source_files": [{"dataset": f.dataset, "key": f.key, "sha256": f.sha256}
                                        for f in region.source_files.order_by("dataset", "key")]},
    })


@api_view(["GET"])
@cached_api("peta")
def rank(request):
    """`/api/peta/rank/?indicator=&level=&prov=&parent=&year=&order=&offset=&limit=`
    (`year` for yearly indicators; defaults to the latest year loaded)."""
    key = request.query_params.get("indicator", "elevation_mean")
    ind = PetaIndicator.objects.filter(key=key).first()
    if ind is None:
        return Response({"detail": f"Unknown indicator '{key}'."}, status=400)
    level = request.query_params.get("level", PetaLevel.REGENCY)
    if level not in PetaLevel.values:
        return Response({"detail": f"level must be one of {PetaLevel.values}."}, status=400)
    order = "asc" if request.query_params.get("order") == "asc" else "desc"
    if ind.yearly:
        years = PetaValue.objects.filter(indicator=ind).values_list("year", flat=True).distinct()
        raw = request.query_params.get("year")
        if raw is not None and (not raw.isdigit() or int(raw) not in set(years)):
            return Response({"detail": f"year must be one of {sorted(set(years))}."}, status=400)
        year = int(raw) if raw is not None else max(years, default=0)
    else:
        year = 0
    qs = PetaValue.objects.filter(indicator=ind, region__level=level, year=year).select_related("region")
    if prov := request.query_params.get("prov"):
        qs = qs.filter(region__prov_code=prov)
    if parent := request.query_params.get("parent"):
        qs = qs.filter(region__parent_code=parent)
    rows = [{"kemendagri_code": v.region.code, "name": v.region.name, "value": v.value,
             "terrain_class": v.region.terrain_class_label} for v in qs]
    stats = distribution([r["value"] for r in rows])
    page, meta = paginate(rank_rows(rows, order=order), request)
    return Response({"indicator": _indicator_payload(ind), "level": level, "order": order,
                     "year": year or None,
                     "stats": stats, **meta, "results": page})
