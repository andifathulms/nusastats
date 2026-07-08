"""Read API for the actual statistical values (stats.DataPoint), plus the
overview/summary and picker endpoints a showcase + analytics frontend
needs. Kept separate from views.py (the coverage-metadata API) so the two
concerns stay distinct.
"""

from collections import defaultdict

from django.db.models import Avg, Count, Max, Min
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView

from catalog.models import AdminLevel, CoverageRecord, CoverageStatus, Domain, SubjectCategory, Variable
from stats.models import DataPoint

from .analytics import distribution, growth_rows, pearson, percentile_rank, rank_rows
from .stats_filters import RegionFilter, StatsVariableFilter
from .stats_serializers import DataPointSerializer, RegionSerializer, VariableWithDataSerializer


def region_values(variable, admin_level, year, turvar_id=None):
    """{domain_id: (domain_name, value)} for one variable at an admin level
    and year. Defaults to the lowest turvar present so each region yields a
    single value rather than one per breakdown."""
    qs = DataPoint.objects.filter(variable=variable, admin_level=admin_level, year=year)
    if turvar_id is None:
        turvar_id = qs.order_by("turvar_id").values_list("turvar_id", flat=True).first()
    if turvar_id is not None:
        qs = qs.filter(turvar_id=turvar_id)
    return {
        p["domain__domain_id"]: (p["domain__domain_name"], p["value"])
        for p in qs.values("domain__domain_id", "domain__domain_name", "value")
    }


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

    def _default_turvar(self, points):
        """One turvar per region avoids double-counting when the caller
        didn't specify a breakdown. Pick the lowest turvar_id present."""
        return points.order_by("turvar_id").values_list("turvar_id", flat=True).first()

    @action(detail=True, methods=["get"])
    def ranking(self, request, variable_id=None):
        """`/api/stats/variables/{id}/ranking/` — rank every region at an
        admin level by this indicator's value for one year. Params:
        admin_level (default province), year (default latest available),
        turvar_id (default first present), order (desc|asc), limit.
        Returns the ranked regions plus distribution stats for the spread.
        """
        variable = self.get_object()
        admin_level = request.query_params.get("admin_level", AdminLevel.PROVINCE)
        order = request.query_params.get("order", "desc")

        points = DataPoint.objects.filter(variable=variable, admin_level=admin_level)
        if not points.exists():
            return Response(
                {"variable_id": variable.variable_id, "name": variable.name, "unit": variable.unit,
                 "admin_level": admin_level, "year": None, "stats": distribution([]), "results": []}
            )

        year = request.query_params.get("year")
        year = int(year) if year else points.aggregate(m=Max("year"))["m"]
        points = points.filter(year=year)

        turvar_id = request.query_params.get("turvar_id") or self._default_turvar(points)
        if turvar_id is not None:
            points = points.filter(turvar_id=turvar_id)

        rows = [
            {"domain_id": p["domain__domain_id"], "domain_name": p["domain__domain_name"], "value": p["value"]}
            for p in points.values("domain__domain_id", "domain__domain_name", "value")
        ]
        stats = distribution([r["value"] for r in rows])
        ranked = rank_rows(rows, order=order)
        limit = request.query_params.get("limit")
        if limit:
            ranked = ranked[: int(limit)]

        return Response(
            {
                "variable_id": variable.variable_id,
                "name": variable.name,
                "unit": variable.unit,
                "admin_level": admin_level,
                "year": year,
                "turvar_id": turvar_id,
                "stats": stats,
                "results": ranked,
            }
        )

    @action(detail=True, methods=["get"])
    def trend(self, request, variable_id=None):
        """`/api/stats/variables/{id}/trend/` — the national trajectory over
        time: per year the national value (if the indicator has a national
        aggregate) plus the mean/min/max across provinces (a disparity
        band). Params: turvar_id (default lowest present). Also returns the
        overall change and CAGR of whichever line exists.
        """
        variable = self.get_object()
        turvar_id = request.query_params.get("turvar_id")

        def with_turvar(qs):
            tv = turvar_id or qs.order_by("turvar_id").values_list("turvar_id", flat=True).first()
            return qs.filter(turvar_id=tv) if tv is not None else qs

        nat = {
            r["year"]: r["v"]
            for r in with_turvar(DataPoint.objects.filter(variable=variable, admin_level=AdminLevel.NATIONAL))
            .exclude(year__isnull=True)
            .values("year")
            .annotate(v=Avg("value"))
        }
        prov = {
            r["year"]: r
            for r in with_turvar(DataPoint.objects.filter(variable=variable, admin_level=AdminLevel.PROVINCE))
            .exclude(year__isnull=True)
            .values("year")
            .annotate(mean=Avg("value"), lo=Min("value"), hi=Max("value"))
        }

        years = sorted(set(nat) | set(prov))
        rows = [
            {
                "year": y,
                "national": round(nat[y], 4) if y in nat else None,
                "prov_mean": round(prov[y]["mean"], 4) if y in prov else None,
                "prov_min": prov[y]["lo"] if y in prov else None,
                "prov_max": prov[y]["hi"] if y in prov else None,
            }
            for y in years
        ]

        # Headline change/CAGR on whichever line exists (national preferred).
        line = [(r["year"], r["national"] if r["national"] is not None else r["prov_mean"]) for r in rows]
        line = [(y, v) for y, v in line if v is not None]
        change = cagr = None
        if len(line) >= 2 and line[0][1]:
            first_v, last_v = line[0][1], line[-1][1]
            span = line[-1][0] - line[0][0]
            change = round((last_v - first_v) / first_v * 100, 2)
            if span > 0 and first_v > 0 and last_v > 0:
                cagr = round(((last_v / first_v) ** (1 / span) - 1) * 100, 2)

        return Response(
            {
                "variable_id": variable.variable_id,
                "name": variable.name,
                "unit": variable.unit,
                "has_national": bool(nat),
                "change_pct": change,
                "cagr_pct": cagr,
                "results": rows,
            }
        )

    @action(detail=True, methods=["get"])
    def growth(self, request, variable_id=None):
        """`/api/stats/variables/{id}/growth/` — per-region change between
        two years, sorted fastest-rising to fastest-declining. Params:
        admin_level (default province), year_from/year_to (default the
        earliest/latest available), turvar_id, order.
        """
        variable = self.get_object()
        admin_level = request.query_params.get("admin_level", AdminLevel.PROVINCE)
        order = request.query_params.get("order", "desc")

        base = DataPoint.objects.filter(variable=variable, admin_level=admin_level)
        if not base.exists():
            return Response(
                {"variable_id": variable.variable_id, "name": variable.name, "unit": variable.unit,
                 "admin_level": admin_level, "year_from": None, "year_to": None, "results": []}
            )

        yr = base.aggregate(lo=Min("year"), hi=Max("year"))
        year_from = int(request.query_params.get("year_from") or yr["lo"])
        year_to = int(request.query_params.get("year_to") or yr["hi"])

        turvar_id = request.query_params.get("turvar_id") or self._default_turvar(base.filter(year=year_to))

        def by_domain(year):
            qs = base.filter(year=year)
            if turvar_id is not None:
                qs = qs.filter(turvar_id=turvar_id)
            return {
                p["domain__domain_id"]: (p["domain__domain_name"], p["value"])
                for p in qs.values("domain__domain_id", "domain__domain_name", "value")
            }

        results = growth_rows(by_domain(year_from), by_domain(year_to), order=order)
        return Response(
            {
                "variable_id": variable.variable_id,
                "name": variable.name,
                "unit": variable.unit,
                "admin_level": admin_level,
                "year_from": year_from,
                "year_to": year_to,
                "turvar_id": turvar_id,
                "results": results,
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

    @action(detail=True, methods=["get"])
    def profile(self, request, domain_id=None):
        """`/api/stats/regions/{domain_id}/profile/` — how this region ranks
        against its peers (other regions at the same admin level) across its
        indicators. For each indicator (top `limit` by data volume, default
        40) it reports the region's latest value, rank, and percentile
        (100 = top-ranked, 0 = bottom). National has no peers -> empty.
        """
        region = self.get_object()
        if region.admin_level == AdminLevel.NATIONAL:
            return Response({"region": RegionSerializer(region).data, "results": []})

        limit = int(request.query_params.get("limit", 40))
        # Top indicators for this region by data volume, with the latest year
        # each has here. (query 1)
        agg = list(
            DataPoint.objects.filter(domain=region)
            .order_by()
            .values("variable_id")
            .annotate(c=Count("id"), ymax=Max("year"))
            .order_by("-c")[:limit]
        )
        ymax_by_pk = {a["variable_id"]: a["ymax"] for a in agg}
        var_pks = list(ymax_by_pk)
        vars_by_pk = {
            v.id: v
            for v in Variable.objects.filter(id__in=var_pks).select_related("subject", "subject__subject_category")
        }

        # The region's own latest-year value per indicator (lowest turvar at
        # that year), in one query rather than one per indicator. (query 2)
        own = {}  # var_pk -> (year, turvar_id, value)
        for r in DataPoint.objects.filter(domain=region, variable_id__in=var_pks).values(
            "variable_id", "year", "turvar_id", "value"
        ):
            vpk = r["variable_id"]
            if r["year"] != ymax_by_pk.get(vpk):
                continue
            cur = own.get(vpk)
            if cur is None or r["turvar_id"] < cur[1]:
                own[vpk] = (r["year"], r["turvar_id"], r["value"])

        # Peers (same admin level) for exactly those (indicator, year, turvar)
        # combos, in one query; matched precisely in Python. (query 3)
        peers_by_pk = defaultdict(list)
        if own:
            years = {y for (y, _, _) in own.values()}
            turvars = {tv for (_, tv, _) in own.values()}
            for r in DataPoint.objects.filter(
                admin_level=region.admin_level,
                variable_id__in=list(own),
                year__in=years,
                turvar_id__in=turvars,
            ).values("variable_id", "year", "turvar_id", "value"):
                y, tv, _ = own[r["variable_id"]]
                if r["year"] == y and r["turvar_id"] == tv:
                    peers_by_pk[r["variable_id"]].append(r["value"])

        results = []
        for vpk, (year, _turvar, value) in own.items():
            variable = vars_by_pk.get(vpk)
            if not variable:
                continue
            rank, of, pct = percentile_rank(value, peers_by_pk.get(vpk, []))
            results.append(
                {
                    "variable_id": variable.variable_id,
                    "name": variable.name,
                    "unit": variable.unit,
                    "subject_category": variable.subject.subject_category.name,
                    "year": year,
                    "value": value,
                    "rank": rank,
                    "of": of,
                    "percentile": pct,
                }
            )

        # Strongest standings first.
        results.sort(key=lambda r: (r["percentile"] is not None, r["percentile"] or 0), reverse=True)
        return Response({"region": RegionSerializer(region).data, "count": len(results), "results": results})


class CorrelateView(APIView):
    """`/api/stats/correlate/?x=<var>&y=<var>` — relate two indicators
    across regions: one point per region (x value, y value) for a year,
    plus the Pearson correlation. Params: admin_level (default province),
    year (default the latest year both indicators share), x_turvar_id,
    y_turvar_id.
    """

    def get(self, request):
        x_id = request.query_params.get("x")
        y_id = request.query_params.get("y")
        if not x_id or not y_id:
            return Response({"detail": "x and y variable_id params are required."}, status=400)

        xvar = Variable.objects.filter(variable_id=x_id, stat_data_points__gt=0).first()
        yvar = Variable.objects.filter(variable_id=y_id, stat_data_points__gt=0).first()
        if not xvar or not yvar:
            return Response({"detail": "Unknown x or y indicator."}, status=404)

        admin_level = request.query_params.get("admin_level", AdminLevel.PROVINCE)

        def years_of(v):
            return set(
                DataPoint.objects.filter(variable=v, admin_level=admin_level)
                .exclude(year__isnull=True)
                .values_list("year", flat=True)
            )

        year_param = request.query_params.get("year")
        if year_param:
            year = int(year_param)
        else:
            common = years_of(xvar) & years_of(yvar)
            year = max(common) if common else None

        empty = {
            "x": {"variable_id": xvar.variable_id, "name": xvar.name, "unit": xvar.unit},
            "y": {"variable_id": yvar.variable_id, "name": yvar.name, "unit": yvar.unit},
            "admin_level": admin_level,
            "year": year,
            "n": 0,
            "r": None,
            "results": [],
        }
        if year is None:
            return Response(empty)

        x_by = region_values(xvar, admin_level, year, request.query_params.get("x_turvar_id"))
        y_by = region_values(yvar, admin_level, year, request.query_params.get("y_turvar_id"))

        results = [
            {"domain_id": d, "domain_name": x_by[d][0], "x": x_by[d][1], "y": y_by[d][1]}
            for d in x_by
            if d in y_by
        ]
        results.sort(key=lambda p: p["x"])
        r = pearson([p["x"] for p in results], [p["y"] for p in results])

        return Response({**empty, "n": len(results), "r": r, "results": results})
