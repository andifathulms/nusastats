"""`/api/carousel/pack/`: the carousel-data/1 pack builder (api.carousel) over
HTTP, for the /card/angka map card and the carousel tool page. Same guardrails
as `export_carousel_pack`; a refusal is a 422 with the reason, never a partial
pack."""

from rest_framework.decorators import api_view
from rest_framework.response import Response

from .caching import cached_api
from .carousel import PackError, build_pack


def _int(request, name, default):
    try:
        return max(0, min(50, int(request.query_params.get(name, default))))
    except (TypeError, ValueError):
        return default


@api_view(["GET"])
@cached_api("bps", "dukcapil", "djpk")
def pack(request):
    q = request.query_params
    try:
        result = build_pack(
            q.get("source", ""),
            q.get("metric", ""),
            q.get("level", ""),
            q.get("period") or None,
            prov=q.get("prov") or None,
            top=_int(request, "top", 5),
            bottom=_int(request, "bottom", 5),
            allow_partial=q.get("allow_partial") in ("1", "true"),
            turvar=q.get("turvar") or None,
            th=q.get("th") or None,
            unit=q.get("unit") or None,
            label_metric=q.get("label_metric") or None,
            notes=q.get("notes") or None,
        )
    except PackError as exc:
        return Response({"error": str(exc)}, status=422)
    return Response(result)
