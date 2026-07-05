"""Phase 3 (CLAUDE.md): domain crawl. Populates the Domain table with the
national domain, all provinces (`type=prov`), and all kabupaten/kota per
province (`type=kabbyprov`). Idempotent — re-running updates existing rows
via get_or_create instead of duplicating them (CLAUDE.md rule 3).
"""

from django.core.management.base import BaseCommand

from bps_client.client import BpsClient
from bps_client.exceptions import BpsApiError
from catalog.models import AdminLevel, Domain
from crawler.utils import extract_rows

NATIONAL_DOMAIN_ID = "0000"


class Command(BaseCommand):
    help = "Crawl BPS domain list: national, provinces, and kabupaten/kota."

    def handle(self, *args, **options):
        client = BpsClient()

        national, created = Domain.objects.get_or_create(
            domain_id=NATIONAL_DOMAIN_ID,
            defaults={"domain_name": "Indonesia", "admin_level": AdminLevel.NATIONAL},
        )
        self.stdout.write(f"{'Created' if created else 'Found'} national domain {national}")

        try:
            resp = client.get("domain", type="prov")
        except BpsApiError as exc:
            self.stderr.write(f"Failed to fetch provinces: {exc}")
            return

        if resp.is_error:
            self.stderr.write(f"BPS error fetching provinces: {resp.error_detail} ({resp.url})")
            return

        province_rows = extract_rows(resp.body)
        self.stdout.write(f"Found {len(province_rows)} provinces")

        for row in province_rows:
            domain_id = str(row.get("domain_id"))
            domain_name = row.get("domain_name", "")
            province, _ = Domain.objects.update_or_create(
                domain_id=domain_id,
                defaults={"domain_name": domain_name, "admin_level": AdminLevel.PROVINCE},
            )
            self._crawl_regencies(client, province)

    def _crawl_regencies(self, client, province):
        # Confirmed live: `kabbyprov` takes the 2-digit province code, not
        # the full 4-digit province domain_id (e.g. "11", not "1100").
        prov_code = province.domain_id[:2]
        try:
            resp = client.get("domain", type="kabbyprov", prov=prov_code)
        except BpsApiError as exc:
            self.stderr.write(f"Failed to fetch regencies for {province.domain_id}: {exc}")
            return

        if resp.is_error:
            self.stderr.write(
                f"BPS error fetching regencies for {province.domain_id}: "
                f"{resp.error_detail} ({resp.url})"
            )
            return

        rows = extract_rows(resp.body)
        for row in rows:
            domain_id = str(row.get("domain_id"))
            domain_name = row.get("domain_name", "")
            Domain.objects.update_or_create(
                domain_id=domain_id,
                defaults={
                    "domain_name": domain_name,
                    "admin_level": AdminLevel.REGENCY,
                    "parent_province": province,
                },
            )
        self.stdout.write(f"  {province.domain_name}: {len(rows)} kabupaten/kota")
