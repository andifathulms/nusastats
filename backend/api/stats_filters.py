import django_filters

from catalog.models import Domain, Variable


class StatsVariableFilter(django_filters.FilterSet):
    """Filters for browsing variables that have ingested data."""

    category = django_filters.CharFilter(field_name="subject__subject_category__name", lookup_expr="icontains")
    subject = django_filters.NumberFilter(field_name="subject_id")
    keyword = django_filters.CharFilter(field_name="name", lookup_expr="icontains")

    class Meta:
        model = Variable
        fields = []


class RegionFilter(django_filters.FilterSet):
    admin_level = django_filters.CharFilter(field_name="admin_level")
    parent_province = django_filters.CharFilter(field_name="parent_province__domain_id")
    keyword = django_filters.CharFilter(field_name="domain_name", lookup_expr="icontains")

    class Meta:
        model = Domain
        fields = []
