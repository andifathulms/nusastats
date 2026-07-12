from django.urls import include, path
from rest_framework.routers import DefaultRouter

from . import djpk_views, dukcapil_views
from .stats_views import CorrelateView, RegionViewSet, SummaryView, VariableDataViewSet
from .views import CoverageExportView, SimdasiTableViewSet, VariableViewSet

coverage_router = DefaultRouter()
coverage_router.register("variables", VariableViewSet, basename="variable")
coverage_router.register("simdasi", SimdasiTableViewSet, basename="simdasi")

stats_router = DefaultRouter()
stats_router.register("variables", VariableDataViewSet, basename="stats-variable")
stats_router.register("regions", RegionViewSet, basename="stats-region")

urlpatterns = [
    path("coverage/export/", CoverageExportView.as_view(), name="coverage-export"),
    path("coverage/", include(coverage_router.urls)),
    path("stats/summary/", SummaryView.as_view(), name="stats-summary"),
    path("stats/correlate/", CorrelateView.as_view(), name="stats-correlate"),
    path("stats/", include(stats_router.urls)),
    # Kemendagri/Dukcapil source — separate from the BPS stats stack above.
    path("dukcapil/summary/", dukcapil_views.summary, name="dukcapil-summary"),
    path("dukcapil/indicators/", dukcapil_views.indicators, name="dukcapil-indicators"),
    path("dukcapil/regions/", dukcapil_views.regions, name="dukcapil-regions"),
    path("dukcapil/regions/<str:code>/", dukcapil_views.region_detail, name="dukcapil-region-detail"),
    path("dukcapil/rank/", dukcapil_views.rank, name="dukcapil-rank"),
    path("dukcapil/correlate/", dukcapil_views.correlate, name="dukcapil-correlate"),
    path("dukcapil/regency-crosswalk/", dukcapil_views.regency_crosswalk, name="dukcapil-regency-crosswalk"),
    path("dukcapil/regency-bridge/<str:domain_id>/", dukcapil_views.regency_bridge, name="dukcapil-regency-bridge"),
    # DJPK/SIKD regional finance (APBD/PAD) — separate again from BPS & dukcapil.
    path("djpk/summary/", djpk_views.summary, name="djpk-summary"),
    path("djpk/accounts/", djpk_views.accounts, name="djpk-accounts"),
    path("djpk/regions/", djpk_views.regions, name="djpk-regions"),
    path("djpk/regions/<str:code>/", djpk_views.region_detail, name="djpk-region-detail"),
    path("djpk/rank/", djpk_views.rank, name="djpk-rank"),
    path("djpk/correlate/", djpk_views.correlate, name="djpk-correlate"),
    path("djpk/growth/", djpk_views.growth, name="djpk-growth"),
]
