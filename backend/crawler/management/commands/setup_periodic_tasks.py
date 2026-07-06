"""Idempotently registers the weekly re-crawl and re-ingestion as
django-celery-beat PeriodicTasks (CLAUDE.md Phase 6). Safe to re-run:
get_or_create on the schedule and task name means it never creates
duplicate beat entries.

Re-ingestion (stats.tasks.ingest_confirmed_data_task) is scheduled an
hour after the coverage re-crawl so it picks up that run's freshly
updated confirmations rather than racing it.
"""

from django.core.management.base import BaseCommand
from django_celery_beat.models import CrontabSchedule, PeriodicTask


class Command(BaseCommand):
    help = "Register the weekly coverage re-crawl and data re-ingestion periodic tasks."

    def handle(self, *args, **options):
        self._register(
            name="recrawl-confirmed-coverage-weekly",
            task="crawler.tasks.recrawl_confirmed_coverage",
            hour="3",
        )
        self._register(
            name="ingest-confirmed-data-weekly",
            task="stats.tasks.ingest_confirmed_data_task",
            hour="4",
        )

    def _register(self, name, task, hour):
        schedule, _ = CrontabSchedule.objects.get_or_create(
            minute="0", hour=hour, day_of_week="1", day_of_month="*", month_of_year="*"
        )
        periodic_task, created = PeriodicTask.objects.get_or_create(
            name=name,
            defaults={"crontab": schedule, "task": task},
        )
        if not created:
            periodic_task.crontab = schedule
            periodic_task.task = task
            periodic_task.enabled = True
            periodic_task.save()

        self.stdout.write(f"{'Created' if created else 'Updated'} periodic task: {periodic_task.name}")
