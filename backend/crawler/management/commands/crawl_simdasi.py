"""Phase 4 (CLAUDE.md / PRD §5.4): SIMDASI table + coverage crawl.

Crawls the SIMDASI master table list, then checks each table against an
explicit, documented sample of 7-digit MFD region codes
(settings.SIMDASI_SAMPLE_MFD_CODES). Calling convention mirrors the
Dynamic Data client for architectural consistency; see the comment in
settings.py — validate model/param names against real SIMDASI docs before
the Phase 5 live crawl.
"""

from django.conf import settings
from django.core.management.base import BaseCommand

from bps_client.client import BpsClient
from bps_client.exceptions import BpsApiError, TooManyConsecutiveFailures
from catalog.models import SimdasiTable
from crawler.simdasi import upsert_simdasi_coverage_record
from crawler.utils import extract_rows


class Command(BaseCommand):
    help = "Crawl SIMDASI master tables and confirm coverage per sampled MFD region code."

    def handle(self, *args, **options):
        mfd_codes = settings.SIMDASI_SAMPLE_MFD_CODES
        if not mfd_codes:
            self.stderr.write(
                "No SIMDASI_SAMPLE_MFD_CODES configured — set an explicit sample "
                "before crawling (CLAUDE.md rule 4)."
            )
            return

        self.stdout.write(f"Sampled MFD region codes ({len(mfd_codes)}): {mfd_codes}")

        client = BpsClient(base_url=settings.SIMDASI_API_BASE_URL)

        try:
            resp = client.get("table")
        except BpsApiError as exc:
            self.stderr.write(f"Failed to fetch SIMDASI table list: {exc}")
            return
        if resp.is_error:
            self.stderr.write(f"BPS error fetching SIMDASI table list: {resp.error_detail}")
            return

        rows = extract_rows(resp.body)
        self.stdout.write(f"Found {len(rows)} SIMDASI tables")

        checked = 0
        for row in rows:
            table, _ = SimdasiTable.objects.update_or_create(
                table_id=str(row.get("table_id")),
                defaults={
                    "subject_name": row.get("subject_name", ""),
                    "title": row.get("title", ""),
                },
            )
            for mfd_code in mfd_codes:
                try:
                    detail_resp = client.get("table_detail", table_id=table.table_id, wilayah=mfd_code)
                except TooManyConsecutiveFailures as exc:
                    self.stderr.write(f"Hard stop: {exc}")
                    self.stdout.write(f"Checked {checked} (table, region) pairs before stopping.")
                    return
                except BpsApiError as exc:
                    self.stderr.write(
                        f"Request failed for table={table.table_id} wilayah={mfd_code}: {exc}"
                    )
                    continue

                record = upsert_simdasi_coverage_record(table, mfd_code, detail_resp)
                checked += 1
                self.stdout.write(f"  table={table.table_id} wilayah={mfd_code} -> {record.status}")

        self.stdout.write(f"Done. Checked {checked} (table, region) pairs.")
