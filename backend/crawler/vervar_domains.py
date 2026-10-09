"""Domains BPS uses in its `data` responses but not in its `domain` endpoint.

Confirmed against stored responses (2026-10): BPS's `domain?type=prov` still
lists the pre-2022 34 provinces, and `kabbyprov` returns nothing for the new
codes. But `data` responses carry the four provinces created in 2022 and their
26 kabupaten/kota under new vervar codes:

    9200 Papua Barat Daya · 9500 Papua Selatan · 9600 Papua Tengah · 9700 Papua Pegunungan

Without Domain rows for them, stats.ingest skips those values, so 2024+
kabupaten rankings had 488 regions instead of 514 and lost their extremes.

The scope is deliberately this documented split only. Stored responses also
carry other unknown 4-digit codes (5400 Dili, pre-2012 Kaltim codes for the
Kalimantan Utara regencies, monetary aggregates such as 1000/2000/9999), and
those are reported, never created.

Each new regency is linked to the pre-2022 BPS domain it replaces (9501
Merauke <- 9401 Merauke). The link is made by name and Kota/Kabupaten status
inside BPS's own scheme, never by code, and only when exactly one candidate
matches. The new domain takes that predecessor's domain-endpoint name, so
naming stays consistent with crawl_domains (BPS data labels vary: "KAB
SORONG", "TIMIKA", "PUNJAK JAYA").
"""

import re
from collections import defaultdict

from catalog.models import AdminLevel, CoverageCheckLog, Domain, DomainSource

from .stored import latest_data_log_ids

# BPS province prefix of each 2022 Papua province -> the pre-2022 provinces
# its kabupaten were split out of (Papua Barat 91, Papua 94).
NEW_PAPUA_PROVINCES = {"92": ("91",), "95": ("94",), "96": ("94",), "97": ("94",)}

_TAG_RE = re.compile(r"<[^>]+>")
_PREFIX_RE = re.compile(r"^(prov|provinsi|kab|kabupaten|kota)\s+", re.I)


def _strip(label):
    return _PREFIX_RE.sub("", _TAG_RE.sub("", label or "").strip()).strip()


def _norm(s):
    return re.sub(r"[^a-z0-9]", "", (s or "").lower())


def _is_kota(code):
    return int(code[2:4]) >= 71


def _collect_labels(log_ids):
    """{code: {"labels": set, "log_id": newest log naming it}} for every
    vervar code under a 2022 Papua province, plus {code: label} for other
    unknown 4-digit codes (reported only)."""
    known = set(Domain.objects.values_list("domain_id", flat=True))
    found = defaultdict(lambda: {"labels": set(), "log_id": 0})
    other = {}
    for log_id, body in CoverageCheckLog.objects.filter(id__in=log_ids).values_list("id", "raw_body").iterator():
        for row in (body or {}).get("vervar") or []:
            code = str(row.get("val", ""))
            if not (len(code) == 4 and code.isdigit()) or code in known:
                continue
            if code[:2] in NEW_PAPUA_PROVINCES:
                entry = found[code]
                entry["labels"].add(str(row.get("label", "")))
                entry["log_id"] = max(entry["log_id"], log_id)
            else:
                other.setdefault(code, str(row.get("label", "")))
    return found, other


def discover():
    """Plan the missing domains from stored responses. Pure read. Returns
    {"create": [...], "unmatched": [...], "other_unknown": {code: label}}."""
    log_ids = [i for ids in latest_data_log_ids().values() for i in ids]
    found, other = _collect_labels(log_ids)

    old_regencies = defaultdict(list)
    for d in Domain.objects.filter(admin_level=AdminLevel.REGENCY).select_related("parent_province"):
        if d.parent_province and d.parent_province.domain_id[:2] in {"91", "94"}:
            old_regencies[(d.parent_province.domain_id[:2], _is_kota(d.domain_id), _norm(d.domain_name))].append(d)

    create, unmatched = [], []
    for code in sorted(found):
        labels = found[code]["labels"]
        names = {_strip(lbl) for lbl in labels}
        base = {"domain_id": code, "labels": sorted(labels), "source_check_log_id": found[code]["log_id"]}
        if code.endswith("00"):
            titled = {n.title() for n in names}
            if len(titled) != 1:
                unmatched.append({**base, "reason": f"province labels disagree: {sorted(titled)}"})
                continue
            create.append({**base, "domain_name": titled.pop(), "admin_level": AdminLevel.PROVINCE,
                           "parent": None, "predecessor": None})
            continue
        candidates = {
            d.domain_id: d
            for old_prov in NEW_PAPUA_PROVINCES[code[:2]]
            for n in names
            for d in old_regencies.get((old_prov, _is_kota(code), _norm(n)), [])
        }
        if len(candidates) != 1:
            unmatched.append({**base, "reason": f"{len(candidates)} pre-2022 candidates: {sorted(candidates)}"})
            continue
        pred = next(iter(candidates.values()))
        create.append({**base, "domain_name": pred.domain_name, "admin_level": AdminLevel.REGENCY,
                       "parent": code[:2] + "00", "predecessor": pred.domain_id})
    return {"create": create, "unmatched": unmatched, "other_unknown": dict(sorted(other.items()))}


def apply(plan):
    """Upsert the planned domains (idempotent on domain_id). Provinces first,
    so regencies can point at them. Returns the number of rows written."""
    written = 0
    for item in sorted(plan["create"], key=lambda i: i["admin_level"] != AdminLevel.PROVINCE):
        parent = Domain.objects.filter(domain_id=item["parent"]).first() if item["parent"] else None
        if item["parent"] and parent is None:
            continue
        Domain.objects.update_or_create(
            domain_id=item["domain_id"],
            defaults={
                "domain_name": item["domain_name"],
                "admin_level": item["admin_level"],
                "parent_province": parent,
                "predecessor": Domain.objects.filter(domain_id=item["predecessor"]).first()
                if item["predecessor"] else None,
                "source": DomainSource.DATA_VERVAR,
                "source_check_log_id": item["source_check_log_id"],
            },
        )
        written += 1
    return written
