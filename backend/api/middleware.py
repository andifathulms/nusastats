"""Log slow API requests, so performance regressions show up in the server
log instead of only in users' experience."""

import logging
import time

from django.conf import settings
from django.db import connection

logger = logging.getLogger("api.slow")


class SlowRequestLogMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response
        self.threshold_ms = settings.API_SLOW_REQUEST_MS

    def __call__(self, request):
        start = time.perf_counter()
        queries_before = len(connection.queries) if settings.DEBUG else None
        response = self.get_response(request)
        elapsed_ms = (time.perf_counter() - start) * 1000
        if elapsed_ms >= self.threshold_ms and request.path.startswith("/api/"):
            # Query counts are only recorded by Django with DEBUG on.
            queries = f" queries={len(connection.queries) - queries_before}" if queries_before is not None else ""
            logger.warning(
                "slow %s %s %d %.0fms cache=%s%s",
                request.method,
                request.get_full_path(),
                response.status_code,
                elapsed_ms,
                response.get("X-Cache", "-"),
                queries,
            )
        return response
