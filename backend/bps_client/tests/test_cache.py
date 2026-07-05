import json

import responses

from bps_client.client import BpsClient


class FakeRedis:
    store = {}

    @classmethod
    def from_url(cls, url):
        return cls()

    def get(self, key):
        return self.store.get(key)

    def setex(self, key, ttl, value):
        self.store[key] = value.encode() if isinstance(value, str) else value


@responses.activate
def test_second_identical_call_is_served_from_cache(monkeypatch):
    FakeRedis.store = {}
    monkeypatch.setattr("bps_client.cache.redis.Redis", FakeRedis)

    responses.add(
        responses.GET,
        "https://webapi.bps.go.id/v1/api/list/",
        json={"status": "OK", "data": []},
        status=200,
    )

    client = BpsClient(api_key="k", base_url="https://webapi.bps.go.id/v1/api", rate_limit_interval=0)

    first = client.get("domain", type="prov")
    second = client.get("domain", type="prov")

    assert first.body == second.body
    assert len(responses.calls) == 1  # second call served from cache, no new HTTP request
