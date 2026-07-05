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

    def add_arguments(self, parser):
        parser.add_argument(
            "--subcat",
            help="Only crawl this subject_category_id (e.g. for a small scoped validation run).",
        )
        parser.add_argument(
            "--max-subjects",
            type=int,
            default=None,
            help="Cap the number of subjects crawled per subject category.",
        )
        parser.add_argument(
            "--max-variables",
            type=int,
            default=None,
            help="Cap the number of variables crawled per subject.",
        )

    def handle(self, *args, **options):
        client = BpsClient()
        self.max_subjects = options["max_subjects"]
        self.max_variables = options["max_variables"]
        try:
            national = Domain.objects.get(domain_id=NATIONAL_DOMAIN_ID)
        except Domain.DoesNotExist:
            self.stderr.write("National domain (0000) not found — run crawl_domains first.")
            return

        # Confirmed live: the subject-category model is `subcat` (not
        # `subjectcategory`), with fields `subcat_id`/`title` (not `subcat`).
        cat_rows = self._fetch(client, "subcat", domain=national.domain_id)
        if options["subcat"]:
            cat_rows = [r for r in cat_rows if str(r.get("subcat_id")) == str(options["subcat"])]
            self.stdout.write(f"Scoped run: subcat={options['subcat']} only ({len(cat_rows)} matched)")

        for cat_row in cat_rows:
            category, _ = SubjectCategory.objects.update_or_create(
                subject_category_id=str(cat_row.get("subcat_id")),
                domain=national,
                defaults={"name": cat_row.get("title", "")},
            )
            self._crawl_subjects(client, national, category)

    def _crawl_subjects(self, client, domain, category):
        rows = self._fetch(client, "subject", domain=domain.domain_id, subcat=category.subject_category_id)
        if self.max_subjects is not None:
            rows = rows[: self.max_subjects]
        for row in rows:
            # Confirmed live: subject rows use `sub_id`/`title`, not
            # `subj_id`/`subj`.
            subject, _ = Subject.objects.update_or_create(
                subject_id=str(row.get("sub_id")),
                domain=domain,
                defaults={"subject_category": category, "name": row.get("title", "")},
            )
            self._crawl_variables(client, domain, subject)
        self.stdout.write(f"{category.name}: {len(rows)} subjects")

    def _crawl_variables(self, client, domain, subject):
        rows = self._fetch(client, "var", domain=domain.domain_id, subject=subject.subject_id)
        if self.max_variables is not None:
            rows = rows[: self.max_variables]
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
        # Confirmed live: `th` rows use `th_id`/`th` (not `val`/`th` — the
        # id field is `th_id`, distinct from the vervar/var/turvar shape
        # which uses `val`/`label`).
        rows = self._fetch(client, "th", domain=domain.domain_id, var=variable.variable_id)
        for row in rows:
            label = row.get("th", "")
            year = int(label) if str(label).isdigit() else None
            PeriodData.objects.update_or_create(
                period_id=str(row.get("th_id")),
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
