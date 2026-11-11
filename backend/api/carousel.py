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
from decimal import ROUND_HALF_UP, Decimal

from catalog.models import AdminLevel, Domain, Variable
from djpk.derived import DERIVED_BY_KEY as DJPK_DERIVED
from djpk.models import ApbdRegion, ApbdReport
from peta.models import PetaIndicator, PetaLoadLog, PetaRegion, PetaValue
from dukcapil.derived import DERIVED_BY_FIELD
from dukcapil.models import DukcapilIndicator, DukcapilRegion
from dukcapil.twins import polygon_twins
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
SOURCES = ("bps", "dukcapil", "djpk", "peta")
LEVELS = ("provinsi", "kabupaten", "kecamatan")
LEVEL_NOUN = {"provinsi": "provinsi", "kabupaten": "kabupaten/kota", "kecamatan": "kecamatan"}
LEVEL_TITLE = {"provinsi": "Provinsi", "kabupaten": "Kabupaten/Kota", "kecamatan": "Kecamatan"}
_BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"]
_NO_UNIT = {"", "tidak ada satuan", "-"}
_DUKCAPIL_PREFIX = {"Kota": "Kota", "Kabupaten": "Kab.", "Kota Administrasi": "Kota Adm.", "Kabupaten Administrasi": "Kab. Adm."}


class PackError(ValueError):
    """The pack can't be built honestly. The message says why and what to pass.
    `details` (JSON-safe) lets a client act on it, e.g. offer allow_partial."""

    def __init__(self, message, **details):
        super().__init__(message)
        self.details = details


def _region_names(geos, level):
    """Kemendagri code -> "Name, Kab. X" from the latest Dukcapil snapshot, for refusal messages."""
    dlevel = {"provinsi": "province", "kabupaten": "regency", "kecamatan": "district"}[level]
    periods = dukcapil_periods()
    if not geos or not periods:
        return {}
    qs = DukcapilRegion.objects.filter(period=periods[0])
    rows = list(qs.filter(level=dlevel, code__in=geos).values("code", "name", "status", "kab_code"))
    kabs = {r["code"]: f"{_DUKCAPIL_PREFIX.get(r['status'], '')} {r['name']}".strip()
            for r in qs.filter(level="regency", code__in={x["kab_code"] for x in rows}).values("code", "name", "status")}
    out = {}
    for r in rows:
        name = r["name"] if dlevel == "province" else f"{_DUKCAPIL_PREFIX.get(r['status'], '')} {r['name']}".strip()
        if dlevel == "district" and kabs.get(r["kab_code"]):
            name = f"{r['name']}, {kabs[r['kab_code']]}"
        out[r["code"]] = name
    return out


def slugify(text, limit=40):
    """Carousel Press' slug rule: NFKD, strip marks, a-z0-9 and '-', max 40."""
    s = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode().lower()
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s[:limit].rstrip("-")


_SOURCE_ID = {"bps": "bps", "dukcapil": "duk", "djpk": "djpk", "peta": "peta"}
_LEVEL_ID = {"provinsi": "prov", "kabupaten": "kab", "kecamatan": "kec"}


# Island groups for a multi-province ranking: a pack over exactly one of them is
# called by the group's name ("kecamatan di Sulawesi"). Kemendagri codes.
PROV_GROUPS = {
    "Sumatera": ("11", "12", "13", "14", "15", "16", "17", "18", "19", "21"),
    "Jawa": ("31", "32", "33", "34", "35", "36"),
    "Bali dan Nusa Tenggara": ("51", "52", "53"),
    "Kalimantan": ("61", "62", "63", "64", "65"),
    "Sulawesi": ("71", "72", "73", "74", "75", "76"),
    "Maluku": ("81", "82"),
    "Papua": ("91", "92", "93", "94", "95", "96"),
}


def parse_provs(prov):
    """`prov` as one or more Kemendagri province codes ("73", "71,72,73" or
    "71-72-73") -> a sorted tuple, or () for all of Indonesia."""
    if not prov:
        return ()
    codes = sorted(set(re.split(r"[,\-\s]+", str(prov).strip())) - {""})
    bad = [c for c in codes if not re.fullmatch(r"\d{2}", c)]
    if bad:
        raise PackError(f"prov: kode provinsi 2 digit, dipisah koma ({', '.join(bad)}).")
    return tuple(codes)


def provs_name(provs):
    """What a set of provinces is called in the text: its island group's name,
    the one province's name, or the names listed."""
    for group, codes in PROV_GROUPS.items():
        if tuple(sorted(codes)) == provs and len(provs) > 1:
            return group
    names = dict(DukcapilRegion.objects.filter(level="province", code__in=provs).values_list("code", "name"))
    listed = [names.get(c, c) for c in provs]
    return listed[0] if len(listed) == 1 else f"{', '.join(listed[:-1])} dan {listed[-1]}"


def pack_slug(source, metric, level, period, prov=None):
    """A pack id that stays unique within the 40-char slug cap: the metric part
    is what gets shortened, never the level, period or province."""
    tail = slugify(f"{_LEVEL_ID[level]}-{period}" + (f"-{prov}" if prov else ""))
    head = f"{_SOURCE_ID[source]}-"
    room = 40 - len(head) - len(tail) - 1
    return f"{head}{slugify(str(metric), limit=room)}-{tail}"


def fmt_int(n):
    return f"{n:,}".replace(",", ".")


_SOURCE_SHORT = {"bps": "BPS", "dukcapil": "DUKCAPIL", "djpk": "DJPK", "peta": "PETA"}  # peta packs set their own


def short_metric(name):
    """Headline form of a metric name. Drops what BPS packs into its names: a
    leading '[Metode Baru]', an SDG indicator code ('3.a.1', '10.1.1.(f)'), a
    trailing 'menurut/per Kabupaten/Kota' or 'Kabupaten/Kota', and a trailing
    '(...)'."""
    s = re.sub(r"^\[[^\]]*\]\s*", "", name)
    s = re.sub(r"^\d+(\.\w+)*\.?(\(\w\))?\*?\s+", "", s)
    s = re.sub(r"\s+(menurut|per)\s+(kabupaten|kab|provinsi|kecamatan).*$", "", s, flags=re.I)
    s = re.sub(r"\s+kabupaten/kota$", "", s, flags=re.I)
    s = re.sub(r"\s*\([^)]*\)\s*$", "", s)
    return re.sub(r"\s{2,}", " ", s).strip() or name


def kicker_for(source, period):
    """The slide eyebrow, e.g. 'DATA • BPS 2025'."""
    return f"DATA • {_SOURCE_SHORT[source]} {str(period)[:4]}"


def fmt_num(v, decimals=2, fixed=False):
    """Indonesian number: thousands dot, decimal comma, at most `decimals`
    decimals (half up, trailing zeros dropped). 89.55 -> '89,55', 582327 -> '582.327'.
    `fixed` keeps exactly `decimals` (14.6 -> '14,60'), so a column of values lines up."""
    q = Decimal(str(v)).quantize(Decimal(1).scaleb(-decimals), rounding=ROUND_HALF_UP)
    whole, _, frac = f"{q:,.{decimals}f}".partition(".")
    if not fixed:
        frac = frac.rstrip("0")
    return whole.replace(",", ".") + ("," + frac if frac else "")


def fmt_value(v, unit, fixed=None):
    """A value with its unit, the way a slide shows it (Peta Angka rules: at
    most 2 decimals, whole numbers for people, large Rupiah in words).
    `fixed` (a pack passes it for all its values): two decimals even on a whole
    value (4.008,00 jiwa/km² next to 4.134,28), so one ranking is uniform."""
    u = (unit or "").strip()
    ul = u.lower()
    # Fractional values always carry exactly two decimals (14,60%, 4.540,60 jiwa/km²,
    # 37,50 tahun): a ranking's values are then all the same length and line up. An exact
    # whole number (an index of 52) stays whole, unless the ranking it sits in has
    # fractional values (`fixed`). Percentages always have two.
    frac = v != int(v) if fixed is None else fixed
    if ul in ("%", "persen"):
        return f"{fmt_num(v, fixed=True)}%"
    if u == "m":
        # Heights and relief from a 30 m DEM: whole metres (more decimals would be false precision).
        return f"{fmt_num(v, 0)} m"
    if u == "°":
        return f"{fmt_num(v, 1, fixed=True)}°"
    if ul.split(" ")[0] in ("jiwa", "orang", "kk", "rumah", "unit"):
        return f"{fmt_num(v, 0)} {u}"
    if u == "Rp" or ul == "rupiah":
        for size, word in ((1e12, "triliun"), (1e9, "miliar"), (1e6, "juta")):
            if abs(v) >= size:
                return f"Rp{fmt_num(v / size, 1)} {word}"
        return f"Rp{fmt_num(v, 0)}"
    if ul.startswith("ribu rupiah"):
        # BPS per-capita spending comes in thousands: 26.387 ribu -> Rp26,4 juta/orang/tahun.
        return fmt_value(v * 1000, "Rp") + ul[len("ribu rupiah"):]
    if ul.startswith("rupiah"):
        return f"Rp{fmt_num(v, 0)}{u[len('rupiah'):]}"
    if ul.startswith("indeks") or not u or re.fullmatch(r"0\s*[-–]\s*100", u):
        return fmt_num(v, fixed=frac)
    return f"{fmt_num(v, fixed=frac)} {ul if u.istitle() and ' ' not in u else u}"


def _bulan_tahun(period):
    """'2026-10' -> 'Okt 2026'."""
    y, m = period.split("-")
    return f"{_BULAN[int(m) - 1]} {y}"


def period_label(period):
    """How a slide names the period: a year as-is, a Dukcapil snapshot as 'data Okt 2026'."""
    return f"data {_bulan_tahun(period)}" if re.fullmatch(r"\d{4}-\d{2}", str(period)) else str(period)


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
        "source": (f"BPS — {var.name}{breakdown}, {plabel}" if re.search(r"\bmenurut\b", var.name, re.I)
                   else f"BPS — {var.name}{breakdown} menurut {LEVEL_TITLE[level]}, {plabel}"),
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
    # A region drawn as two polygons arrives as two rows with the same numbers:
    # count it once (dukcapil/twins.py), and say so in the notes (build_pack).
    twins = polygon_twins(qs)
    values = {c: v for c, v in dukcapil_metric_values(qs, metric).items() if c not in twins}

    regions = {
        r["code"]: r
        for r in qs.values("code", "name", "status", "kab_code", "fetch_log_id", "fetch_log__url",
                           "fetch_log__response_sha256", "fetch_log__fetched_at")
        if r["code"] not in twins
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
        row = {"code": code, "label": label(r), "value": value, "geo": code}
        if dlevel == "district" and kab_label.get(r["kab_code"]):
            # The ranking card shows them on two lines, under the kabupaten's emblem.
            row.update(name=r["name"], parent=kab_label[r["kab_code"]])
        rows.append(row)
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
        "twins": twins,
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
        # DJPK names are verbatim; a few drop the dot ("Kab Musi Rawas Utara").
        label = (re.sub(r"^Prov(insi|\.)?\s+", "", rname) if dlevel == "province"
                 else re.sub(r"^Kab\s+", "Kab. ", rname))
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


# --- Peta Wilayah: land cover (ESA WorldCover) and terrain (Copernicus DEM) ------

# Rankable Peta indicator groups and what each is read from.
PETA = {
    "tutupan": {"dataset": "esa_worldcover_2021_v200", "short": "ESA WORLDCOVER", "noun": "ESA WorldCover"},
    "medan": {"dataset": "copernicus_dem_glo30", "short": "COPERNICUS DEM", "noun": "Copernicus DEM GLO-30"},
}
PETA_GROUPS = tuple(PETA)
# How a province value is built from its kabupaten/kota. "area": area-weighted mean (shares
# of area, and means over equal-area pixels); "max": the highest. Absent: not combinable
# (a median or a percentile spread can't be rebuilt from the parts), so no provinsi ranking.
_PETA_PROVINCE = {"elevation_max": "max", "elevation_median": None, "relief": None}
# Caveats a slide must carry, per indicator.
_PETA_NOTES = {
    "lc_tree": "Tutupan pohon termasuk perkebunan (sawit, akasia): bukan luas hutan.",
    "elevation_max": "Titik tertinggi = piksel DEM 30 m tertinggi (permukaan, termasuk tajuk pohon): "
                     "bukan tinggi resmi puncak gunung.",
    "lowland_lt_5": "Batas bawah: DEM mengukur permukaan (tajuk dan bangunan), jadi dataran rendah sebenarnya bisa lebih luas.",
    "lowland_lt_10": "Batas bawah: DEM mengukur permukaan (tajuk dan bangunan), jadi dataran rendah sebenarnya bisa lebih luas.",
    "relief_bergunung": "Kelas relief NusaStats (selisih tinggi dalam jendela 1 km), bukan klasifikasi resmi.",
    "relief_datar": "Kelas relief NusaStats (selisih tinggi dalam jendela 1 km), bukan klasifikasi resmi.",
}


def _peta_indicator(metric):
    ind = PetaIndicator.objects.filter(key=metric, group__in=PETA_GROUPS).first()
    if ind is None:
        keys = ", ".join(PetaIndicator.objects.filter(group__in=PETA_GROUPS).order_by("group", "sort")
                         .values_list("key", flat=True))
        raise PackError(f"Indikator peta '{metric}' tidak dikenal. Pilihan: {keys}.")
    return ind


def _peta_context(ind, regions, values):
    """What a Peta pack says about its data: dataset record, period, notes, source line."""
    spec = PETA[ind.group]
    log = PetaLoadLog.objects.order_by("-loaded_at").first()
    dataset = (log.datasets or {}).get(spec["dataset"], {}) if log else {}
    if ind.group == "tutupan":
        years = sorted({r.landcover_year for c, r in regions.items() if c in values and r.landcover_year})
        if len(years) > 1:
            raise PackError(f"Nilai tutupan lahan dari beberapa tahun ({', '.join(map(str, years))}); tidak bisa diurutkan.")
        period = str(years[0]) if years else str(dataset.get("year", ""))
        what = (f"Persentase luas wilayah per kelas tutupan lahan ESA WorldCover {period} (10 m), dihitung NusaStats "
                f"di dalam batas BIG 1:10.000. Citra satelit {period}, bukan data administrasi.")
    else:
        # The DEM is one surface from TanDEM-X passes 2011-2015, not a yearly series.
        period = "2011–2015"
        what = ("Dihitung NusaStats dari Copernicus DEM GLO-30 (30 m, citra radar TanDEM-X 2011–2015) di dalam batas "
                "BIG 1:10.000. DEM mengukur permukaan, termasuk tajuk pohon dan bangunan.")
    notes = [what] + ([_PETA_NOTES[ind.key]] if ind.key in _PETA_NOTES else [])
    unit_word = "% luas wilayah" if ind.unit == "%" else ind.unit
    return {
        "spec": spec, "log": log, "dataset": dataset, "period": period, "notes": notes,
        "metric": f"{ind.label_id} ({unit_word})" if ind.group == "tutupan" else ind.label_id,
        "attribution": dataset.get("attribution", spec["noun"]),
        # "ESA WORLDCOVER 2021"; the DEM has no single year, so no year on its eyebrow.
        "kicker": f"{spec['short']} {period}" if ind.group == "tutupan" else spec["short"],
    }


def _peta_log(log):
    return ({"id": log.id, "path": log.path, "export_sha256": log.export_sha256, "loaded_at": _iso(log.loaded_at)}
            if log else None)


def _peta(metric, level, period, opts):
    """A land cover share or a terrain measure per kabupaten or kecamatan (peta app,
    data/peta_wilayah); provinsi combines its kabupaten (_peta_provinces). Kemendagri codes
    on both sides, so no crosswalk; labels from the latest Dukcapil snapshot (same code
    system), else the BIG polygon's own name."""
    ind = _peta_indicator(metric)
    if level == "provinsi":
        return _peta_provinces(ind, opts)
    plevel = "regency" if level == "kabupaten" else "district"
    regions = {r.code: r for r in PetaRegion.objects.filter(level=plevel).prefetch_related("source_files")}
    values = dict(PetaValue.objects.filter(indicator=ind, year=0, region__level=plevel)
                  .values_list("region__code", "value"))
    ctx = _peta_context(ind, regions, values)
    dataset_key = ctx["spec"]["dataset"]

    # Names (and the kecamatan's kabupaten) from Dukcapil: the same Kemendagri codes.
    periods = dukcapil_periods()
    duk = DukcapilRegion.objects.filter(period=periods[0]) if periods else DukcapilRegion.objects.none()
    kab_label = {r["code"]: f"{_DUKCAPIL_PREFIX.get(r['status'], '')} {r['name']}".strip()
                 for r in duk.filter(level="regency").values("code", "name", "status")}
    kec_name = dict(duk.filter(level="district").values_list("code", "name")) if plevel == "district" else {}

    def bare(name):
        return name.title() if name.isupper() else name

    rows, prov_refs = [], []
    for code, value in values.items():
        r = regions[code]
        if plevel == "regency":
            row = {"code": code, "label": kab_label.get(code) or bare(r.name), "value": value, "geo": code}
        else:
            name, parent = kec_name.get(code) or bare(r.name), kab_label.get(code[:4])
            row = {"code": code, "label": f"{name}, {parent}" if parent else name, "value": value, "geo": code}
            if parent:
                row.update(name=name, parent=parent)
        rows.append(row)
        prov_refs.append({"code": code,
                          "computed": r.landcover_provenance if ind.group == "tutupan" else r.terrain_provenance,
                          "tiles": [{"key": f.key, "url": f.url, "sha256": f.sha256, "downloaded_at": f.downloaded_at}
                                    for f in r.source_files.all() if f.dataset == dataset_key]})

    # Universe: every polygon the pipeline has (it computes all BIG polygons; one it
    # skipped has no row and shows up here as missing) plus every Dukcapil region
    # with a Kemendagri code at this level.
    expected = set(regions) | {c for c in (kab_label if plevel == "regency" else kec_name) if re.fullmatch(r"\d+", c)}
    notes = list(ctx["notes"])
    if plevel == "district" and not opts.get("provs"):
        # Nationally only: these rows carry no province code, so no province scope holds them.
        twins = polygon_twins(duk.filter(level="district"))
        no_code = sorted(c for c in kec_name if not re.fullmatch(r"\d+", c) and c not in twins)
        if no_code:
            notes.append(f"{fmt_int(len(no_code))} kecamatan di data Dukcapil tanpa kode Kemendagri (tanpa poligon) "
                         "tidak ikut diurutkan.")
    return {
        "rows": rows,
        "expected": [(c, c) for c in sorted(expected)],
        "metric": ctx["metric"],
        "unit": opts.get("unit") or ind.unit,
        "period": ctx["period"],
        "kicker": ctx["kicker"],
        "source": f"{ctx['spec']['noun']} — {ind.label_id} per {LEVEL_TITLE[level]}, dihitung NusaStats dalam batas "
                  f"BIG 1:10.000. {ctx['attribution']}",
        "notes": notes,
        "provenance": {"source": "peta", "indicator": ind.key, "method": ind.method, "dataset": ctx["dataset"],
                       "load_log": _peta_log(ctx["log"]), "rows": prov_refs},
    }


def _peta_provinces(ind, opts):
    """A province's value, combined from its kabupaten/kota: area-weighted (a share of area,
    i.e. the class's km² over the province's km²; or a mean over equal-area pixels) or the
    highest (titik tertinggi). A province gets a value only when every kabupaten/kota of it
    (Dukcapil's list, same Kemendagri codes) has one; otherwise it has none and the pack
    reports it, never a partial sum."""
    how = _PETA_PROVINCE.get(ind.key, "area")
    if how is None:
        raise PackError(f"{ind.label_id} tidak bisa digabung dari kabupaten/kota (median dan rentang persentil "
                        "tidak bisa dihitung ulang dari bagiannya). Pakai tingkat kabupaten atau kecamatan.")
    regions = {r.code: r for r in PetaRegion.objects.filter(level="regency")}
    values = dict(PetaValue.objects.filter(indicator=ind, year=0, region__level="regency")
                  .values_list("region__code", "value"))
    ctx = _peta_context(ind, regions, values)

    periods = dukcapil_periods()
    duk = DukcapilRegion.objects.filter(period=periods[0]) if periods else DukcapilRegion.objects.none()
    prov_names = dict(duk.filter(level="province").values_list("code", "name"))
    kabs = {}
    for code in list(duk.filter(level="regency").values_list("code", flat=True)) + list(regions):
        if re.fullmatch(r"\d{4}", code):
            kabs.setdefault(code[:2], set()).add(code)
    universe = sorted(set(prov_names) | set(kabs))

    method = ("max over its kabupaten/kota" if how == "max"
              else "sum(value × area_km2) / sum(area_km2) over its kabupaten/kota")
    rows, prov_refs, incomplete = [], [], []
    for prov in universe:
        members = sorted(kabs.get(prov, ()))
        missing = [k for k in members if k not in values or not regions.get(k) or not regions[k].area_km2]
        if not members or missing:
            incomplete.append(prov)
            continue
        area = sum(regions[k].area_km2 for k in members)
        if how == "max":
            value = max(values[k] for k in members)
        else:
            value = sum(values[k] * regions[k].area_km2 for k in members) / area
            if ind.unit == "%" and not 0 <= value <= 100 + 1e-9:
                raise PackError(f"Gabungan {ind.label_id} provinsi {prov} = {value:.4f}%, di luar 0–100: data diperiksa dulu.")
        rows.append({"code": prov, "label": prov_names.get(prov) or prov, "value": round(value, 4), "geo": prov})
        prov_refs.append({"code": prov, "method": method, "area_km2": round(area, 2),
                          "inputs": [{"code": k, "value": values[k], "area_km2": regions[k].area_km2,
                                      "computed": (regions[k].landcover_provenance if ind.group == "tutupan"
                                                   else regions[k].terrain_provenance)} for k in members]})
    notes = list(ctx["notes"])
    notes.insert(1, "Angka provinsi = titik tertinggi di antara kabupaten/kotanya." if how == "max" else
                 "Angka provinsi digabung NusaStats dari kabupaten/kotanya, ditimbang dengan luas wilayah"
                 + (" (dari persentase yang dibulatkan 0,01%, selisih di bawah 0,01 poin)." if ind.unit == "%" else "."))
    return {
        "rows": rows,
        "expected": [(c, c) for c in universe],
        "metric": ctx["metric"],
        "unit": opts.get("unit") or ind.unit,
        "period": ctx["period"],
        "kicker": ctx["kicker"],
        "source": f"{ctx['spec']['noun']} — {ind.label_id} per Provinsi, digabung NusaStats dari kabupaten/kota "
                  f"dalam batas BIG 1:10.000. {ctx['attribution']}",
        "notes": notes,
        "provenance": {"source": "peta", "indicator": ind.key, "method": ind.method, "dataset": ctx["dataset"],
                       "aggregate": f"provinsi from kabupaten/kota: {method}", "incomplete": incomplete,
                       "load_log": _peta_log(ctx["log"]), "rows": prov_refs},
    }


_BUILDERS = {"bps": _bps, "dukcapil": _dukcapil, "djpk": _djpk, "peta": _peta}


def build_pack(source, metric, level, period=None, *, prov=None, top=5, bottom=5, allow_partial=False,
               turvar=None, th=None, unit=None, label_metric=None, notes=None, pack_id=None):
    """See the module docstring. `prov` (Kemendagri 2-digit codes, one or several:
    "73" or "71,72,73") limits the ranking to those provinces' regions; it is
    ignored at provinsi level."""
    if source not in SOURCES:
        raise PackError(f"source harus salah satu dari {', '.join(SOURCES)}.")
    if level not in LEVELS:
        raise PackError(f"level harus salah satu dari {', '.join(LEVELS)}.")
    if source in ("bps", "djpk") and not period:
        raise PackError("period (tahun) wajib untuk BPS dan DJPK.")
    provs = () if level == "provinsi" else parse_provs(prov)
    # One scope string for ids and card paths: "73", or "71-72-73" for several provinces.
    prov = "-".join(provs) or None
    built = _BUILDERS[source](str(metric), level, period, {"turvar": turvar, "th": th, "unit": unit, "provs": provs})
    rows = built["rows"]
    expected = built["expected"]
    if provs:
        rows = [r for r in rows if (r["geo"] or "")[:2] in provs]
        expected = [e for e in expected if (e[1] or "")[:2] in provs]

    if level == "kabupaten" and len(provs) != 1:
        # Across several provinces the table names each kabupaten's province on a second
        # line, as kecamatan rows name their kabupaten (by Kemendagri code, from Dukcapil).
        periods = dukcapil_periods()
        pnames = dict(DukcapilRegion.objects.filter(level="province", period=periods[0]).values_list("code", "name")) if periods else {}
        for r in rows:
            if r["geo"] and not r.get("parent") and pnames.get(r["geo"][:2]):
                r.update(name=r["label"], parent=pnames[r["geo"][:2]])

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
    # Competition ranks, both ways: tied values share a rank (1, 1, 3), so a
    # tie is never shown as one region beating another.
    for i, r in enumerate(ordered):
        r["rank"] = ordered[i - 1]["rank"] if i and r["value"] == ordered[i - 1]["value"] else i + 1
    for i, r in enumerate(reversed(ordered)):
        prev = ordered[n - i] if i else None
        r["rank_asc"] = prev["rank_asc"] if prev and r["value"] == prev["value"] else i + 1
    picked = ordered if n <= top + bottom else ordered[:top] + ordered[n - bottom:]

    scope = LEVEL_NOUN[level]
    where, pname = "", None
    if provs:
        pname = provs_name(provs)
        where = f" di {pname}"
    pack_notes = []
    twins = [t for t, base in built.get("twins", {}).items() if not provs or base[:2] in provs]
    if twins:
        pack_notes.append(f"{fmt_int(len(twins))} baris ganda di sumber (wilayah yang sama, digambar sebagai dua "
                          "poligon dengan angka yang identik) dihitung sekali.")
    if n < total:
        if not allow_partial:
            have = {r["code"] for r in rows}
            missing = [geo or code for code, geo in expected if code not in have]
            names = _region_names([m for m in missing if m], level)
            listed = [names.get(m, m) for m in missing[:5]]
            more = f" dan {fmt_int(len(missing) - 5)} lainnya" if len(missing) > 5 else ""
            raise PackError(
                f"n = {fmt_int(n)} dari {fmt_int(total)} {scope}{where} punya nilai. "
                f"Tanpa nilai: {', '.join(listed)}{more}. "
                "Pakai allow_partial bila tetap ingin dibuat (catatan n akan ditulis).",
                partial={"n": n, "total": total, "missing": listed, "more": max(0, len(missing) - 5)},
            )
        pack_notes.append(f"n = {fmt_int(n)} dari {fmt_int(total)} {scope}{where}; jangan disebut "
                          "tertinggi/terendah se-Indonesia.")
    if n <= top + bottom:
        pack_notes.append(f"Semua {fmt_int(n)} {scope}{where}.")
    else:
        pack_notes.append(f"{top} tertinggi dan {bottom} terendah dari {fmt_int(n)} {scope}{where}.")
    # Ties among the shown rows or at the cut-offs: the order between them is
    # only the region code, so say so instead of implying a ranking.
    edges = set()
    for i, r in enumerate(picked[:-1]):
        if r["value"] == picked[i + 1]["value"]:
            edges.add(i)
    if n > top + bottom:
        edges |= {"top"} if ordered[top - 1]["value"] == ordered[top]["value"] else set()
        edges |= {"bottom"} if ordered[n - bottom]["value"] == ordered[n - bottom - 1]["value"] else set()
    # One fractional value anywhere in the ranking -> every value shows two decimals.
    fixed = any(r["value"] != int(r["value"]) for r in ordered)
    if edges:
        tied = sorted({fmt_value(r["value"], built["unit"], fixed) for i, r in enumerate(picked)
                       if (i in edges or i - 1 in edges)} | ({"di batas peringkat"} if edges & {"top", "bottom"} else set()))
        pack_notes.append(f"Ada nilai kembar ({', '.join(tied)}); urutan di antara nilai yang sama mengikuti kode "
                          "wilayah, bukan peringkat.")
    # The Papua-code note only matters when a 2022-Papua row is in this scope.
    papua = source == "bps" and any(r["code"][:2] in {"92", "95", "96", "97"} for r in rows)
    pack_notes += [x for x in built["notes"] if papua or not x.startswith("Kode wilayah = kode BPS")]
    if notes:
        pack_notes.append(notes)

    pid = pack_id or pack_slug(source, metric, level, built["period"], prov)
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
            "prov_name": pname or "",
            "title": short_metric(label_metric or built["metric"]),
            "kicker": (f"DATA • {built['kicker']}" if built.get("kicker") else kicker_for(source, built["period"])),
            "period_label": period_label(built["period"]),
            "n": n,
            "expected": total,
            "min": min(values),
            "max": max(values),
            "values": [{"geo": r["geo"], "code": r["code"], "label": r["label"], "value": r["value"],
                        "display": fmt_value(r["value"], built["unit"], fixed), "rank": r["rank"],
                        "rank_asc": r["rank_asc"],
                        **({"name": r["name"], "parent": r["parent"]} if r.get("parent") else {})}
                       for r in ordered if r["geo"]],
            "unmatched": [{"code": r["code"], "label": r["label"], "rank": r["rank"], "rank_asc": r["rank_asc"]}
                          for r in ordered if not r["geo"]],
        },
    }
