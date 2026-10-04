"""Refresh the denormalized data-availability figures derived from the
stats.DataPoint table:

- per variable, on catalog.Variable: stat_data_points / stat_year_min /
  stat_year_max / stat_admin_levels
- per admin level, on stats.LevelStats: data_points

Kept as a plain function so it can be called both from the management
command and from the tail of an ingest run, keeping the browse/filter and
summary APIs reading small tables instead of aggregating millions of rows
per request.
"""

from collections import defaultdict

from django.db.models import Count, Max, Min

from catalog.models import Variable

from .models import DataPoint, LevelStats


def refresh_variable_stats():
    """Recompute stats for every variable and level in one grouped pass over
    DataPoint. Returns the number of variables that have data."""
    totals = {}  # variable pk -> [count, ymin, ymax, {levels}]
    by_level = defaultdict(int)
    for row in (
        DataPoint.objects.order_by()
        .values("variable_id", "admin_level")
        .annotate(c=Count("id"), ymin=Min("year"), ymax=Max("year"))
    ):
        by_level[row["admin_level"]] += row["c"]
        t = totals.setdefault(row["variable_id"], [0, None, None, set()])
        t[0] += row["c"]
        if row["ymin"] is not None:
            t[1] = row["ymin"] if t[1] is None else min(t[1], row["ymin"])
        if row["ymax"] is not None:
            t[2] = row["ymax"] if t[2] is None else max(t[2], row["ymax"])
        t[3].add(row["admin_level"])

    updates = [
        Variable(
            id=variable_id,
            stat_data_points=count,
            stat_year_min=ymin,
            stat_year_max=ymax,
            stat_admin_levels=",".join(sorted(levels)),
        )
        for variable_id, (count, ymin, ymax, levels) in totals.items()
    ]
    if updates:
        Variable.objects.bulk_update(
            updates,
            ["stat_data_points", "stat_year_min", "stat_year_max", "stat_admin_levels"],
            batch_size=500,
        )

    # Any variable that has no data points (e.g. never confirmed) is reset,
    # so stale figures never linger after data is removed.
    Variable.objects.exclude(id__in=list(totals)).exclude(stat_data_points=0).update(
        stat_data_points=0, stat_year_min=None, stat_year_max=None, stat_admin_levels=""
    )

    for level, count in by_level.items():
        LevelStats.objects.update_or_create(admin_level=level, defaults={"data_points": count})
    LevelStats.objects.exclude(admin_level__in=list(by_level)).delete()

    # The read API serves these figures; drop its cached BPS responses.
    from api.caching import bump_data_version

    bump_data_version("bps")

    return len(totals)
