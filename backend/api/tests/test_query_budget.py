"""Query budgets for the hot read endpoints (cache miss path).

Each endpoint's query count must not grow with the number of rows it
returns; a per-row query (N+1) would blow these budgets as soon as the
fixture has more than a handful of rows. Budgets are the measured count
plus a little headroom, so an intentional extra query is a one-line bump
here, while an accidental loop query fails loudly.
"""

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APIClient

from catalog.models import AdminLevel, Domain, PeriodData
from stats.aggregates import refresh_variable_stats
from stats.models import DataPoint

from .test_stats_api import dataset  # noqa: F401  (shared fixture)

BUDGETS = {
    "/api/stats/summary/": 10,
    "/api/stats/variables/": 4,
    "/api/stats/variables/455/dimensions/": 6,
    "/api/stats/variables/455/series/?admin_level=regency": 3,
    "/api/stats/variables/455/ranking/?admin_level=regency": 6,
    "/api/stats/variables/455/trend/": 6,
    "/api/stats/variables/455/growth/?admin_level=regency": 7,
    "/api/stats/regions/": 2,
    "/api/stats/regions/1100/variables/": 4,
    "/api/stats/regions/1101/profile/": 6,
    "/api/search/?q=sim": 5,
}


@pytest.fixture
def wide_dataset(dataset):  # noqa: F811
    """Fifty more regencies with data, so any per-row query shows up."""
    aceh = Domain.objects.get(domain_id="1100")
    periods = list(PeriodData.objects.filter(variable=dataset))
    for i in range(2, 52):
        d = Domain.objects.create(
            domain_id=f"11{i:02d}", domain_name=f"Kab {i}", admin_level=AdminLevel.REGENCY, parent_province=aceh
        )
        for p in periods:
            DataPoint.objects.create(
                variable=dataset, domain=d, period=p, admin_level=AdminLevel.REGENCY, year=p.year,
                vervar_id=d.domain_id, vervar_label=d.domain_name, turvar_id="211", turvar_label="Laki-laki",
                value=float(i), source_check_log=None, fetched_at="2026-01-01T00:00:00Z",
            )
    refresh_variable_stats()
    return dataset


@pytest.mark.django_db
@pytest.mark.parametrize("url,budget", BUDGETS.items())
def test_endpoint_query_budget(wide_dataset, url, budget):
    with CaptureQueriesContext(connection) as ctx:
        resp = APIClient().get(url)
    assert resp.status_code == 200
    assert len(ctx.captured_queries) <= budget, (
        f"{url}: {len(ctx.captured_queries)} queries (budget {budget})\n"
        + "\n".join(q["sql"][:120] for q in ctx.captured_queries)
    )
