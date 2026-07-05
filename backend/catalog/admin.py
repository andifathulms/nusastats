from django.contrib import admin

from .models import (
    CoverageCheckLog,
    CoverageRecord,
    CoverageStatusChange,
    Domain,
    PeriodData,
    SimdasiCoverageRecord,
    SimdasiTable,
    Subject,
    SubjectCategory,
    Variable,
    VerticalVariable,
)


@admin.register(Domain)
class DomainAdmin(admin.ModelAdmin):
    list_display = ("domain_id", "domain_name", "admin_level", "parent_province")
    list_filter = ("admin_level",)
    search_fields = ("domain_id", "domain_name")


@admin.register(SubjectCategory)
class SubjectCategoryAdmin(admin.ModelAdmin):
    list_display = ("subject_category_id", "name", "domain")
    search_fields = ("name",)


@admin.register(Subject)
class SubjectAdmin(admin.ModelAdmin):
    list_display = ("subject_id", "name", "subject_category", "domain")
    search_fields = ("name",)


@admin.register(Variable)
class VariableAdmin(admin.ModelAdmin):
    list_display = ("variable_id", "name", "subject", "domain", "data_model")
    list_filter = ("data_model",)
    search_fields = ("name", "variable_id")


@admin.register(VerticalVariable)
class VerticalVariableAdmin(admin.ModelAdmin):
    list_display = ("vervar_id", "name", "variable", "claimed_domain")


@admin.register(PeriodData)
class PeriodDataAdmin(admin.ModelAdmin):
    list_display = ("period_id", "label", "year", "variable")


@admin.register(CoverageCheckLog)
class CoverageCheckLogAdmin(admin.ModelAdmin):
    list_display = ("id", "http_status", "requested_at", "is_error", "response_hash")
    list_filter = ("is_error", "http_status")
    readonly_fields = [f.name for f in CoverageCheckLog._meta.fields]

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False


@admin.register(CoverageRecord)
class CoverageRecordAdmin(admin.ModelAdmin):
    list_display = (
        "variable",
        "domain",
        "model_type",
        "admin_level",
        "status",
        "last_checked_at",
    )
    list_filter = ("status", "admin_level", "model_type")
    search_fields = ("variable__name", "domain__domain_name")


@admin.register(CoverageStatusChange)
class CoverageStatusChangeAdmin(admin.ModelAdmin):
    list_display = ("coverage_record", "previous_status", "new_status", "changed_at")
    list_filter = ("previous_status", "new_status")

    def has_add_permission(self, request):
        return False


@admin.register(SimdasiTable)
class SimdasiTableAdmin(admin.ModelAdmin):
    list_display = ("table_id", "title", "subject_name")
    search_fields = ("title", "table_id")


@admin.register(SimdasiCoverageRecord)
class SimdasiCoverageRecordAdmin(admin.ModelAdmin):
    list_display = ("table", "mfd_region_code", "status", "last_checked_at")
    list_filter = ("status",)
