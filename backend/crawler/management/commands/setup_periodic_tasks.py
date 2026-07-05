"""Idempotently registers the weekly re-crawl as a django-celery-beat
PeriodicTask (CLAUDE.md Phase 6). Safe to re-run: get_or_create on the
schedule and task name means it never creates duplicate beat entries.
"""

from django.core.management.base import BaseCommand
from django_celery_beat.models import CrontabSchedule, PeriodicTask


class Command(BaseCommand):
    help = "Register the weekly coverage re-crawl periodic task."

    def handle(self, *args, **options):
        schedule, _ = CrontabSchedule.objects.get_or_create(
            minute="0", hour="3", day_of_week="1", day_of_month="*", month_of_year="*"
        )
        task, created = PeriodicTask.objects.get_or_create(
            name="recrawl-confirmed-coverage-weekly",
            defaults={
                "crontab": schedule,
                "task": "crawler.tasks.recrawl_confirmed_coverage",
            },
        )
        if not created:
            task.crontab = schedule
            task.task = "crawler.tasks.recrawl_confirmed_coverage"
            task.enabled = True
            task.save()

        self.stdout.write(f"{'Created' if created else 'Updated'} periodic task: {task.name}")
