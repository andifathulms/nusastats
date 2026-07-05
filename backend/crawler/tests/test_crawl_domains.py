from unittest.mock import patch

import pytest
from django.core.management import call_command

from bps_client.client import BpsResponse
from catalog.models import AdminLevel, Domain


def fake_get(model, **params):
    if model == "domain" and params.get("type") == "prov":
        return BpsResponse(
            url="fake",
            http_status=200,
            body={"status": "OK", "data": [{"domain_id": "31", "domain_name": "DKI JAKARTA"}]},
            response_hash="x",
        )
    if model == "domain" and params.get("type") == "kabbyprov":
        return BpsResponse(
            url="fake",
            http_status=200,
            body={
                "status": "OK",
                "data": [{"domain_id": "3171", "domain_name": "KOTA JAKARTA SELATAN"}],
            },
            response_hash="x",
        )
    raise AssertionError(f"unexpected call: {model} {params}")


@pytest.mark.django_db
def test_crawl_domains_creates_national_province_and_regency():
    with patch("bps_client.client.BpsClient.get", autospec=True, side_effect=lambda self, model, **p: fake_get(model, **p)):
        call_command("crawl_domains")

    assert Domain.objects.filter(domain_id="0000", admin_level=AdminLevel.NATIONAL).exists()
    province = Domain.objects.get(domain_id="31")
    assert province.admin_level == AdminLevel.PROVINCE
    regency = Domain.objects.get(domain_id="3171")
    assert regency.admin_level == AdminLevel.REGENCY
    assert regency.parent_province == province


@pytest.mark.django_db
def test_crawl_domains_is_idempotent():
    with patch("bps_client.client.BpsClient.get", autospec=True, side_effect=lambda self, model, **p: fake_get(model, **p)):
        call_command("crawl_domains")
        call_command("crawl_domains")

    assert Domain.objects.filter(domain_id="31").count() == 1
    assert Domain.objects.filter(domain_id="3171").count() == 1
