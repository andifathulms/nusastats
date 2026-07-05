class BpsApiError(Exception):
    """Base exception for all BPS WebAPI client failures."""


class BpsRequestFailed(BpsApiError):
    """The HTTP request itself failed (network error, non-200 after
    retries exhausted, or malformed JSON body)."""

    def __init__(self, message, http_status=None):
        super().__init__(message)
        self.http_status = http_status


class BpsApplicationError(BpsApiError):
    """BPS returned HTTP 200 with a non-OK `status` field in the JSON body
    (e.g. the documented `404 UserNotFound` quirk, which is an
    application-level error, not necessarily an auth or routing problem —
    BPS reuses it for several distinct error conditions, so callers should
    not assume it always means the API key/user is invalid).
    """

    def __init__(self, message, bps_status=None, raw_body=None):
        super().__init__(message)
        self.bps_status = bps_status
        self.raw_body = raw_body


class TooManyConsecutiveFailures(BpsApiError):
    """Hard stop after N consecutive failed requests (CLAUDE.md rule 5) —
    raised instead of continuing to hammer the API."""
