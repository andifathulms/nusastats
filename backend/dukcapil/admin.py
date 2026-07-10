from django.contrib import admin

from .models import DukcapilFetchLog, DukcapilIndicator, DukcapilRegion


@admin.register(DukcapilRegion)
class DukcapilRegionAdmin(admin.ModelAdmin):
    list_display = ("code", "level", "name", "nama_prop", "nama_kab", "fetched_at")
    list_filter = ("level",)
    search_fields = ("code", "name", "nama_prop", "nama_kab", "nama_kec")
    raw_id_fields = ("parent", "fetch_log")


@admin.register(DukcapilIndicator)
class DukcapilIndicatorAdmin(admin.ModelAdmin):
    list_display = ("sort", "field", "label_id", "group", "unit", "is_string")
    list_filter = ("group", "is_string")
    search_fields = ("field", "label_id")


@admin.register(DukcapilFetchLog)
class DukcapilFetchLogAdmin(admin.ModelAdmin):
    list_display = ("service", "layer_id", "level", "http_status", "row_count", "fetched_at")
    list_filter = ("level", "http_status")
    search_fields = ("service", "response_sha256")
