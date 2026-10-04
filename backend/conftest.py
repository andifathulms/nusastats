import pytest
from django.core.cache import cache


@pytest.fixture(autouse=True)
def _clear_api_cache():
    """The read-API response cache (api.caching) outlives a test's DB
    rollback; clear it so no test sees another test's cached responses."""
    cache.clear()
    yield
    cache.clear()
