"""Staff-only, on-demand "populate my DB now" trigger — runs the same
metadata -> coverage -> ingestion pipeline as the weekly Celery schedule,
but immediately, in the background (see crawler.tasks.run_incremental_crawl_task).
Not a public page: Cakupan's coverage crawl is deliberately rate-limited
and sampled per CLAUDE.md, so this stays behind staff auth rather than
letting anyone trigger BPS calls on demand.
"""

from django.contrib.admin.views.decorators import staff_member_required
from django.shortcuts import redirect, render

from .models import CrawlRun
from .tasks import run_incremental_crawl_task


@staff_member_required
def crawl_dashboard(request):
    if request.method == "POST":
        subcat = request.POST.get("subcat", "").strip() or None
        max_subjects = request.POST.get("max_subjects", "").strip()
        max_variables = request.POST.get("max_variables", "").strip()

        params = {
            "subcat": subcat,
            "max_subjects": int(max_subjects) if max_subjects else None,
            "max_variables": int(max_variables) if max_variables else None,
        }
        run = CrawlRun.objects.create(params=params)
        run_incremental_crawl_task.delay(run.id, **params)
        return redirect("crawl_dashboard")

    recent_runs = CrawlRun.objects.all()[:20]
    return render(request, "crawler/crawl_dashboard.html", {"recent_runs": recent_runs})
