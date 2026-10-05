"""Load the committed pipeline export (peta/data/peta_export.json) into the DB.

Idempotent: regions, values, indicators and source files are upserted on their
natural keys, so re-loading the same export changes nothing and a newer export
updates in place. Every load is recorded in PetaLoadLog with the export's
sha256. Ends with bump_data_version("peta") so cached API responses refresh.
"""
import hashlib
import json
from pathlib import Path

from django.db import transaction

from api.caching import bump_data_version

from .indicators import INDICATORS, is_yearly, read, read_yearly
from .models import PetaIndicator, PetaLevel, PetaLoadLog, PetaRegion, PetaSourceFile, PetaValue

DEFAULT_PATH = Path(__file__).resolve().parent / "data" / "peta_export.json"
LEVELS = {"province": PetaLevel.PROVINCE, "regency": PetaLevel.REGENCY, "district": PetaLevel.DISTRICT}


class ExportInvalid(ValueError):
    pass


def _parent(code: str) -> str:
    return {2: "", 4: code[:2], 6: code[:4]}[len(code)]


def seed_indicators():
    for sort, (key, label, group, unit, dataset, _path, method) in enumerate(INDICATORS):
        PetaIndicator.objects.update_or_create(
            key=key, defaults={"label_id": label, "group": group, "unit": unit, "dataset": dataset,
                               "method": method, "sort": sort, "yearly": is_yearly(_path)})
    return {i.key: i for i in PetaIndicator.objects.all()}


@transaction.atomic
def load_export(path=DEFAULT_PATH) -> PetaLoadLog:
    path = Path(path)
    raw = path.read_bytes()
    data = json.loads(raw)
    for k in ("datasets", "files", "areas"):
        if k not in data:
            raise ExportInvalid(f"{path.name}: missing '{k}'")

    inds = seed_indicators()
    files = {}
    for ds, recs in data["files"].items():
        for key, r in recs.items():
            # Whole files carry sha256/bytes/downloaded_at; remote WINDOWS (night lights)
            # carry sha256_window/read_at and the window's byte count.
            window = "sha256_window" in r
            nbytes = r.get("bytes")
            if window:
                nbytes = (r["shape"][0] * r["shape"][1] * (4 if r["dtype"] == "float32" else 2))
            f, _ = PetaSourceFile.objects.update_or_create(
                dataset=ds, key=key,
                defaults={"url": r["url"], "sha256": r["sha256_window"] if window else r["sha256"],
                          "bytes": nbytes, "downloaded_at": r["read_at"] if window else r["downloaded_at"]})
            files[(ds, key)] = f

    log = PetaLoadLog.objects.create(path=str(path.name), export_sha256=hashlib.sha256(raw).hexdigest(),
                                     areas=len(data["areas"]), values=0, datasets=data["datasets"])
    n_values = 0
    for a in data["areas"]:
        code = a["kode"]
        if not code.isdigit() or len(code) not in (2, 4, 6) or a["level"] not in LEVELS:
            raise ExportInvalid(f"bad area record: {code!r} / {a.get('level')!r}")
        t, lc, nl = a.get("terrain"), a.get("landcover"), a.get("nightlights")
        region, _ = PetaRegion.objects.update_or_create(code=code, defaults={
            "level": LEVELS[a["level"]], "name": a["name"], "prov_code": a["prov_code"],
            "parent_code": _parent(code),
            "area_km2": (t or lc or {}).get("area_km2"),
            "terrain_class": (t or {}).get("terrain_class", ""),
            "terrain_class_label": (t or {}).get("terrain_class_label", ""),
            "terrain_class_reason": (t or {}).get("terrain_class_reason", ""),
            "highest_point": (t or {}).get("highest_point"),
            "landcover_year": (lc or {}).get("year"),
            "terrain_provenance": (t or {}).get("provenance"),
            "landcover_provenance": (lc or {}).get("provenance"),
            "nightlights_provenance": (nl or {}).get("provenance"),
            "load_log": log,
        })
        used = []
        for layer in (t, lc):
            if layer:
                prov = layer["provenance"]
                for key in prov["tiles"]:
                    if (prov["dataset"], key) not in files:
                        raise ExportInvalid(f"{code}: tile {prov['dataset']}/{key} not in export files")
                    used.append(files[(prov["dataset"], key)])
        if nl:
            # Night-lights windows are shared by a whole province: their records
            # are listed in nightlights_provenance, not linked per region.
            for key in nl["provenance"]["source_records"]:
                if (nl["provenance"]["dataset"], key) not in files:
                    raise ExportInvalid(f"{code}: night-lights record {key} not in export files")
        region.source_files.set(used)
        rows = []
        for key, _label, _group, _unit, _dataset, ipath, _method in INDICATORS:
            if is_yearly(ipath):
                for year, v in read_yearly(a, ipath).items():
                    rows.append(PetaValue(region=region, indicator=inds[key], year=year, value=v))
            else:
                v = read(a, ipath)
                if v is not None:
                    rows.append(PetaValue(region=region, indicator=inds[key], year=0, value=v))
        PetaValue.objects.bulk_create(rows, update_conflicts=True, unique_fields=["region", "indicator", "year"],
                                      update_fields=["value"])
        # A layer or year dropped from the export leaves no stale values behind.
        keep = {(r.indicator.id, r.year) for r in rows}
        stale = [i for i, ind, yr in PetaValue.objects.filter(region=region).values_list("id", "indicator_id", "year")
                 if (ind, yr) not in keep]
        PetaValue.objects.filter(id__in=stale).delete()
        n_values += len(rows)

    log.values = n_values
    log.save(update_fields=["values"])
    transaction.on_commit(lambda: bump_data_version("peta"))
    return log
