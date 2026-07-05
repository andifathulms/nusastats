"""Redis-backed response cache to avoid redundant calls to BPS during a
single dev/debug session (PRD §7, CLAUDE.md Phase 6 note). This is purely
a call-dedupe optimization — it is never a substitute for the permanent,
queryable audit trail in Postgres (CoverageCheckLog); every cache hit is
still backed by a real response that was actually received at some point,
just replayed instead of re-fetched.

Failures talking to Redis (e.g. no container running locally) degrade to
a no-op cache rather than raising, since the crawler must keep working
against the live API even if the dev cache is unavailable.
"""

import hashlib
import json

import redis
from django.conf import settings


def _client():
    return redis.Redis.from_url(settings.BPS_RESPONSE_CACHE_URL)


def _cache_key(base_url, model, params):
    payload = json.dumps({"base_url": base_url, "model": model, "params": params}, sort_keys=True)
    return "bps_response:" + hashlib.sha256(payload.encode("utf-8")).hexdigest()


def get_cached(base_url, model, params):
    try:
        raw = _client().get(_cache_key(base_url, model, params))
    except redis.RedisError:
        return None
    if raw is None:
        return None
    return json.loads(raw)


def set_cached(base_url, model, params, response_dict):
    try:
        _client().setex(
            _cache_key(base_url, model, params),
            settings.BPS_RESPONSE_CACHE_TTL_SECONDS,
            json.dumps(response_dict),
        )
    except redis.RedisError:
        pass
