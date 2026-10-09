"""Carousel data packs (`carousel-data/1`): one ranked metric from ONE source,
for Carousel Press decks (the "Peta Angka" channel) and the /card/angka map
card. Read-only: it uses the same read helpers as the API and writes nothing.

    build_pack("bps", "413", "kabupaten", "2024") -> {"pack", "provenance", "map"}

- `pack` is exactly the carousel-data/1 shape: id, metric, unit, period, level,
  source, notes, rows [{label, code, value}] (top N then bottom N, descending).
  Codes stay in the source's own scheme (BPS domain_id, Kemendagri, DJPK).
- `provenance` traces every row to its stored response (URL with secrets
  redacted, SHA-256, fetch time) and records how derived values were computed.
- `map` is every region's value keyed by Kemendagri code, so a map can be drawn
  on the Dukcapil/BIG geometry. BPS regencies go through the name-based regency
  crosswalk, never code identity. Unresolved regions are listed, not guessed.

Guardrails (docs/RECON_CAROUSEL.md §5.3): one source per pack; refuse when
fewer regions than expected have a value (unless allow_partial, which writes
"n = X dari Y" into the notes); refuse when a BPS variable has several breakdowns
or periods in that year and none was chosen; refuse when two rows land on one
Kemendagri region. Values are stored as-is; rounding is a rendering concern.
"""

import re
import unicodedata

from catalog.models import AdminLevel, Domain, Variable
from djpk.derived import DERIVED_BY_KEY as DJPK_DERIVED
from djpk.models import ApbdRegion, ApbdReport
from dukcapil.derived import DERIVED_BY_FIELD
from dukcapil.models import DukcapilIndicator, DukcapilRegion
from stats.models import DataPoint

from .djpk_views import _metric_values as djpk_metric_values
from .dukcapil_views import (
    _metric_values as dukcapil_metric_values,
    _periods as dukcapil_periods,
    _RegencyIndex,
    _resolve_dukcapil_regency,
    bps_province_to_kemendagri,
    bps_regency_status,
)

FORMAT = "carousel-data/1"
SOURCES = ("bps", "dukcapil", "djpk")
LEVELS = ("provinsi", "kabupaten", "kecamatan")
LEVEL_NOUN = {"provinsi": "provinsi", "kabupaten": "kabupaten/kota", "kecamatan": "kecamatan"}
LEVEL_TITLE = {"provinsi": "Provinsi", "kabupaten": "Kabupaten/Kota", "kecamatan": "Kecamatan"}
_BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"]
_NO_UNIT = {"", "tidak ada satuan", "-"}
_DUKCAPIL_PREFIX = {"Kota": "Kota", "Kabupaten": "Kab.", "Kota Administrasi": "Kota Adm.", "Kabupaten Administrasi": "Kab. Adm."}


class PackError(ValueError):
    """The pack can't be built honestly. The message says why and what to pass."""


def slugify(text, limit=40):
    """Carousel Press' slug rule: NFKD, strip marks, a-z0-9 and '-', max 40."""
    s = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode().lower()
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s[:limit].rstrip("-")


def fmt_int(n):
    return f"{n:,}".replace(",", ".")


def _bulan_tahun(period):
    """'2026-10' -> 'Okt 2026'."""
    y, m = period.split("-")
    return f"{_BULAN[int(m) - 1]} {y}"


def _iso(dt):
    return dt.isoformat() if dt else None


# --- BPS ---------------------------------------------------------------------

def _bps_label(domain, level):
    if level == "provinsi":
        return re.sub(r"^Di\b", "DI", re.sub(r"\bDki\b", "DKI", domain.domain_name))
    prefix = "Kota" if bps_regency_status(domain.domain_id) == "Kota" else "Kab."
    return f"{prefix} {domain.domain_name}"


def _bps(metric, level, period, opts):
    if level == "kecamatan":
        raise PackError("BPS di NusaStats tidak punya nilai tingkat kecamatan.")
    var = Variable.objects.filter(variable_id=str(metric)).first()
    if var is None:
        raise PackError(f"Variabel BPS {metric} tidak ada di katalog.")
    admin = AdminLevel.PROVINCE if level == "provinsi" else AdminLevel.REGENCY
    qs = DataPoint.objects.filter(variable=var, admin_level=admin)
    qs = qs.filter(period__period_id=opts["th"]) if opts.get("th") else qs.filter(year=int(period))
    periods = sorted(set(qs.values_list("period__period_id", "period__label")))
    if not periods:
        raise PackError(f"Tidak ada nilai BPS var {metric} untuk {LEVEL_NOUN[level]} {period}.")
    if len(periods) > 1:
        listed = ", ".join(f"th={p} ({lbl})" for p, lbl in periods)
        raise PackError(f"Ada {len(periods)} periode BPS di tahun {period}: {listed}. Pilih satu dengan th=.")
    turvars = sorted(set(qs.values_list("turvar_id", "turvar_label")))
    turvar = opts.get("turvar")
    if turvar is None:
        if len(turvars) > 1:
            listed = ", ".join(f"turvar={t} ({lbl or '-'})" for t, lbl in turvars)
            raise PackError(f"Variabel ini punya beberapa rincian: {listed}. Pilih satu dengan turvar=.")
        turvar = turvars[0][0]
    qs = qs.filter(turvar_id=str(turvar)).select_related("domain", "source_check_log", "period")
    turvar_label = dict(turvars).get(str(turvar), "")

    index = _RegencyIndex(dukcapil_periods()[0]) if admin == AdminLevel.REGENCY else None

    def geo(domain):
        if admin == AdminLevel.PROVINCE:
            return bps_province_to_kemendagri(domain.domain_id)
        r = _resolve_dukcapil_regency(domain.domain_id, domain.domain_name, index)
        return r.code if r else ""

    rows, prov_refs, seen = [], [], set()
    for dp in qs:
        if dp.domain.domain_id in seen:
            raise PackError(f"Dua nilai untuk wilayah BPS {dp.domain.domain_id}; data tidak bisa diurutkan.")
        seen.add(dp.domain.domain_id)
        log = dp.source_check_log
        rows.append({"code": dp.domain.domain_id, "label": _bps_label(dp.domain, level), "value": dp.value,
                     "geo": geo(dp.domain)})
        prov_refs.append({"code": dp.domain.domain_id, "check_log_id": log.id if log else None,
                          "url": log.url if log else None, "sha256": log.response_hash if log else None,
                          "fetched_at": _iso(log.requested_at) if log else None})

    # The universe: today's BPS domains at this level. A pre-2022 Papua domain
    # whose kabupaten moved to a 2022 province is replaced by its successor.
    universe = Domain.objects.filter(admin_level=admin, successors__isnull=True)
    expected = [(d.domain_id, geo(d)) for d in universe]

    unit = opts.get("unit") or var.unit
    if unit.strip().lower() in _NO_UNIT:
        raise PackError(f"BPS tidak memberi satuan untuk var {metric} ({var.name}). Isi unit=, mis. 'indeks'.")
    breakdown = f" ({turvar_label})" if turvar_label and str(turvar) != "0" else ""
    plabel = periods[0][1]
    notes = []
    if any(r["code"][:2] in {"92", "95", "96", "97"} for r in rows):
        notes.append("Kode wilayah = kode BPS; 4 provinsi baru Papua memakai kode BPS 9200/9500/9600/9700."
                     if level == "provinsi" else
                     "Kode wilayah = kode BPS; kabupaten di 4 provinsi baru Papua memakai kode BPS baru "
                     "(92xx/95xx/96xx/97xx).")
    return {
        "rows": rows,
        "expected": expected,
        "metric": var.name + breakdown,
        "unit": unit,
        "period": plabel,
        "source": f"BPS — {var.name}{breakdown} menurut {LEVEL_TITLE[level]}, {plabel}",
        "notes": notes,
        "provenance": {"source": "bps", "variable_id": var.variable_id, "variable_name": var.name,
                       "turvar_id": str(turvar), "period_id": periods[0][0], "rows": prov_refs},
    }


# --- Dukcapil ----------------------------------------------------------------

def _dukcapil(metric, level, period, opts):
    periods = dukcapil_periods()
    period = period or (periods[0] if periods else None)
    if period not in periods:
        raise PackError(f"Snapshot Dukcapil {period} tidak ada. Tersedia: {', '.join(periods)}.")
    spec = DERIVED_BY_FIELD.get(metric)
    ind = None if spec else DukcapilIndicator.objects.filter(field=metric).first()
    if spec is None and ind is None:
        raise PackError(f"Indikator Dukcapil '{metric}' tidak dikenal.")
    dlevel = {"provinsi": "province", "kabupaten": "regency", "kecamatan": "district"}[level]
    qs = DukcapilRegion.objects.filter(level=dlevel, period=period)
    values = dukcapil_metric_values(qs, metric)

    regions = {
        r["code"]: r
        for r in qs.values("code", "name", "status", "kab_code", "fetch_log_id", "fetch_log__url",
                           "fetch_log__response_sha256", "fetch_log__fetched_at")
    }
    kab_label = {}
    if dlevel == "district":
        for r in DukcapilRegion.objects.filter(level="regency", period=period).values("code", "name", "status"):
            kab_label[r["code"]] = f"{_DUKCAPIL_PREFIX.get(r['status'], '')} {r['name']}".strip()

    def label(r):
        if dlevel == "province":
            return r["name"]
        if dlevel == "regency":
            return f"{_DUKCAPIL_PREFIX.get(r['status'], '')} {r['name']}".strip()
        parent = kab_label.get(r["kab_code"])
        return f"{r['name']}, {parent}" if parent else r["name"]

    rows, prov_refs = [], []
    for code, (_name, value) in values.items():
        r = regions[code]
        rows.append({"code": code, "label": label(r), "value": value, "geo": code})
        prov_refs.append({"code": code, "fetch_log_id": r["fetch_log_id"], "url": r["fetch_log__url"],
                          "sha256": r["fetch_log__response_sha256"],
                          "fetched_at": _iso(r["fetch_log__fetched_at"])})

    name = spec["label_id"] if spec else ind.label_id
    unit = opts.get("unit") or (spec["unit"] if spec else ind.unit)
    accessed = _bulan_tahun(period)
    uses_big = bool(spec) and "luas_big" in spec["requires"]
    notes = ["Penduduk terdaftar (administrasi kependudukan), bukan hasil sensus. "
             f"Tanggal rujukan data Dukcapil tidak tercantum di sumber; snapshot diakses {accessed}."]
    if spec:
        notes.append(f"Dihitung NusaStats dari kolom Dukcapil: {', '.join(spec['requires'])}.")
    if uses_big:
        notes.append("Luas wilayah dari peta batas desa BIG 1:10.000 (dijumlahkan NusaStats).")
    source = f"Ditjen Dukcapil Kemendagri — {name} per {LEVEL_TITLE[level]}, diakses {accessed}"
    if uses_big:
        source += "; luas: BIG 1:10.000"
    return {
        "rows": rows,
        "expected": [(c, c) for c in regions],
        "metric": name,
        "unit": unit,
        "period": period,
        "source": source,
        "notes": notes,
        "provenance": {"source": "dukcapil", "field": metric, "derived": bool(spec),
                       "requires": list(spec["requires"]) if spec else [metric], "period": period,
                       "rows": prov_refs},
    }


# --- DJPK ----------------------------------------------------------------------

def _djpk(metric, level, period, opts):
    if level == "kecamatan":
        raise PackError("DJPK hanya punya APBD provinsi dan kabupaten/kota.")
    tahun = int(period)
    dlevel = "province" if level == "provinsi" else "regency"
    values, unit, meta = djpk_metric_values(tahun, "realisasi", 12, dlevel, metric, "realisasi")
    if not values:
        raise PackError(f"Tidak ada realisasi APBD '{metric}' untuk {LEVEL_NOUN[level]} {tahun}.")
    spec = DJPK_DERIVED.get(metric)
    name = spec["label_id"] if spec else meta.get("label_id", metric)

    reports = {
        r["region__djpk_code"]: r
        for r in ApbdReport.objects.filter(tahun=tahun, report_type="realisasi", periode=12, region__level=dlevel)
        .values("region__djpk_code", "fetch_log_id", "fetch_log__url", "fetch_log__response_sha256",
                "fetch_log__fetched_at")
    }
    rows, prov_refs = [], []
    for djpk_code, (rname, value, kemen) in values.items():
        label = re.sub(r"^Prov(insi|\.)?\s+", "", rname) if dlevel == "province" else rname
        rows.append({"code": kemen or djpk_code, "label": label, "value": value, "geo": kemen})
        rep = reports.get(djpk_code, {})
        prov_refs.append({"code": kemen, "djpk_code": djpk_code, "fetch_log_id": rep.get("fetch_log_id"),
                          "url": rep.get("fetch_log__url"), "sha256": rep.get("fetch_log__response_sha256"),
                          "fetched_at": _iso(rep.get("fetch_log__fetched_at"))})

    # Universe: every distinct Kemendagri region DJPK has an entity for (the old
    # and new codes of a moved Papua kabupaten share one Kemendagri code).
    kemens = (ApbdRegion.objects.filter(level=dlevel).exclude(kemendagri_code="")
              .order_by().values_list("kemendagri_code", flat=True).distinct())
    notes = []
    if spec:
        notes.append(f"Rasio dihitung NusaStats dari realisasi APBD: {name}.")
    if dlevel == "regency":
        notes.append("Kota/Kabupaten Administrasi di DKI Jakarta tidak punya APBD sendiri.")
    return {
        "rows": rows,
        "expected": [(k, k) for k in kemens],
        "metric": name,
        "unit": opts.get("unit") or unit,
        "period": str(tahun),
        "source": f"DJPK Kemenkeu — Realisasi APBD {LEVEL_TITLE[level]} {tahun}, {name}",
        "notes": notes,
        "provenance": {"source": "djpk", "akun_key": metric, "derived": bool(spec),
                       "requires": list(spec["requires"]) if spec else [metric], "tahun": tahun,
                       "report_type": "realisasi", "periode": 12, "rows": prov_refs},
    }


_BUILDERS = {"bps": _bps, "dukcapil": _dukcapil, "djpk": _djpk}


def build_pack(source, metric, level, period=None, *, prov=None, top=5, bottom=5, allow_partial=False,
               turvar=None, th=None, unit=None, label_metric=None, notes=None, pack_id=None):
    """See the module docstring. `prov` (Kemendagri 2-digit) limits the ranking
    to one province's regions; it is ignored at provinsi level."""
    if source not in SOURCES:
        raise PackError(f"source harus salah satu dari {', '.join(SOURCES)}.")
    if level not in LEVELS:
        raise PackError(f"level harus salah satu dari {', '.join(LEVELS)}.")
    if source != "dukcapil" and not period:
        raise PackError("period (tahun) wajib untuk BPS dan DJPK.")
    if level == "provinsi":
        prov = None
    built = _BUILDERS[source](str(metric), level, period, {"turvar": turvar, "th": th, "unit": unit})
    rows = built["rows"]
    expected = built["expected"]
    if prov:
        rows = [r for r in rows if (r["geo"] or "")[:2] == prov]
        expected = [e for e in expected if (e[1] or "")[:2] == prov]

    geos = [r["geo"] for r in rows if r["geo"]]
    dupes = sorted({g for g in geos if geos.count(g) > 1})
    if dupes:
        raise PackError(f"Lebih dari satu nilai untuk wilayah Kemendagri {', '.join(dupes)}; tidak bisa dipetakan.")
    n, total = len(rows), len(expected)
    if n == 0:
        raise PackError("Tidak ada nilai untuk cakupan ini.")
    if n > total:
        raise PackError(f"{n} nilai untuk {total} wilayah: ada wilayah ganda, periksa datanya.")

    ordered = sorted(rows, key=lambda r: (-r["value"], r["code"]))
    for i, r in enumerate(ordered, start=1):
        r["rank"] = i
    picked = ordered if n <= top + bottom else ordered[:top] + ordered[n - bottom:]

    scope = LEVEL_NOUN[level]
    where = ""
    if prov:
        pname = DukcapilRegion.objects.filter(level="province", code=prov).values_list("name", flat=True).first()
        where = f" di {pname or prov}"
    pack_notes = []
    if n < total:
        if not allow_partial:
            raise PackError(f"n = {fmt_int(n)} dari {fmt_int(total)} {scope}{where} punya nilai. "
                            "Pakai allow_partial bila tetap ingin dibuat (catatan n akan ditulis).")
        pack_notes.append(f"n = {fmt_int(n)} dari {fmt_int(total)} {scope}{where}; jangan disebut "
                          "tertinggi/terendah se-Indonesia.")
    if n <= top + bottom:
        pack_notes.append(f"Semua {fmt_int(n)} {scope}{where}.")
    else:
        pack_notes.append(f"{top} tertinggi dan {bottom} terendah dari {fmt_int(n)} {scope}{where}.")
        for edge, nxt in ((ordered[top - 1], ordered[top]), (ordered[n - bottom], ordered[n - bottom - 1])):
            if edge["value"] == nxt["value"]:
                pack_notes.append(f"Ada nilai kembar di batas peringkat ({edge['value']}); urutan nilai kembar "
                                  "mengikuti kode wilayah.")
                break
    pack_notes += built["notes"]
    if notes:
        pack_notes.append(notes)

    pid = pack_id or slugify(f"{source}-{metric}-{level}-{built['period']}" + (f"-{prov}" if prov else ""))
    pack = {
        "format": FORMAT,
        "id": pid,
        "metric": label_metric or built["metric"],
        "unit": built["unit"],
        "period": built["period"],
        "level": level,
        "source": built["source"],
        "notes": " ".join(pack_notes),
        "rows": [{"label": r["label"], "code": r["code"], "value": r["value"]} for r in picked],
    }
    picked_codes = {r["code"] for r in picked}
    provenance = {**built["provenance"], "pack_id": pid,
                  "rows": [p for p in built["provenance"]["rows"] if p["code"] in picked_codes]}
    values = [r["value"] for r in ordered]
    return {
        "pack": pack,
        "provenance": provenance,
        "map": {
            "level": level,
            "prov": prov or "",
            "n": n,
            "expected": total,
            "min": min(values),
            "max": max(values),
            "values": [{"geo": r["geo"], "code": r["code"], "label": r["label"], "value": r["value"],
                        "rank": r["rank"]} for r in ordered if r["geo"]],
            "unmatched": [{"code": r["code"], "label": r["label"]} for r in ordered if not r["geo"]],
        },
    }
