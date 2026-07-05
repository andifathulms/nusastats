"""Tests run entirely against recorded fixture responses (CLAUDE.md Phase
2: "write this with tests against recorded/fixture responses before
hitting the live API repeatedly"). No network calls are made.
"""

import json
from pathlib import Path

import pytest
import responses

from bps_client.client import BpsClient
from bps_client.exceptions import BpsRequestFailed, TooManyConsecutiveFailures

FIXTURES = Path(__file__).parent / "fixtures"


def load_fixture(name):
    return json.loads((FIXTURES / name).read_text())


@pytest.fixture
def client():
    return BpsClient(
        api_key="secret-test-key",
        base_url="https://webapi.bps.go.id/v1/api",
        rate_limit_interval=0,
        max_retries=2,
        max_consecutive_failures=3,
    )


@responses.activate
def test_successful_call_with_data_parses_body(client):
    responses.add(
        responses.GET,
        "https://webapi.bps.go.id/v1/api/list/",
        json=load_fixture("data_available.json"),
        status=200,
    )

    result = client.get("data", domain="0000", var="1")

    assert result.is_error is False
    assert result.http_status == 200
    assert result.body["datacontent"] == {"119000201": 5.12, "119000202": 5.34}
    assert result.response_hash


@responses.activate
def test_api_key_never_appears_in_recorded_url(client):
    responses.add(
        responses.GET,
        "https://webapi.bps.go.id/v1/api/list/",
        json=load_fixture("data_available.json"),
        status=200,
    )

    result = client.get("data", domain="0000", var="1")

    assert "secret-test-key" not in result.url
    assert "REDACTED" in result.url


@responses.activate
def test_available_status_with_empty_datacontent_is_not_treated_as_error(client):
    """`data-availability: available` with empty `datacontent` is still an
    HTTP/application success — callers (the coverage crawler) are
    responsible for treating empty content as not-confirmed, per PRD 5.3.
    The client's job is only to report what BPS actually said.
    """
    responses.add(
        responses.GET,
        "https://webapi.bps.go.id/v1/api/list/",
        json=load_fixture("data_available_empty_content.json"),
        status=200,
    )

    result = client.get("data", domain="0000", var="999")

    assert result.is_error is False
    assert result.body["datacontent"] == {}


@responses.activate
def test_user_not_found_is_reported_as_application_error_not_swallowed(client):
    responses.add(
        responses.GET,
        "https://webapi.bps.go.id/v1/api/list/",
        json=load_fixture("user_not_found.json"),
        status=200,
    )

    result = client.get("data", domain="0000", var="1")

    assert result.is_error is True
    assert "UserNotFound" in result.error_detail


@responses.activate
def test_retries_on_5xx_then_succeeds(client):
    responses.add(
        responses.GET, "https://webapi.bps.go.id/v1/api/list/", json={"status": "error"}, status=503
    )
    responses.add(
        responses.GET,
        "https://webapi.bps.go.id/v1/api/list/",
        json=load_fixture("data_available.json"),
        status=200,
    )

    result = client.get("data", domain="0000", var="1")

    assert result.is_error is False
    assert len(responses.calls) == 2


@responses.activate
def test_raises_after_exhausting_retries_on_persistent_5xx(client):
    for _ in range(3):
        responses.add(
            responses.GET,
            "https://webapi.bps.go.id/v1/api/list/",
            json={"status": "error"},
            status=503,
        )

    with pytest.raises(BpsRequestFailed):
        client.get("data", domain="0000", var="1")


@responses.activate
def test_hard_stop_after_max_consecutive_failures(client):
    responses.add(
        responses.GET,
        "https://webapi.bps.go.id/v1/api/list/",
        json=load_fixture("user_not_found.json"),
        status=200,
    )

    for _ in range(3):
        client.get("data", domain="0000", var="1")

    with pytest.raises(TooManyConsecutiveFailures):
        client.get("data", domain="0000", var="1")
