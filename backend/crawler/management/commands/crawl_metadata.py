"""Phase 3 (CLAUDE.md): Subject Category -> Subject -> Variable -> Vertical
Variable / Period crawl for the national domain. Records only what BPS
*claims* exists (label-level metadata) — this phase does not confirm
coverage; that's crawl_coverage (Phase 4).
"""

from django.core.management.base import BaseCommand

from bps_client.client import BpsClient
from bps_client.exceptions import BpsApiError
from catalog.models import Domain, PeriodData, Subject, SubjectCategory, Variable, VerticalVariable
from crawler.utils import extract_rows

NATIONAL_DOMAIN_ID = "0000"


class Command(BaseCommand):
    help = "Crawl subject categories, subjects, variables, vervar and periods for the national domain."

    def handle(self, *args, **options):
        client = BpsClient()
        try:
            national = Domain.objects.get(domain_id=NATIONAL_DOMAIN_ID)
        except Domain.DoesNotExist:
            self.stderr.write("National domain (0000) not found — run crawl_domains first.")
            return

        for cat_row in self._fetch(client, "subjectcategory", domain=national.domain_id):
            category, _ = SubjectCategory.objects.update_or_create(
                subject_category_id=str(cat_row.get("subcat_id")),
                domain=national,
                defaults={"name": cat_row.get("subcat", "")},
            )
            self._crawl_subjects(client, national, category)

    def _crawl_subjects(self, client, domain, category):
        rows = self._fetch(client, "subject", domain=domain.domain_id, subcat=category.subject_category_id)
        for row in rows:
            subject, _ = Subject.objects.update_or_create(
                subject_id=str(row.get("subj_id")),
                domain=domain,
                defaults={"subject_category": category, "name": row.get("subj", "")},
            )
            self._crawl_variables(client, domain, subject)
        self.stdout.write(f"{category.name}: {len(rows)} subjects")

    def _crawl_variables(self, client, domain, subject):
        rows = self._fetch(client, "var", domain=domain.domain_id, subject=subject.subject_id)
        for row in rows:
            variable, _ = Variable.objects.update_or_create(
                variable_id=str(row.get("var_id")),
                domain=domain,
                data_model="dynamic",
                defaults={
                    "subject": subject,
                    "name": row.get("title", row.get("var", "")),
                    "unit": row.get("unit", ""),
                    "note": row.get("def", ""),
                },
            )
            self._crawl_vervar(client, domain, variable)
            self._crawl_periods(client, domain, variable)

    def _crawl_vervar(self, client, domain, variable):
        rows = self._fetch(client, "vervar", domain=domain.domain_id, var=variable.variable_id)
        for row in rows:
            VerticalVariable.objects.update_or_create(
                vervar_id=str(row.get("val")),
                variable=variable,
                defaults={"name": row.get("label", "")},
            )

    def _crawl_periods(self, client, domain, variable):
        rows = self._fetch(client, "th", domain=domain.domain_id, var=variable.variable_id)
        for row in rows:
            label = row.get("th", "")
            year = int(label) if str(label).isdigit() else None
            PeriodData.objects.update_or_create(
                period_id=str(row.get("val")),
                variable=variable,
                defaults={"label": label, "year": year},
            )

    def _fetch(self, client, model, **params):
        try:
            resp = client.get(model, **params)
        except BpsApiError as exc:
            self.stderr.write(f"Failed to fetch {model} ({params}): {exc}")
            return []
        if resp.is_error:
            self.stderr.write(f"BPS error fetching {model} ({params}): {resp.error_detail}")
            return []
        return extract_rows(resp.body)
