from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import CoverageExportView, SimdasiTableViewSet, VariableViewSet

router = DefaultRouter()
router.register("variables", VariableViewSet, basename="variable")
router.register("simdasi", SimdasiTableViewSet, basename="simdasi")

urlpatterns = [
    path("coverage/export/", CoverageExportView.as_view(), name="coverage-export"),
    path("coverage/", include(router.urls)),
]
