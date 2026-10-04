"""Read-API response cache, keyed to ingest versions.

The read API only changes when an ingest runs (BPS stats, Dukcapil, DJPK),
so between ingests every GET is safely cacheable. Each source has a
`data version` stored in the cache; every cache key embeds the current
version of the source(s) a view reads. An ingest calls
`bump_data_version(source)` when it finishes, which makes every older key
unreachable — they simply expire. There is no per-key invalidation to get
wrong.

This is a read-side copy of what Postgres already holds. It is not part of
coverage detection and never produces a coverage value; the permanent audit
trail (CoverageCheckLog) and the crawler's own BPS-response cache are
untouched.

Cache failures (Redis down) degrade to an uncached request rather than an
error.
"""

import hashlib
import logging
import time
from functools import wraps
from urllib.parse import urlencode

from django.conf import settings
from django.core.cache import cache
from rest_framework.response import Response

logger = logging.getLogger(__name__)

SOURCES = ("bps", "dukcapil", "djpk")

# Browser/CDN reuse window. Short, so an ingest is visible within a minute;
# stale-while-revalidate lets the browser show the old copy instantly while it
# refetches in the background.
CACHE_CONTROL = "public, max-age=60, stale-while-revalidate=600"


def _version_key(source):
    return f"api:dv:{source}"


def data_version(source):
    """The current version token for a source, created on first use."""
    try:
        v = cache.get(_version_key(source))
        if v is None:
            v = time.time_ns()
            # add(), not set(): concurrent first requests agree on one token.
            cache.add(_version_key(source), v, None)
            v = cache.get(_version_key(source), v)
        return v
    except Exception:  # cache backend unavailable
        logger.warning("api cache unavailable reading version for %s", source, exc_info=True)
        return None


def bump_data_version(*sources):
    """Invalidate every cached response for these sources (default: all).
    Call at the end of anything that writes data a read view serves."""
    for source in sources or SOURCES:
        try:
            cache.set(_version_key(source), time.time_ns(), None)
        except Exception:
            logger.warning("api cache unavailable bumping %s", source, exc_info=True)


def _versions(sources):
    versions = [data_version(s) for s in sources]
    return None if any(v is None for v in versions) else versions


def memo(sources, name, compute):
    """Cache a small derived value (e.g. the list of periods) under the
    sources' versions, so it's computed once per ingest, not per request."""
    versions = _versions(sources)
    if versions is None:
        return compute()
    key = f"api:memo:{name}:{':'.join(map(str, versions))}"
    try:
        hit = cache.get(key)
    except Exception:
        return compute()
    if hit is not None:
        return hit
    value = compute()
    try:
        cache.set(key, value, settings.API_CACHE_TIMEOUT)
    except Exception:
        pass
    return value


def _request_key(sources, versions, request):
    query = urlencode(sorted((k, v) for k, vals in request.query_params.lists() for v in vals))
    digest = hashlib.sha1(f"{request.path}?{query}".encode()).hexdigest()
    return f"api:resp:{'+'.join(sources)}:{':'.join(map(str, versions))}:{digest}"


def cached_api(*sources):
    """Decorator for a GET handler — a function under `@api_view`, an APIView
    method, or a ViewSet action — that caches its 200 response data under the
    given sources' versions and adds Cache-Control for browser reuse.

    Place it *inside* `@api_view` / `@action` so it receives the DRF Request.
    """

    def deco(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            # Function view: (request, ...). Method/action: (self, request, ...).
            request = args[0] if hasattr(args[0], "query_params") else args[1]
            versions = _versions(sources)
            key = _request_key(sources, versions, request) if versions is not None else None

            data = None
            if key is not None:
                try:
                    data = cache.get(key)
                except Exception:
                    data = None
            if data is not None:
                response = Response(data)
                response["X-Cache"] = "hit"
            else:
                response = fn(*args, **kwargs)
                if key is not None and response.status_code == 200:
                    try:
                        cache.set(key, response.data, settings.API_CACHE_TIMEOUT)
                    except Exception:
                        pass
                response["X-Cache"] = "miss"
            if response.status_code == 200:
                response["Cache-Control"] = CACHE_CONTROL
            return response

        return wrapper

    return deco
