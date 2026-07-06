from django.db import models


class CrawlRunStatus(models.TextChoices):
    QUEUED = "queued", "Queued"
    RUNNING = "running", "Running"
    DONE = "done", "Done"
    ERROR = "error", "Error"


class CrawlRun(models.Model):
    """Bookkeeping for an admin-triggered, on-demand crawl (metadata
    discovery -> coverage confirmation -> data ingestion), run in the
    background via Celery so the triggering HTTP request never blocks on
    what can be hundreds of rate-limited BPS calls. Purely operational —
    not a source of statistical truth, just "what did this button-click
    do and when."
    """

    params = models.JSONField(default=dict, blank=True)
    status = models.CharField(max_length=16, choices=CrawlRunStatus.choices, default=CrawlRunStatus.QUEUED)
    result = models.JSONField(null=True, blank=True)
    error_detail = models.TextField(blank=True)
    started_at = models.DateTimeField(auto_now_add=True)
    finished_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-started_at"]

    def __str__(self):
        return f"CrawlRun #{self.id} [{self.status}] {self.params}"
