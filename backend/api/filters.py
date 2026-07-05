import django_filters

from catalog.models import Variable


class VariableFilter(django_filters.FilterSet):
    admin_level = django_filters.CharFilter(method="filter_admin_level")
    status = django_filters.CharFilter(method="filter_status")
    subject = django_filters.NumberFilter(field_name="subject_id")
    keyword = django_filters.CharFilter(method="filter_keyword")

    class Meta:
        model = Variable
        fields = []

    def filter_admin_level(self, queryset, name, value):
        return queryset.filter(coverage_records__admin_level=value).distinct()

    def filter_status(self, queryset, name, value):
        return queryset.filter(coverage_records__status=value).distinct()

    def filter_keyword(self, queryset, name, value):
        return queryset.filter(name__icontains=value)
