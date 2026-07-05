from rest_framework import viewsets
from rest_framework.response import Response
from rest_framework.views import APIView

from catalog.models import SimdasiTable, Variable

from .filters import VariableFilter
from .serializers import SimdasiTableSerializer, VariableDetailSerializer, VariableListSerializer


class VariableViewSet(viewsets.ReadOnlyModelViewSet):
    """`/api/coverage/variables/` and `/api/coverage/variables/{id}/`
    (PRD §5.7). Filters: admin_level, subject, status, keyword."""

    queryset = Variable.objects.select_related("subject", "subject__subject_category").prefetch_related(
        "coverage_records__domain", "coverage_records__status_changes"
    )
    filterset_class = VariableFilter

    def get_serializer_class(self):
        if self.action == "retrieve":
            return VariableDetailSerializer
        return VariableListSerializer


class SimdasiTableViewSet(viewsets.ReadOnlyModelViewSet):
    """`/api/coverage/simdasi/` (PRD §5.7)."""

    queryset = SimdasiTable.objects.prefetch_related("coverage_records")
    serializer_class = SimdasiTableSerializer


class CoverageExportView(APIView):
    """`/api/coverage/export/` — the full or filtered catalog as JSON, for
    other projects (e.g. NusaStats) to ingest directly (PRD §5.7)."""

    def get(self, request):
        queryset = VariableFilter(request.query_params, queryset=Variable.objects.all()).qs
        queryset = queryset.select_related("subject", "subject__subject_category").prefetch_related(
            "coverage_records__domain", "coverage_records__status_changes"
        )
        serializer = VariableDetailSerializer(queryset, many=True)
        return Response(serializer.data)
