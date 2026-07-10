"""Ingest Kemendagri/Dukcapil ArcGIS data into DukcapilRegion rows.

Idempotent: keyed on (level, code) with a bulk upsert, so re-running a level
updates rows in place rather than duplicating. Every page hashed into a
DukcapilFetchLog first (audit trail), then its rows written.
"""

import hashlib
import json

from django.db import transaction
from django.utils import timezone

from .client import SERVICES, DukcapilClient
from .models import DukcapilFetchLog, DukcapilRegion, current_period

CHUNK = 2000

_UPDATE_FIELDS = [
    "name", "parent_code", "prov_code", "kab_code", "kec_code",
    "no_prop", "no_kab", "no_kec", "no_kel",
    "nama_prop", "nama_kab", "nama_kec", "attributes", "fetch_log", "fetched_at",
]


def _int(v):
    try:
        return int(v)
    except (TypeError, ValueError):
        return None


def _ancestor_codes(a):
    """(prov_code, kab_code, kec_code) composed Kemendagri wilayah codes
    (2/4/6 digits) from a raw record's no_prop/no_kab/no_kec."""
    p, k, c = _int(a.get("no_prop")), _int(a.get("no_kab")), _int(a.get("no_kec"))
    prov = f"{p:02d}" if p is not None else ""
    kab = f"{prov}{k:02d}" if prov and k is not None else ""
    kec = f"{kab}{c:02d}" if kab and c is not None else ""
    return prov, kab, kec


def _codes(level, a):
    """(code, parent_code, name) for a raw attribute record at `level`.

    Codes are the composed Kemendagri wilayah code (prov/kab/kec) or, at
    village level, the full 10-digit `kode_desa_spatial`. Because the widths
    differ per level, codes are globally unique across levels, which lets
    parent relinking match `parent_code` -> `code` directly.
    """
    prov, kab, kec = _ancestor_codes(a)
    if level == "province":
        return prov, "", a.get("nama_prop") or prov
    if level == "regency":
        return kab, prov, a.get("nama_kab") or kab
    if level == "district":
        return kec, kab, a.get("nama_kec") or kec
    # village: prefer the authoritative full code; parent district = first 6.
    kode = _int(a.get("kode_desa_spatial"))
    vcode = str(kode) if kode is not None else kec
    return vcode, vcode[:6], a.get("nama_kel") or vcode


def _unique_code(base, level, a, seen):
    """Guarantee a unique per-level code. The source hierarchy fields are
    dirty (some rows have null no_prop/no_kab/no_kec, and a handful of
    genuine duplicate composed codes exist), so when the composed `base`
    code is empty or already used, fall back to the always-unique ArcGIS
    `objectid`. Deterministic across re-runs (same objectid -> same code),
    preserving idempotency; the clean 99%+ keep hierarchical codes so
    parent-by-prefix linking still works."""
    oid = a.get("objectid")
    code = base
    if not code or code in seen:
        code = f"{base or level[:3]}-{oid}"
    seen.add(code)
    return code


def _row(level, a, log, now, seen, period):
    base, parent_code, name = _codes(level, a)
    code = _unique_code(base, level, a, seen)
    prov_code, kab_code, kec_code = _ancestor_codes(a)
    return DukcapilRegion(
        code=code,
        level=level,
        period=period,
        name=name,
        parent_code=parent_code,
        prov_code=prov_code,
        kab_code=kab_code,
        kec_code=kec_code,
        no_prop=_int(a.get("no_prop")),
        no_kab=_int(a.get("no_kab")),
        no_kec=_int(a.get("no_kec")),
        no_kel=_int(a.get("no_kel")),
        nama_prop=a.get("nama_prop") or "",
        nama_kab=a.get("nama_kab") or "",
        nama_kec=a.get("nama_kec") or "",
        attributes=a,
        fetch_log=log,
        fetched_at=now,
    )


def ingest_level(level, period, client=None, on_page=None):
    """Crawl one level end to end and upsert its regions for `period`.
    Returns row count."""
    if level not in SERVICES:
        raise ValueError(f"Unknown level {level!r}; choose from {sorted(SERVICES)}")
    client = client or DukcapilClient()

    total = 0
    seen = set()  # per-level, spans pages: guarantees unique codes
    for url, status, raw, layer_id, feats in client.iter_pages(level):
        now = timezone.now()
        log = DukcapilFetchLog.objects.create(
            service=SERVICES[level],
            layer_id=layer_id,
            level=level,
            period=period,
            url=url,
            http_status=status,
            row_count=len(feats),
            response_sha256=hashlib.sha256(raw).hexdigest(),
            fetched_at=now,
        )
        rows = [_row(level, f.get("attributes", {}), log, now, seen, period) for f in feats]
        for i in range(0, len(rows), CHUNK):
            DukcapilRegion.objects.bulk_create(
                rows[i : i + CHUNK],
                update_conflicts=True,
                unique_fields=["level", "code", "period"],
                update_fields=_UPDATE_FIELDS,
            )
        total += len(rows)
        if on_page:
            on_page(level, total)
    return total


def relink_parents(period):
    """Resolve each region's `parent` FK from its `parent_code`, within one
    period (a snapshot's children link to that same snapshot's parents)."""
    code_to_id = {}
    for code, pk in DukcapilRegion.objects.filter(period=period).values_list("code", "id"):
        code_to_id[code] = pk  # codes are globally unique across levels
    updated = []
    for pk, parent_code in (
        DukcapilRegion.objects.filter(period=period).exclude(parent_code="").values_list("id", "parent_code")
    ):
        parent_id = code_to_id.get(parent_code)
        if parent_id:
            updated.append(DukcapilRegion(id=pk, parent_id=parent_id))
    for i in range(0, len(updated), CHUNK):
        DukcapilRegion.objects.bulk_update(updated[i : i + CHUNK], ["parent"])
    return len(updated)


def ingest(levels, period=None, on_page=None):
    """Ingest one or more levels for a period (default: current month), then
    relink parents once."""
    period = period or current_period()
    counts = {}
    for level in levels:
        counts[level] = ingest_level(level, period, on_page=on_page)
    relinked = relink_parents(period)
    return {"counts": counts, "relinked": relinked, "period": period}
