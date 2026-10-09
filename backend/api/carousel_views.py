"""`/api/carousel/pack/` and `/api/carousel/deck/`: the carousel-data/1 pack
builder (api.carousel) and the Peta Angka deck generator (api.carousel_deck)
over HTTP, for the /card/angka map card, the carousel tool page and
`npm run carousel`. Same guardrails as `export_carousel_pack`; a refusal is a
422 with the reason, never a partial pack."""

from rest_framework.decorators import api_view
from rest_framework.response import Response

from .caching import cached_api
from .carousel import PackError, build_pack
from .carousel_deck import MAP_BACKGROUNDS, RECIPES, deck_bundle

PACK_PARAMS = ("source", "metric", "level", "period", "prov", "turvar", "th", "unit", "label_metric", "notes",
               "top", "bottom", "allow_partial")


def _int(request, name, default):
    try:
        return max(0, min(50, int(request.query_params.get(name, default))))
    except (TypeError, ValueError):
        return default


def _build(request):
    q = request.query_params
    return build_pack(
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


@api_view(["GET"])
@cached_api("bps", "dukcapil", "djpk")
def pack(request):
    try:
        return Response(_build(request))
    except PackError as exc:
        return Response({"error": str(exc)}, status=422)


@api_view(["GET"])
@cached_api("bps", "dukcapil", "djpk")
def deck(request):
    """Pack + deck text + the map cards to render, in one response.
    `recipe` = top | terendah | gap, `bg` = terrain | landcover | none."""
    recipe = request.query_params.get("recipe", "top")
    bg = request.query_params.get("bg", "terrain")
    if recipe not in RECIPES or bg not in MAP_BACKGROUNDS:
        return Response({"error": f"recipe: {', '.join(RECIPES)}; bg: {', '.join(MAP_BACKGROUNDS)}"}, status=422)
    try:
        result = _build(request)
    except PackError as exc:
        return Response({"error": str(exc)}, status=422)
    spec = {k: request.query_params.get(k) for k in PACK_PARAMS}
    return Response({**result, **deck_bundle(result, spec, recipe=recipe, map_bg=bg)})
