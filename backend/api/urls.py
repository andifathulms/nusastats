from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .stats_views import RegionViewSet, SummaryView, VariableDataViewSet
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
    path("stats/", include(stats_router.urls)),
]
