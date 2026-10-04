import django_filters

from catalog.models import Domain, Variable


class StatsVariableFilter(django_filters.FilterSet):
    """Filters for browsing variables that have ingested data."""

    category = django_filters.CharFilter(field_name="subject__subject_category__name", lookup_expr="icontains")
    subject = django_filters.NumberFilter(field_name="subject_id")
    keyword = django_filters.CharFilter(method="filter_keyword")
    # One level, or several comma-joined ("province,regency"): the variable must
    # have data at EVERY listed level (catalog facet = "available at").
    admin_level = django_filters.CharFilter(method="filter_admin_level")
    # Recency facet: latest year with data is at least this year.
    min_year_max = django_filters.NumberFilter(field_name="stat_year_max", lookup_expr="gte")
    sort = django_filters.ChoiceFilter(
        method="filter_sort",
        choices=[("name", "name"), ("data", "data"), ("recent", "recent")],
    )

    class Meta:
        model = Variable
        fields = []

    def filter_keyword(self, queryset, name, value):
        # Every word must appear: "kemiskinan kabupaten" narrows instead of
        # requiring the exact phrase.
        for word in value.split():
            queryset = queryset.filter(name__icontains=word)
        return queryset

    def filter_admin_level(self, queryset, name, value):
        # Uses the denormalized comma-joined stat_admin_levels, so no scan
        # of the DataPoint table is needed.
        for level in [v.strip() for v in value.split(",") if v.strip()]:
            queryset = queryset.filter(stat_admin_levels__contains=level)
        return queryset

    def filter_sort(self, queryset, name, value):
        order = {
            "name": ["name"],
            "data": ["-stat_data_points", "name"],
            "recent": ["-stat_year_max", "-stat_data_points", "name"],
        }[value]
        return queryset.order_by(*order)


class RegionFilter(django_filters.FilterSet):
    admin_level = django_filters.CharFilter(field_name="admin_level")
    parent_province = django_filters.CharFilter(field_name="parent_province__domain_id")
    keyword = django_filters.CharFilter(field_name="domain_name", lookup_expr="icontains")

    class Meta:
        model = Domain
        fields = []
