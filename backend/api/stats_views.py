"""Read API for the actual statistical values (stats.DataPoint), plus the
overview/summary and picker endpoints a showcase + analytics frontend
needs. Kept separate from views.py (the coverage-metadata API) so the two
concerns stay distinct.
"""

from django.db.models import Count, Max, Min
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView

from catalog.models import AdminLevel, CoverageRecord, CoverageStatus, Domain, SubjectCategory, Variable
from stats.models import DataPoint

from .stats_filters import RegionFilter, StatsVariableFilter
from .stats_serializers import DataPointSerializer, RegionSerializer, VariableWithDataSerializer


class SummaryView(APIView):
    """`/api/stats/summary/` — headline figures for the overview dashboard,
    all derived from real ingested data (never hardcoded).

    Written as a handful of single-pass grouped queries rather than a
    per-bucket count loop: against the real ~2.7M-row table the naive
    version took ~3.3s, this ~0.3s.
    """

    def get(self, request):
        # One grouped pass for data-point counts per admin level.
        points_by_level = {
            row["admin_level"]: row["c"]
            for row in DataPoint.objects.order_by().values("admin_level").annotate(c=Count("id"))
        }
        domains_by_level = {
            row["admin_level"]: row["c"]
            for row in Domain.objects.order_by().values("admin_level").annotate(c=Count("id"))
        }
        by_admin_level = [
            {
                "admin_level": level,
                "label": label,
                "domains": domains_by_level.get(level, 0),
                "data_points": points_by_level.get(level, 0),
            }
            for level, label in AdminLevel.choices
        ]

        # One grouped pass: variable pk -> its data-point count. Gives both
        # the set of variables-with-data and the total, avoiding separate
        # distinct/count scans over the full table.
        counts_by_variable = {
            row["variable_id"]: row["c"]
            for row in DataPoint.objects.order_by().values("variable_id").annotate(c=Count("id"))
        }
        vars_with_data = set(counts_by_variable)
        total_data_points = sum(counts_by_variable.values())

        # Cheap catalog-side lookups (thousands of rows, not millions).
        category_by_variable = dict(
            Variable.objects.values_list("id", "subject__subject_category__name")
        )
        category_variable_totals = {}
        category_with_data = {}
        for var_pk, category_name in category_by_variable.items():
            category_variable_totals[category_name] = category_variable_totals.get(category_name, 0) + 1
            if var_pk in vars_with_data:
                category_with_data[category_name] = category_with_data.get(category_name, 0) + 1
        by_category = [
            {
                "category": name,
                "variables": category_variable_totals.get(name, 0),
                "with_data": category_with_data.get(name, 0),
            }
            for name in sorted(category_variable_totals)
            if name is not None
        ]

        confirmed_variables = (
            CoverageRecord.objects.filter(status=CoverageStatus.CONFIRMED)
            .order_by()
            .values("variable_id")
            .distinct()
            .count()
        )
        year_agg = DataPoint.objects.aggregate(year_min=Min("year"), year_max=Max("year"))

        return Response(
            {
                "total_variables": Variable.objects.count(),
                "confirmed_variables": confirmed_variables,
                "variables_with_data": len(vars_with_data),
                "total_data_points": total_data_points,
                "total_domains": Domain.objects.count(),
                "subject_categories": SubjectCategory.objects.count(),
                "year_min": year_agg["year_min"],
                "year_max": year_agg["year_max"],
                "by_admin_level": by_admin_level,
                "by_category": by_category,
            }
        )


class VariableDataViewSet(viewsets.ReadOnlyModelViewSet):
    """`/api/stats/variables/` (browse, only variables that have data) and
    `/api/stats/variables/{variable_id}/` (detail + available dimensions).
    Looked up by BPS variable_id, not internal pk, so URLs are stable and
    meaningful to API consumers."""

    serializer_class = VariableWithDataSerializer
    filterset_class = StatsVariableFilter
    lookup_field = "variable_id"

    def get_queryset(self):
        # Only variables that actually have ingested data points. Reads the
        # denormalized stat_* fields (refreshed after each ingest) rather
        # than aggregating the 2.7M-row DataPoint table per request.
        return (
            Variable.objects.filter(stat_data_points__gt=0)
            .select_related("subject", "subject__subject_category")
            .order_by("subject__subject_category__name", "name")
        )

    @action(detail=True, methods=["get"])
    def dimensions(self, request, variable_id=None):
        """`/api/stats/variables/{id}/dimensions/` — the axes available for
        this variable: which years, which vervar/turvar breakdowns, and
        which domains have data. Drives the frontend's series pickers."""
        variable = self.get_object()
        points = DataPoint.objects.filter(variable=variable)

        # .order_by() is reset before each .distinct() — the model's default
        # multi-field ordering would otherwise leak into SELECT DISTINCT and
        # defeat distinctness on the single column we actually want.
        years = sorted(
            points.exclude(year__isnull=True).order_by("year").values_list("year", flat=True).distinct()
        )
        vervars = list(
            points.order_by("vervar_label").values("vervar_id", "vervar_label").distinct()
        )
        turvars = list(
            points.order_by("turvar_label").values("turvar_id", "turvar_label").distinct()
        )
        admin_levels = sorted(
            points.order_by("admin_level").values_list("admin_level", flat=True).distinct()
        )

        return Response(
            {
                "variable_id": variable.variable_id,
                "name": variable.name,
                "unit": variable.unit,
                "years": years,
                "admin_levels": admin_levels,
                "vervars": vervars,
                "turvars": turvars,
            }
        )

    @action(detail=True, methods=["get"])
    def series(self, request, variable_id=None):
        """`/api/stats/variables/{id}/series/` — the actual values, the
        core analytics endpoint. Filter with query params:
          domain_id      one or more (repeatable) region codes
          admin_level    national|province|regency (if no domain_id given)
          vervar_id      restrict to one vervar breakdown value
          turvar_id      restrict to one turvar breakdown value
          year_min/year_max   inclusive year bounds
        Returns rows ordered for direct charting (year ascending).
        """
        variable = self.get_object()
        points = DataPoint.objects.filter(variable=variable).select_related("domain")

        domain_ids = request.query_params.getlist("domain_id")
        if domain_ids:
            points = points.filter(domain__domain_id__in=domain_ids)
        elif request.query_params.get("admin_level"):
            points = points.filter(admin_level=request.query_params["admin_level"])

        if request.query_params.get("vervar_id"):
            points = points.filter(vervar_id=request.query_params["vervar_id"])
        if request.query_params.get("turvar_id"):
            points = points.filter(turvar_id=request.query_params["turvar_id"])
        if request.query_params.get("year_min"):
            points = points.filter(year__gte=request.query_params["year_min"])
        if request.query_params.get("year_max"):
            points = points.filter(year__lte=request.query_params["year_max"])

        points = points.order_by("domain__domain_id", "vervar_id", "turvar_id", "year")[:10000]
        return Response(
            {
                "variable_id": variable.variable_id,
                "name": variable.name,
                "unit": variable.unit,
                "count": len(points),
                "results": DataPointSerializer(points, many=True).data,
            }
        )


class RegionViewSet(viewsets.ReadOnlyModelViewSet):
    """`/api/stats/regions/` — domains for region pickers/comparisons, plus
    `/api/stats/regions/{domain_id}/variables/` for the region-centric view
    (what data a given province/kabupaten actually has)."""

    serializer_class = RegionSerializer
    filterset_class = RegionFilter
    lookup_field = "domain_id"
    pagination_class = None

    def get_queryset(self):
        return Domain.objects.select_related("parent_province").order_by("domain_id")

    @action(detail=True, methods=["get"])
    def variables(self, request, domain_id=None):
        """`/api/stats/regions/{domain_id}/variables/` — every indicator
        that has data for this region, with per-region counts and year
        range, plus the region's headline totals. One grouped pass over
        just this region's data points (not the whole 2.7M table).
        """
        region = self.get_object()

        agg = {
            row["variable_id"]: row
            for row in DataPoint.objects.filter(domain=region)
            .order_by()
            .values("variable_id")
            .annotate(count=Count("id"), ymin=Min("year"), ymax=Max("year"))
        }

        variables = (
            Variable.objects.filter(id__in=list(agg))
            .select_related("subject", "subject__subject_category")
            .order_by("subject__subject_category__name", "name")
        )
        keyword = request.query_params.get("keyword")
        if keyword:
            variables = variables.filter(name__icontains=keyword)
        category = request.query_params.get("category")
        if category:
            variables = variables.filter(subject__subject_category__name__icontains=category)

        results = [
            {
                "variable_id": v.variable_id,
                "name": v.name,
                "unit": v.unit,
                "subject_category": v.subject.subject_category.name,
                "data_point_count": agg[v.id]["count"],
                "year_min": agg[v.id]["ymin"],
                "year_max": agg[v.id]["ymax"],
            }
            for v in variables
        ]

        all_years = [y for row in agg.values() for y in (row["ymin"], row["ymax"]) if y is not None]
        return Response(
            {
                "region": RegionSerializer(region).data,
                "total_variables": len(agg),
                "total_data_points": sum(row["count"] for row in agg.values()),
                "year_min": min(all_years) if all_years else None,
                "year_max": max(all_years) if all_years else None,
                "results": results,
            }
        )
