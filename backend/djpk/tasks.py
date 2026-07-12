"""Periodic re-crawl of DJPK/SIKD APBD data (parallel to crawler.tasks for BPS
and the dukcapil monthly snapshot).

DJPK restates figures over time — in-year realisasi grows month to month, and
prior-year numbers get audited/corrected — so a scheduled re-fetch of the
current fiscal year keeps our copy current. Ingest is idempotent (upsert on
region + scope), so a re-crawl updates figures and re-points the audit
`DjpkFetchLog` in place rather than duplicating.

Bounded and polite by construction: it re-crawls only the provinces already
present (not a blind full sweep), at DjpkClient's rate limit.
"""

from celery import shared_task
from django.utils import timezone

from .crosswalk import build_crosswalk
from .ingest import ingest
from .models import ApbdRegion


@shared_task
def recrawl_apbd(tahun=None, report_type="realisasi", periode=12, provinces=None):
    """Re-fetch one scope for known provinces. Defaults to the current year's
    full-year realisasi across whatever provinces have already been ingested."""
    tahun = tahun or timezone.now().year
    if provinces is None:
        provinces = sorted(
            ApbdRegion.objects.values_list("djpk_prov", flat=True).distinct()
        )
    if not provinces:
        return {"skipped": "no known regions; run ingest_apbd first"}

    result = ingest(tahun=tahun, report_type=report_type, periode=periode, provinces=provinces)
    cw = build_crosswalk()
    if not cw.get("note"):
        result["crosswalk"] = {"matched": cw["matched"], "unmatched": cw["unmatched"]}
    return result
