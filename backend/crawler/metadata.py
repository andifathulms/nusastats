"""Phase 3 (CLAUDE.md): Subject Category -> Subject -> Variable -> Vertical
Variable / Period crawl for the national domain. Records only what BPS
*claims* exists (label-level metadata) — this phase does not confirm
coverage; that's crawl_coverage (Phase 4). Extracted into a plain
function so it can be called both from the management command and from
crawler.tasks.run_incremental_crawl_task (the admin on-demand button).
"""

from bps_client.client import BpsClient
from bps_client.exceptions import BpsApiError
from catalog.models import Domain, PeriodData, Subject, SubjectCategory, Variable, VerticalVariable
from crawler.utils import extract_pagination, extract_rows

NATIONAL_DOMAIN_ID = "0000"


def _fetch(client, model, log, **params):
    """Fetches every page of a BPS list response. Confirmed live: BPS
    defaults to per_page=10 and silently caps at page 1 unless the caller
    loops `page` — without this, a variable's `th`/`vervar` list is
    truncated rather than complete."""
    all_rows = []
    page = 1
    while True:
        try:
            resp = client.get(model, page=page, **params)
        except BpsApiError as exc:
            log(f"Failed to fetch {model} ({params}) page {page}: {exc}")
            break
        if resp.is_error:
            log(f"BPS error fetching {model} ({params}) page {page}: {resp.error_detail}")
            break
        rows = extract_rows(resp.body)
        all_rows.extend(rows)
        current_page, total_pages = extract_pagination(resp.body)
        if not rows or current_page >= total_pages:
            break
        page += 1
    return all_rows


def run_metadata_crawl(subcat=None, max_subjects=None, max_variables=None, client=None, log=None):
    """Crawls subject categories -> subjects -> variables -> vervar/periods
    for the national domain. `subcat`/`max_subjects`/`max_variables` bound
    the run's size (e.g. for an admin-triggered incremental crawl instead
    of the entire BPS catalog in one go). Returns counts of what was
    created/updated.
    """
    client = client or BpsClient()
    log = log or (lambda msg: None)

    try:
        national = Domain.objects.get(domain_id=NATIONAL_DOMAIN_ID)
    except Domain.DoesNotExist:
        log("National domain (0000) not found — run crawl_domains first.")
        return {"categories": 0, "subjects": 0, "variables": 0}

    cat_rows = _fetch(client, "subcat", log, domain=national.domain_id)
    if subcat:
        cat_rows = [r for r in cat_rows if str(r.get("subcat_id")) == str(subcat)]
        log(f"Scoped run: subcat={subcat} only ({len(cat_rows)} matched)")

    categories_seen = 0
    subjects_seen = 0
    variables_seen = 0

    for cat_row in cat_rows:
        category, _ = SubjectCategory.objects.update_or_create(
            subject_category_id=str(cat_row.get("subcat_id")),
            domain=national,
            defaults={"name": cat_row.get("title", "")},
        )
        categories_seen += 1

        rows = _fetch(client, "subject", log, domain=national.domain_id, subcat=category.subject_category_id)
        if max_subjects is not None:
            rows = rows[:max_subjects]
        for row in rows:
            subject, _ = Subject.objects.update_or_create(
                subject_id=str(row.get("sub_id")),
                domain=national,
                defaults={"subject_category": category, "name": row.get("title", "")},
            )
            subjects_seen += 1
            variables_seen += _crawl_variables(client, national, subject, max_variables, log)
        log(f"{category.name}: {len(rows)} subjects")

    return {"categories": categories_seen, "subjects": subjects_seen, "variables": variables_seen}


def _crawl_variables(client, domain, subject, max_variables, log):
    rows = _fetch(client, "var", log, domain=domain.domain_id, subject=subject.subject_id)
    if max_variables is not None:
        rows = rows[:max_variables]
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
        _crawl_vervar(client, domain, variable, log)
        _crawl_periods(client, domain, variable, log)
    return len(rows)


def _crawl_vervar(client, domain, variable, log):
    # Confirmed live: vervar rows use `kode_ver_id`/`vervar` (not
    # `val`/`label` — that shape is for var/turvar/th, not vervar).
    rows = _fetch(client, "vervar", log, domain=domain.domain_id, var=variable.variable_id)
    for row in rows:
        VerticalVariable.objects.update_or_create(
            vervar_id=str(row.get("kode_ver_id")),
            variable=variable,
            defaults={"name": row.get("vervar", "")},
        )


def _crawl_periods(client, domain, variable, log):
    # Confirmed live: `th` rows use `th_id`/`th` (not `val`/`label`).
    rows = _fetch(client, "th", log, domain=domain.domain_id, var=variable.variable_id)
    for row in rows:
        label = row.get("th", "")
        year = int(label) if str(label).isdigit() else None
        PeriodData.objects.update_or_create(
            period_id=str(row.get("th_id")),
            variable=variable,
            defaults={"label": label, "year": year},
        )
