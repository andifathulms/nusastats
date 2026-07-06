from django.contrib import admin

from .models import CrawlRun


@admin.register(CrawlRun)
class CrawlRunAdmin(admin.ModelAdmin):
    list_display = ("id", "status", "params", "started_at", "finished_at")
    list_filter = ("status",)
    readonly_fields = [f.name for f in CrawlRun._meta.fields]

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False
