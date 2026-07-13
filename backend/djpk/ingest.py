"""Ingest DJPK/SIKD APBD data into ApbdRegion / ApbdReport / ApbdLine.

Flow, per (tahun, report_type, periode):

  1. list provinces for the year, and pemda under each province
  2. upsert an ApbdRegion per pemda (skipping the '--' aggregate)
  3. for each region, fetch the csv_apbd export, hash the raw body into a
     DjpkFetchLog (audit trail), parse it, and upsert the report + its lines

Idempotent throughout: regions keyed on `djpk_code`, reports on
(region, tahun, report_type, periode), lines replaced per report. Re-running
updates in place and never duplicates. Every stored figure traces to the
DjpkFetchLog for the response it was parsed from.

Rate limiting is delegated to DjpkClient (delay + backoff); a configurable
sample of provinces/pemda can be passed so a run is explicit about what it
covered rather than crawling "as much as time allows".
"""

import hashlib

from django.db import transaction
from django.utils import timezone

from .client import DjpkClient
from .models import ApbdLine, ApbdRegion, ApbdReport, DjpkFetchLog, RegionLevel
from .parser import parse_apbd

# Codes that are aggregates, not real entities — never stored as regions.
_AGGREGATE_PEMDA = {"--", ""}


def _level_for(pemda_code):
    return RegionLevel.PROVINCE if pemda_code == "00" else RegionLevel.REGENCY


def upsert_region(djpk_prov, prov_name, pemda_code, pemda_name):
    """Get-or-create/update one ApbdRegion. Returns the instance."""
    djpk_code = f"{djpk_prov}{pemda_code}"
    region, _ = ApbdRegion.objects.update_or_create(
        djpk_code=djpk_code,
        defaults={
            "djpk_prov": djpk_prov,
            "djpk_pemda": pemda_code,
            "level": _level_for(pemda_code),
            "name": pemda_name,
            "prov_name": prov_name,
        },
    )
    return region


@transaction.atomic
def store_report(region, tahun, report_type, periode, url, http_status, raw, parsed, now):
    """Log the raw response, then upsert the report and replace its lines."""
    log = DjpkFetchLog.objects.create(
        kind="apbd",
        url=url,
        http_status=http_status,
        byte_count=len(raw),
        row_count=len(parsed),
        response_sha256=hashlib.sha256(raw).hexdigest(),
        fetched_at=now,
    )
    report, _ = ApbdReport.objects.update_or_create(
        region=region,
        tahun=tahun,
        report_type=report_type,
        periode=periode,
        defaults={"fetch_log": log, "line_count": len(parsed), "fetched_at": now},
    )
    # Replace lines wholesale — the parsed export is the full truth for this
    # (region, year, type, periode); no partial merge.
    report.lines.all().delete()
    ApbdLine.objects.bulk_create(
        [
            ApbdLine(
                report=report,
                line_index=r["line_index"],
                akun=r["akun"],
                akun_key=r["akun_key"],
                anggaran=r["anggaran"],
                realisasi=r["realisasi"],
                persentase=r["persentase"],
            )
            for r in parsed
        ]
    )
    return report


def ingest(
    tahun,
    report_type="realisasi",
    periode=12,
    provinces=None,
    client=None,
    on_progress=None,
):
    """Crawl one (tahun, report_type, periode) across regions.

    `provinces`: optional iterable of DJPK province codes to restrict the run
    (documented sampling). Default: all provinces the year exposes.
    `on_progress(region_name, done, total)` is called after each region.

    Returns a summary dict.
    """
    client = client or DjpkClient()

    prov_map = client.list_provinces(tahun)
    if provinces:
        want = {str(p).zfill(2) for p in provinces}
        prov_map = {k: v for k, v in prov_map.items() if k in want}

    # Enumerate all target (province, pemda) pairs first, so `total` is known
    # and the covered set is explicit. A transient failure enumerating one
    # province (the container's DNS is intermittently flaky) is recorded and
    # skipped — never allowed to abort the whole crawl. Re-running fills the gap.
    targets = []  # (djpk_prov, prov_name, pemda_code, pemda_name)
    errors = []
    for pcode, pname in prov_map.items():
        client.sleep()
        try:
            pemda_map = client.list_pemda(pcode, tahun)
        except Exception as exc:
            errors.append({"region": f"{pcode}**", "name": f"{pname} (enumerasi pemda)", "error": str(exc)})
            continue
        for dcode, dname in pemda_map.items():
            if dcode in _AGGREGATE_PEMDA:
                continue
            targets.append((pcode, pname, dcode, dname))

    total = len(targets)
    reports = 0
    for i, (pcode, pname, dcode, dname) in enumerate(targets, 1):
        region = upsert_region(pcode, pname, dcode, dname)
        try:
            client.sleep()
            url, status, raw = client.fetch_apbd(report_type, periode, tahun, pcode, dcode)
            parsed = parse_apbd(raw)
            store_report(region, tahun, report_type, periode, url, status, raw, parsed, timezone.now())
            reports += 1
        except Exception as exc:  # logged, not swallowed silently
            errors.append({"region": region.djpk_code, "name": dname, "error": str(exc)})
        if on_progress:
            on_progress(dname, i, total)

    return {
        "tahun": tahun,
        "report_type": report_type,
        "periode": periode,
        "provinces": sorted(prov_map),
        "regions": total,
        "reports": reports,
        "errors": errors,
    }
