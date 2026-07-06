from unittest.mock import patch

import pytest

from bps_client.client import BpsResponse
from catalog.models import AdminLevel, Domain
from crawler.models import CrawlRun, CrawlRunStatus
from crawler.tasks import run_incremental_crawl_task


def make_key(vervar, var, turvar, th, turth=0):
    return f"{vervar}{var}{turvar}{th}{turth}"


@pytest.mark.django_db
def test_incremental_crawl_task_runs_full_pipeline_and_marks_done():
    Domain.objects.create(domain_id="0000", domain_name="Indonesia", admin_level=AdminLevel.NATIONAL)
    run = CrawlRun.objects.create(params={"subcat": "1", "max_subjects": 1, "max_variables": 1})

    def fake_get(self, model, **params):
        if model == "subcat":
            return BpsResponse(url="fake", http_status=200, body={"status": "OK", "data": [{"subcat_id": "1", "title": "Ekonomi"}]}, response_hash="x")
        if model == "subject":
            return BpsResponse(url="fake", http_status=200, body={"status": "OK", "data": [{"sub_id": "10", "title": "Inflasi"}]}, response_hash="x")
        if model == "var":
            return BpsResponse(url="fake", http_status=200, body={"status": "OK", "data": [{"var_id": "100", "title": "Inflasi Bulanan", "unit": "Persen", "def": ""}]}, response_hash="x")
        if model == "vervar":
            return BpsResponse(url="fake", http_status=200, body={"status": "OK", "data": [{"kode_ver_id": "0", "vervar": "INDONESIA"}]}, response_hash="x")
        if model == "th":
            return BpsResponse(url="fake", http_status=200, body={"status": "OK", "data": [{"th_id": "1", "th": "2023"}]}, response_hash="x")
        if model == "data":
            return BpsResponse(
                url="fake",
                http_status=200,
                body={
                    "data-availability": "available",
                    "vervar": [{"val": 0, "label": "<b>INDONESIA</b>"}],
                    "turvar": [{"val": 0, "label": "Total"}],
                    "turtahun": [{"val": 0, "label": "Tahun"}],
                    "tahun": [{"val": "1", "label": "2023"}],
                    "datacontent": {make_key(0, "100", 0, 1): 5.5},
                },
                response_hash="x",
            )
        raise AssertionError(f"unexpected call: {model} {params}")

    with patch("bps_client.client.BpsClient.get", autospec=True, side_effect=fake_get):
        result = run_incremental_crawl_task(run.id, subcat="1", max_subjects=1, max_variables=1)

    run.refresh_from_db()
    assert run.status == CrawlRunStatus.DONE
    assert run.finished_at is not None
    assert result["metadata"]["variables"] == 1
    assert result["coverage"]["checked"] >= 1
    assert result["ingest"]["data_points"] == 1


@pytest.mark.django_db
def test_incremental_crawl_task_marks_error_on_exception():
    run = CrawlRun.objects.create(params={})

    with patch("crawler.tasks.run_metadata_crawl", side_effect=RuntimeError("boom")):
        with pytest.raises(RuntimeError):
            run_incremental_crawl_task(run.id)

    run.refresh_from_db()
    assert run.status == CrawlRunStatus.ERROR
    assert "boom" in run.error_detail
