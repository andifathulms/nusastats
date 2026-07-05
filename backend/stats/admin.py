from django.contrib import admin

from .models import DataPoint


@admin.register(DataPoint)
class DataPointAdmin(admin.ModelAdmin):
    list_display = ("variable", "domain", "year", "turvar_label", "value", "admin_level")
    list_filter = ("admin_level", "year")
    search_fields = ("variable__name", "domain__domain_name")
