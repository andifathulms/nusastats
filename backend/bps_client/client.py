"""Thin wrapper around the BPS WebAPI: auth key injection, rate limiting,
retry/backoff, response parsing, and consistent error handling.

CLAUDE.md rule 5: rate limiting is mandatory (default interval between
calls, exponential backoff on non-200, hard stop after N consecutive
failures). CLAUDE.md rule 6: the API key must never be logged in
plaintext — `redacted_url` always masks it before it reaches a log line,
CoverageCheckLog row, or exception message.
"""

import hashlib
import json
import time

import requests
from django.conf import settings

from . import cache
from .exceptions import BpsRequestFailed, TooManyConsecutiveFailures


def redact_key(url, key):
    if not key:
        return url
    return url.replace(key, "***REDACTED***")


class BpsResponse:
    def __init__(self, url, http_status, body, response_hash, is_error=False, error_detail=""):
        self.url = url
        self.http_status = http_status
        self.body = body
        self.response_hash = response_hash
        self.is_error = is_error
        self.error_detail = error_detail


class BpsClient:
    """Call `.get(model, **params)` for a raw BPS WebAPI call. Every call
    returns a `BpsResponse` regardless of success/failure — callers decide
    how to record it (e.g. into `CoverageCheckLog`); this client never
    swallows an error silently (CLAUDE.md: "do not silently swallow BPS
    error responses").
    """

    def __init__(
        self,
        api_key=None,
        base_url=None,
        rate_limit_interval=None,
        max_retries=None,
        max_consecutive_failures=None,
        session=None,
    ):
        self.api_key = api_key if api_key is not None else settings.BPS_API_KEY
        self.base_url = (base_url or settings.BPS_API_BASE_URL).rstrip("/")
        self.rate_limit_interval = (
            rate_limit_interval
            if rate_limit_interval is not None
            else settings.BPS_RATE_LIMIT_INTERVAL_SECONDS
        )
        self.max_retries = max_retries if max_retries is not None else settings.BPS_MAX_RETRIES
        self.max_consecutive_failures = (
            max_consecutive_failures
            if max_consecutive_failures is not None
            else settings.BPS_MAX_CONSECUTIVE_FAILURES
        )
        self.session = session or requests.Session()
        self._last_request_at = None
        self._consecutive_failures = 0

    def _throttle(self):
        if self._last_request_at is None:
            return
        elapsed = time.monotonic() - self._last_request_at
        remaining = self.rate_limit_interval - elapsed
        if remaining > 0:
            time.sleep(remaining)

    def _build_url(self, model, params):
        """BPS WebAPI is path-style, not query-string:
        `{base}/list/model/{model}/{k1}/{v1}/.../key/{key}/`. Domain
        crawling is a distinct resource (`{base}/domain/type/{type}/
        [prov/{id}/]key/{key}/`), confirmed against the live API — it is
        not a `list/model/domain/...` call.
        """
        segments = ["domain"] if model == "domain" else ["list", "model", model]
        for k, v in params.items():
            segments += [str(k), str(v)]
        segments += ["key", self.api_key]
        return f"{self.base_url}/" + "/".join(segments) + "/"

    def get(self, model, use_cache=True, **params):
        """Issue one BPS WebAPI call for the given `model` (e.g. "data",
        "domain", "subjectcategory", "var", "vervar", "th"), returning a
        BpsResponse. Retries transient failures with exponential backoff;
        raises TooManyConsecutiveFailures if the hard stop is reached.

        When `use_cache` is true (default), a successful past response for
        the same (base_url, model, params) is replayed from Redis instead
        of re-hitting BPS, within BPS_RESPONSE_CACHE_TTL_SECONDS — a dev/
        debug dedupe only (see bps_client.cache), never a substitute for
        the CoverageCheckLog audit trail.
        """
        if self._consecutive_failures >= self.max_consecutive_failures:
            raise TooManyConsecutiveFailures(
                f"Hard stop: {self._consecutive_failures} consecutive failures reached "
                f"(limit {self.max_consecutive_failures})."
            )

        cache_params = dict(params)

        if use_cache:
            cached = cache.get_cached(self.base_url, model, cache_params)
            if cached is not None:
                self._consecutive_failures = 0
                return BpsResponse(**cached)

        url = self._build_url(model, params)
        safe_url = redact_key(url, self.api_key)

        attempt = 0
        backoff = self.rate_limit_interval
        last_exc = None

        while attempt <= self.max_retries:
            self._throttle()
            try:
                resp = self.session.get(url, timeout=30)
            except requests.RequestException as exc:
                last_exc = exc
                attempt += 1
                self._last_request_at = time.monotonic()
                time.sleep(backoff)
                backoff *= 2
                continue
            finally:
                self._last_request_at = time.monotonic()

            if resp.status_code >= 500 or resp.status_code == 429:
                attempt += 1
                time.sleep(backoff)
                backoff *= 2
                continue

            raw_body = resp.text
            response_hash = hashlib.sha256(raw_body.encode("utf-8")).hexdigest()

            if resp.status_code != 200:
                self._consecutive_failures += 1
                return BpsResponse(
                    url=safe_url,
                    http_status=resp.status_code,
                    body=None,
                    response_hash=response_hash,
                    is_error=True,
                    error_detail=f"HTTP {resp.status_code}",
                )

            try:
                parsed = json.loads(raw_body)
            except ValueError as exc:
                self._consecutive_failures += 1
                return BpsResponse(
                    url=safe_url,
                    http_status=resp.status_code,
                    body=None,
                    response_hash=response_hash,
                    is_error=True,
                    error_detail=f"Malformed JSON: {exc}",
                )

            # BPS returns HTTP 200 even for application-level errors; the
            # documented one is `404 UserNotFound` inside `status`, but per
            # CLAUDE.md we must not assume that string always means an
            # invalid user/key — it's reused for other error conditions too.
            bps_status = parsed.get("status") if isinstance(parsed, dict) else None
            if bps_status not in (None, "OK"):
                self._consecutive_failures += 1
                message = parsed.get("message") if isinstance(parsed, dict) else None
                detail = f"BPS application status: {bps_status}"
                if message:
                    detail += f" - {message}"
                return BpsResponse(
                    url=safe_url,
                    http_status=resp.status_code,
                    body=parsed,
                    response_hash=response_hash,
                    is_error=True,
                    error_detail=detail,
                )

            self._consecutive_failures = 0
            result = BpsResponse(
                url=safe_url,
                http_status=resp.status_code,
                body=parsed,
                response_hash=response_hash,
                is_error=False,
            )
            if use_cache:
                cache.set_cached(
                    self.base_url,
                    model,
                    cache_params,
                    {
                        "url": result.url,
                        "http_status": result.http_status,
                        "body": result.body,
                        "response_hash": result.response_hash,
                        "is_error": result.is_error,
                        "error_detail": result.error_detail,
                    },
                )
            return result

        self._consecutive_failures += 1
        raise BpsRequestFailed(
            f"Request to {safe_url} failed after {self.max_retries} retries: {last_exc}"
        )
