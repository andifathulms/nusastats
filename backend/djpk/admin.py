from django.contrib import admin

from .models import ApbdAccount, ApbdLine, ApbdRegion, ApbdReport, DjpkFetchLog


@admin.register(ApbdRegion)
class ApbdRegionAdmin(admin.ModelAdmin):
    list_display = ("djpk_code", "level", "name", "prov_name", "kemendagri_code", "match_method")
    list_filter = ("level", "match_method")
    search_fields = ("djpk_code", "name", "prov_name", "kemendagri_code")


@admin.register(ApbdAccount)
class ApbdAccountAdmin(admin.ModelAdmin):
    list_display = ("sort", "akun_key", "label_id", "group", "parent_key")
    list_filter = ("group",)
    search_fields = ("akun_key", "label_id")


class ApbdLineInline(admin.TabularInline):
    model = ApbdLine
    extra = 0
    fields = ("line_index", "akun", "akun_key", "anggaran", "realisasi", "persentase")
    readonly_fields = fields
    ordering = ("line_index",)


@admin.register(ApbdReport)
class ApbdReportAdmin(admin.ModelAdmin):
    list_display = ("region", "tahun", "report_type", "periode", "line_count", "fetched_at")
    list_filter = ("report_type", "tahun", "periode")
    search_fields = ("region__djpk_code", "region__name")
    raw_id_fields = ("region", "fetch_log")
    inlines = [ApbdLineInline]


@admin.register(DjpkFetchLog)
class DjpkFetchLogAdmin(admin.ModelAdmin):
    list_display = ("kind", "http_status", "byte_count", "row_count", "fetched_at")
    list_filter = ("kind", "http_status")
    search_fields = ("url", "response_sha256")
