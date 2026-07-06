from unittest.mock import patch

import pytest
from django.contrib.auth import get_user_model
from django.test import Client
from django.urls import reverse

from crawler.models import CrawlRun


@pytest.fixture
def staff_client(db):
    User = get_user_model()
    user = User.objects.create_user(username="staff", password="pw", is_staff=True)
    client = Client()
    client.force_login(user)
    return client


@pytest.mark.django_db
def test_dashboard_requires_staff():
    client = Client()
    resp = client.get(reverse("crawl_dashboard"))
    # Redirects to admin login rather than rendering the dashboard.
    assert resp.status_code == 302
    assert "login" in resp.url or "admin" in resp.url


@pytest.mark.django_db
def test_dashboard_get_renders_form_and_recent_runs(staff_client):
    resp = staff_client.get(reverse("crawl_dashboard"))

    assert resp.status_code == 200
    assert b"Run crawl now" in resp.content


@pytest.mark.django_db
def test_post_creates_crawl_run_and_enqueues_task(staff_client):
    with patch("crawler.views.run_incremental_crawl_task.delay") as mock_delay:
        resp = staff_client.post(
            reverse("crawl_dashboard"),
            {"subcat": "1", "max_subjects": "2", "max_variables": "5", "with_vervar": "on", "force": "on"},
        )

    assert resp.status_code == 302
    run = CrawlRun.objects.get()
    assert run.params == {
        "subcat": "1",
        "max_subjects": 2,
        "max_variables": 5,
        "crawl_vervar": True,
        "force": True,
    }
    mock_delay.assert_called_once_with(
        run.id, subcat="1", max_subjects=2, max_variables=5, crawl_vervar=True, force=True
    )


@pytest.mark.django_db
def test_post_with_blank_fields_means_no_scoping(staff_client):
    with patch("crawler.views.run_incremental_crawl_task.delay") as mock_delay:
        staff_client.post(reverse("crawl_dashboard"), {"subcat": "", "max_subjects": "", "max_variables": ""})

    run = CrawlRun.objects.get()
    assert run.params == {
        "subcat": None,
        "max_subjects": None,
        "max_variables": None,
        "crawl_vervar": False,
        "force": False,
    }
    mock_delay.assert_called_once_with(
        run.id, subcat=None, max_subjects=None, max_variables=None, crawl_vervar=False, force=False
    )
