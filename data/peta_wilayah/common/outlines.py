"""Full-detail kecamatan / kabupaten / provinsi outlines from the BIG desa archive.

The committed `frontend/public/dukcapil-*.geojson` outlines are simplified for
display, so their areas drift — fine for drawing, wrong for statistics. Here we
dissolve a province's full-resolution BIG desa polygons up the code hierarchy
(desa[:6]=kec, [:4]=kab, [:2]=prov) with the same `dissolve()` used for the
display outlines (data/big_boundaries/dissolve.py), but with NO island or hole
dropping and NO simplification: the output is faithful to the BIG polygons.
Cached (git-ignored) under cache/outlines/{prov}/ with a meta.json recording the
input file's sha256, so a changed archive triggers a rebuild.

A province without a BIG archive (currently 96, Papua Barat Daya) is logged as
skipped in cache/outlines/skipped.json and raises `ProvinceSkipped`; it never
falls back to the simplified display file.
"""
import importlib.util
import json
import sys

from shapely import make_valid
from shapely.geometry import mapping, shape

from . import manifest
from .cache import sha256
from .paths import BIG_DIR, CACHE, PUBLIC, big_desa_file

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


def _log_skip(prov: str, reason: str) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    p = OUT / "skipped.json"
    log = json.loads(p.read_text()) if p.exists() else {}
    log[prov] = {"reason": reason, "logged_at": manifest.now_iso()}
    p.write_text(json.dumps(log, indent=2, sort_keys=True) + "\n")
    sys.stderr.write(f"outlines: provinsi {prov} SKIPPED — {reason}\n")


def build(prov: str, force: bool = False) -> dict:
    src = big_desa_file(prov)
    if not src.exists():
        reason = f"no BIG desa archive ({src.name} not in data/big_boundaries/)"
        _log_skip(prov, reason)
        raise ProvinceSkipped(f"provinsi {prov}: {reason}")
    digest = sha256(src)
    d = OUT / prov
    meta_path = d / "meta.json"
    if not force and meta_path.exists():
        meta = json.loads(meta_path.read_text())
        if meta.get("source_sha256") == digest:
            return meta

    sys.stderr.write(f"outlines: dissolving provinsi {prov} from {src.name}…\n")
    dissolve = _dissolve_fn()
    desa = []
    invalid = 0
    for f in json.loads(src.read_text())["features"]:
        g = shape(f["geometry"])
        if not g.is_valid:
            invalid += 1
            g = make_valid(g)
        desa.append((f["properties"]["domain_id"], g))

    names = {6: _names("dukcapil-districts.geojson"), 4: _names("dukcapil-regencies.geojson"),
             2: _names("dukcapil-provinces.geojson")}
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
            "method": "shapely.union_all(grid_size=1e-8) per code prefix; no simplify, "
                      "no island/hole dropping (data/big_boundaries/dissolve.py:dissolve)",
            "built_at": manifest.now_iso()}
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
