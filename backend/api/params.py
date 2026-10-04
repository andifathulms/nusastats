"""Shared query-param parsing and paging for the read API.

Every view used to call bare `int()` on query params, so a malformed value
(`?limit=all`, `?offset=-`) surfaced as a 500. These helpers raise DRF's
ValidationError instead, which renders as a 400 with the offending param
named — the same behaviour under both `@api_view` functions and APIView
classes.
"""

from rest_framework.exceptions import ValidationError

# Upper bound for any single ranked/listed page. Large enough for the biggest
# per-province village list (~8.6k in Jawa Tengah) that the map requests in one
# go, small enough that the nationwide 83k-village list (14.7 MB) can't be
# pulled in a single response.
MAX_PAGE = 10000


def int_param(request, name, default=None, lo=None, hi=None):
    """An integer query param, clamped to [lo, hi]. Missing/empty -> default;
    non-integer -> 400."""
    raw = request.query_params.get(name)
    if raw is None or raw.strip() == "":
        return default
    try:
        value = int(raw)
    except ValueError:
        raise ValidationError({name: f"must be an integer, got {raw!r}"})
    if lo is not None:
        value = max(lo, value)
    if hi is not None:
        value = min(hi, value)
    return value


def str_list_param(request, name):
    """A param that may repeat (`?prov=32&prov=33`) or be comma-joined
    (`?prov=32,33`). Returns a de-duplicated list in request order."""
    out = []
    for raw in request.query_params.getlist(name):
        for part in raw.split(","):
            part = part.strip()
            if part and part not in out:
                out.append(part)
    return out


def paginate(rows, request, default_limit=None):
    """Slice an already-ordered list by `?offset=&limit=`. Returns
    (page, meta) where meta is `{total, offset, limit}` so every ranked
    endpoint reports the same envelope. A missing limit means "the rest",
    still bounded by MAX_PAGE."""
    offset = int_param(request, "offset", 0, lo=0)
    limit = int_param(request, "limit", default_limit, lo=0, hi=MAX_PAGE)
    if limit is None:
        limit = MAX_PAGE
    page = rows[offset : offset + limit]
    return page, {"total": len(rows), "offset": offset, "limit": limit}
