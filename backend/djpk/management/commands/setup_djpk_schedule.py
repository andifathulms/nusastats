"""Idempotently register the monthly DJPK/SIKD APBD re-crawl as a
django-celery-beat PeriodicTask (parallel to crawler's weekly BPS re-crawl).

Monthly (not weekly) because DJPK publishes updated realisasi roughly monthly;
scheduled early in the month, day 5, to pick up the prior month's posting.
Safe to re-run: get_or_create on schedule + task name, no duplicates.
"""

from django.core.management.base import BaseCommand
from django_celery_beat.models import CrontabSchedule, PeriodicTask


class Command(BaseCommand):
    help = "Register the monthly DJPK APBD re-crawl periodic task."

    def handle(self, *args, **options):
        schedule, _ = CrontabSchedule.objects.get_or_create(
            minute="0", hour="2", day_of_week="*", day_of_month="5", month_of_year="*"
        )
        task, created = PeriodicTask.objects.get_or_create(
            name="recrawl-apbd-monthly",
            defaults={"crontab": schedule, "task": "djpk.tasks.recrawl_apbd"},
        )
        if not created:
            task.crontab = schedule
            task.task = "djpk.tasks.recrawl_apbd"
            task.enabled = True
            task.save()
        self.stdout.write(f"{'Created' if created else 'Updated'} periodic task: {task.name}")
