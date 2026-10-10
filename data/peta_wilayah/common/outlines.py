"""Full-detail kecamatan / kabupaten / provinsi outlines from the BIG desa archive.

The committed `frontend/public/dukcapil-*.geojson` outlines are simplified for
display, so their areas drift — fine for drawing, wrong for statistics. Here we
dissolve a province's full-resolution BIG desa polygons up the code hierarchy
(desa[:6]=kec, [:4]=kab, [:2]=prov) with the same `dissolve()` used for the
display outlines (data/big_boundaries/dissolve.py), but with NO island or hole
dropping and NO simplification: the output is faithful to the BIG polygons.
Cached (git-ignored) under cache/outlines/{prov}/ with a meta.json recording the
input file's sha256, so a changed archive triggers a rebuild.

Provinsi 96 (Papua Barat Daya) has no archive of its own: its desa are in the
province-92 archive under pre-2022 regency codes, and config/big_code_remap.yaml
maps them explicitly (92 is then built without them). Any other province
without a BIG archive is logged as skipped in cache/outlines/skipped.json and
raises `ProvinceSkipped`; it never falls back to the simplified display file.
"""
import hashlib
import importlib.util
import json
import sys

import yaml

from shapely import make_valid
from shapely.geometry import mapping, shape

from . import manifest
from .cache import sha256
from .paths import BIG_DIR, CACHE, CONFIG, PUBLIC, REPO, big_desa_file

OUT = CACHE / "outlines"
LEVELS = {2: "provinsi", 4: "kabupaten", 6: "kecamatan"}


class ProvinceSkipped(RuntimeError):
    pass


def _dissolve_fn():
    spec = importlib.util.spec_from_file_location("big_dissolve", BIG_DIR / "dissolve.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod.dissolve


def _names(path):
    fc = json.loads((PUBLIC / path).read_text())
    return {f["properties"]["domain_id"]: f["properties"].get("name", "") for f in fc["features"]}


def _kecamatan_names():
    """Fallback kecamatan names from Dukcapil village records
    (backend/peta/data/kecamatan_names.json, `manage.py export_kecamatan_names`),
    for real kecamatan that the display file leaves nameless."""
    p = REPO / "backend" / "peta" / "data" / "kecamatan_names.json"
    if not p.exists():
        return {}
    return {k: v["name"] for k, v in json.loads(p.read_text())["names"].items()}


REMAP_FILE = CONFIG / "big_code_remap.yaml"


def _remap():
    return yaml.safe_load(REMAP_FILE.read_text()) or {} if REMAP_FILE.exists() else {}


def _source(prov: str):
    """(archive path, {old regency: new regency} to take and recode or None,
    set of regency codes to leave out)."""
    remap = {str(k): v for k, v in _remap().items()}
    if prov in remap:
        r = remap[prov]
        return big_desa_file(r["source_prov"]), {str(o): str(n) for o, n in r["regency"].items()}, set()
    moved = {str(o) for r in remap.values() if r["source_prov"] == prov for o in r["regency"]}
    return big_desa_file(prov), None, moved


def _log_skip(prov: str, reason: str) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    p = OUT / "skipped.json"
    log = json.loads(p.read_text()) if p.exists() else {}
    log[prov] = {"reason": reason, "logged_at": manifest.now_iso()}
    p.write_text(json.dumps(log, indent=2, sort_keys=True) + "\n")
    sys.stderr.write(f"outlines: provinsi {prov} SKIPPED — {reason}\n")


def _read_desa(src, take, leave_out):
    """[(code, geometry)] from a BIG desa archive, applying the regency remap
    (see _source); invalid polygons are repaired with make_valid and counted."""
    desa = []
    invalid = recoded = left_out = 0
    for f in json.loads(src.read_text())["features"]:
        code = f["properties"]["domain_id"]
        if take is not None:
            if code[:4] not in take:
                continue
            code = take[code[:4]] + code[4:]
            recoded += 1
        elif code[:4] in leave_out:
            left_out += 1
            continue
        g = shape(f["geometry"])
        if not g.is_valid:
            invalid += 1
            g = make_valid(g)
        desa.append((code, g))
    return desa, invalid, recoded, left_out


def desa_of(kode: str):
    """Full-resolution BIG desa polygons [(10-digit code, geometry)] inside a
    kabupaten/kecamatan kode, plus the archive's sha256. Same remap as build()."""
    src, take, leave_out = _source(kode[:2])
    if not src.exists():
        raise ProvinceSkipped(f"provinsi {kode[:2]}: no BIG desa archive ({src.name})")
    desa, _invalid, _recoded, _left = _read_desa(src, take, leave_out)
    return [(c, g) for c, g in desa if c.startswith(kode)], sha256(src)


def build(prov: str, force: bool = False) -> dict:
    src, take, leave_out = _source(prov)
    if not src.exists():
        reason = f"no BIG desa archive ({src.name} not in data/big_boundaries/)"
        _log_skip(prov, reason)
        raise ProvinceSkipped(f"provinsi {prov}: {reason}")
    digest = sha256(src)
    remap_sha = None
    if take is not None or leave_out:
        # The remap is part of the input: a change to it rebuilds the outlines.
        remap_sha = hashlib.sha256(REMAP_FILE.read_bytes()).hexdigest()
        digest = hashlib.sha256(f"{digest}:{remap_sha}".encode()).hexdigest()
    d = OUT / prov
    meta_path = d / "meta.json"
    if not force and meta_path.exists():
        meta = json.loads(meta_path.read_text())
        if meta.get("source_sha256") == digest:
            return meta

    sys.stderr.write(f"outlines: dissolving provinsi {prov} from {src.name}…\n")
    dissolve = _dissolve_fn()
    desa, invalid, recoded, left_out = _read_desa(src, take, leave_out)
    if take is not None and {c[:4] for c, _ in desa} != set(take.values()):
        raise RuntimeError(f"provinsi {prov}: remap expected regencies {sorted(take.values())}, "
                           f"got {sorted({c[:4] for c, _ in desa})}")

    names = {6: _names("dukcapil-districts.geojson"), 4: _names("dukcapil-regencies.geojson"),
             2: _names("dukcapil-provinces.geojson")}
    fallback = _kecamatan_names()
    named_from_villages = []
    for k, v in fallback.items():
        if k[:2] == prov and (not names[6].get(k) or names[6][k] == k):
            names[6][k] = v
            named_from_villages.append(k)
    d.mkdir(parents=True, exist_ok=True)
    counts = {}
    items = desa
    for keylen in (6, 4, 2):
        # area_thr=0 / hole_thr=0: keep every island and every hole (faithful).
        items = dissolve(items, keylen, area_thr=0.0, hole_thr=0.0)
        feats = [{"type": "Feature",
                  "properties": {"domain_id": k, "name": names[keylen].get(k, k)},
                  "geometry": mapping(g)} for k, g in sorted(items)]
        (d / f"{LEVELS[keylen]}.geojson").write_text(
            json.dumps({"type": "FeatureCollection", "features": feats}, ensure_ascii=False))
        counts[LEVELS[keylen]] = len(feats)

    meta = {"prov": prov, "source": f"data/big_boundaries/{src.name}", "source_sha256": digest,
            "desa": len(desa), "desa_made_valid": invalid, "counts": counts,
            "kecamatan_named_from_villages": sorted(named_from_villages),
            "method": "shapely.union_all(grid_size=1e-8) per code prefix; no simplify, "
                      "no island/hole dropping (data/big_boundaries/dissolve.py:dissolve)",
            "built_at": manifest.now_iso()}
    if remap_sha:
        meta["remap"] = {"file": "data/peta_wilayah/config/big_code_remap.yaml", "sha256": remap_sha,
                         "archive_sha256": sha256(src)}
        if take is not None:
            meta["remap"].update(regency=take, desa_recoded=recoded)
        else:
            meta["remap"].update(regencies_left_out=sorted(leave_out), desa_left_out=left_out)
    meta_path.write_text(json.dumps(meta, indent=2) + "\n")
    sys.stderr.write(f"outlines: provinsi {prov} -> {counts}\n")
    return meta


def get_area(kode: str):
    """(geometry EPSG:4326, name, level, outline meta) for a 2/4/6-digit kode."""
    if len(kode) not in LEVELS or not kode.isdigit():
        raise ValueError(f"kode must be 2, 4 or 6 digits (provinsi/kabupaten/kecamatan): {kode!r}")
    meta = build(kode[:2])
    level = LEVELS[len(kode)]
    fc = json.loads((OUT / kode[:2] / f"{level}.geojson").read_text())
    for f in fc["features"]:
        if f["properties"]["domain_id"] == kode:
            return shape(f["geometry"]), f["properties"]["name"], level, meta
    raise KeyError(f"kode {kode} not found among {level} outlines of provinsi {kode[:2]}")


def province_name(prov: str) -> str:
    return _names("dukcapil-provinces.geojson").get(prov, prov)
