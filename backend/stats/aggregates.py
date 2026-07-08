"""Refresh the denormalized per-variable data-availability figures on
catalog.Variable (stat_data_points / stat_year_min / stat_year_max /
stat_admin_levels) from the stats.DataPoint table.

Kept as a plain function so it can be called both from the management
command and from the tail of an ingest run, keeping the browse/filter API
reading a small table instead of aggregating 2.7M rows per request.
"""

from collections import defaultdict

from django.db.models import Count, Max, Min

from catalog.models import Variable

from .models import DataPoint


def refresh_variable_stats():
    """Recompute stats for every variable in a few grouped passes. Returns
    the number of variables that have data."""
    totals = {
        row["variable_id"]: row
        for row in DataPoint.objects.order_by()
        .values("variable_id")
        .annotate(c=Count("id"), ymin=Min("year"), ymax=Max("year"))
    }

    levels_by_variable = defaultdict(set)
    for row in DataPoint.objects.order_by().values("variable_id", "admin_level").distinct():
        levels_by_variable[row["variable_id"]].add(row["admin_level"])

    with_data = set(totals)
    updates = []
    for variable_id, row in totals.items():
        updates.append(
            Variable(
                id=variable_id,
                stat_data_points=row["c"],
                stat_year_min=row["ymin"],
                stat_year_max=row["ymax"],
                stat_admin_levels=",".join(sorted(levels_by_variable[variable_id])),
            )
        )
    if updates:
        Variable.objects.bulk_update(
            updates,
            ["stat_data_points", "stat_year_min", "stat_year_max", "stat_admin_levels"],
            batch_size=500,
        )

    # Any variable that has no data points (e.g. never confirmed) is reset,
    # so stale figures never linger after data is removed.
    Variable.objects.exclude(id__in=with_data).exclude(stat_data_points=0).update(
        stat_data_points=0, stat_year_min=None, stat_year_max=None, stat_admin_levels=""
    )

    return len(with_data)
