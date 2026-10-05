import json

import pytest

from api.caching import data_version
from peta.ingest import ExportInvalid, load_export
from peta.models import PetaLoadLog, PetaRegion, PetaSourceFile, PetaValue

DEM, WC = "copernicus_dem_glo30", "esa_worldcover_2021_v200"


def _area(kode, name, mean, mx, tree, built=None, landcover=True):
    classes = [{"code": 10, "share_pct": tree, "area_km2": 1.0}]
    if built is not None:
        classes.append({"code": 50, "share_pct": built, "area_km2": 1.0})
    a = {
        "kode": kode, "level": {4: "regency", 6: "district"}[len(kode)], "prov_code": kode[:2], "name": name,
        "terrain": {
            "area_km2": 100.0, "elevation_m": {"min": 0, "max": mx, "mean": mean, "median": mean, "p5": 0, "p95": mx},
            "relief_m": mx, "highest_point": {"elevation_m": mx, "lon": 116.0, "lat": -1.0},
            "elevation_bands_pct": {}, "slope_deg": {"mean": 5.0}, "slope_classes_pct": {},
            "metrics_pct": {"share_elev_lt_100": 80.0, "share_elev_ge_1000": 0.0, "share_slope_ge_25": 1.0},
            "lowland_pct": {"lt_5": 9.6, "lt_10": 17.0},
            "local_relief": {"window_m": 1000, "mean_m": 68.0, "breaks_m": [30, 100, 300],
                             "classes_pct": {"datar": 20.2, "bergelombang": 60.1, "berbukit": 18.9, "bergunung": 0.7}},
            "terrain_class": "dataran_rendah", "terrain_class_label": "Dataran rendah",
            "terrain_class_reason": "Dataran rendah: 80,0% area <100 m dan 70,0% area lereng <8°",
            "provenance": {"dataset": DEM, "tiles": ["T1"], "boundary_sha256": "b", "config_sha256": "c",
                           "rules_sha256": "r", "crs_stats": "EPSG:32750", "computed_at": "2026-10-05T00:00:00+00:00"},
        },
    }
    if landcover:
        a["landcover"] = {"area_km2": 100.0, "year": 2021, "dominant": {"code": 10, "label": "Tutupan pohon", "share_pct": tree},
                          "classes": classes,
                          "provenance": {"dataset": WC, "tiles": ["W1"], "boundary_sha256": "b", "config_sha256": "c",
                                         "crs_stats": "EPSG:32750", "computed_at": "2026-10-05T00:00:00+00:00"}}
    return a


def _file(**kw):
    return {"url": "https://example/x", "sha256": "ab" * 32, "bytes": 10, "downloaded_at": "2026-10-05T00:00:00+00:00", **kw}


@pytest.fixture
def export(tmp_path):
    def make(areas):
        p = tmp_path / "peta_export.json"
        p.write_text(json.dumps({"datasets": {DEM: {"attribution": "© DLR"}, WC: {"attribution": "© ESA"}},
                                 "files": {DEM: {"T1": _file()}, WC: {"W1": _file()}}, "areas": areas}))
        return p
    return make


@pytest.fixture
def loaded(db, export):
    return load_export(export([
        _area("6409", "PENAJAM PASER UTARA", 89.0, 750.0, 86.9, built=0.5),
        _area("6401", "PASER", 120.0, 1100.0, 90.0),
        _area("6471", "KOTA BALIKPAPAN", 40.0, 200.0, 50.0, built=40.0),
        _area("640904", "SEPAKU", 145.0, 750.0, 91.0, landcover=False),
    ]))


def test_load_values_provenance_and_audit(loaded):
    assert PetaRegion.objects.count() == 4
    r = PetaRegion.objects.get(code="6409")
    assert r.parent_code == "64" and r.level == "regency" and r.terrain_class_label == "Dataran rendah"
    v = {pv.indicator.key: pv.value for pv in r.values.select_related("indicator")}
    assert v["elevation_mean"] == 89.0 and v["lc_tree"] == 86.9 and v["lc_builtup"] == 0.5
    assert v["lc_mangrove"] == 0.0  # class absent from a computed land cover = a true zero
    assert sorted(f.key for f in r.source_files.all()) == ["T1", "W1"]
    log = PetaLoadLog.objects.get()
    assert log.areas == 4 and len(log.export_sha256) == 64 and log.datasets[DEM]["attribution"] == "© DLR"


def test_missing_layer_stores_no_values(loaded):
    sepaku = PetaRegion.objects.get(code="640904")
    keys = set(sepaku.values.values_list("indicator__key", flat=True))
    assert "elevation_mean" in keys and not any(k.startswith("lc_") for k in keys)
    assert sepaku.parent_code == "6409" and sepaku.landcover_year is None


def test_reload_is_idempotent(loaded, export, db):
    n = PetaValue.objects.count()
    load_export(export([_area("6409", "PENAJAM PASER UTARA", 89.0, 750.0, 86.9, built=0.5),
                        _area("6401", "PASER", 120.0, 1100.0, 90.0),
                        _area("6471", "KOTA BALIKPAPAN", 40.0, 200.0, 50.0, built=40.0),
                        _area("640904", "SEPAKU", 145.0, 750.0, 91.0, landcover=False)]))
    assert PetaValue.objects.count() == n and PetaRegion.objects.count() == 4
    assert PetaSourceFile.objects.count() == 2 and PetaLoadLog.objects.count() == 2


def test_load_bumps_cache_version(db, export, django_capture_on_commit_callbacks):
    before = data_version("peta")
    with django_capture_on_commit_callbacks(execute=True):
        load_export(export([_area("6409", "PPU", 89.0, 750.0, 86.9)]))
    assert data_version("peta") != before


def test_unknown_tile_is_rejected(db, export):
    a = _area("6409", "PPU", 89.0, 750.0, 86.9)
    a["terrain"]["provenance"]["tiles"] = ["NOT_IN_FILES"]
    with pytest.raises(ExportInvalid):
        load_export(export([a]))
    assert PetaRegion.objects.count() == 0  # atomic: nothing half-loaded


def test_region_detail_ranks_within_province(loaded, client):
    d = client.get("/api/peta/regions/6409/").json()
    assert d["terrain_class"]["official"] is False and d["peer_scope"].startswith("kabupaten")
    row = {r["key"]: r for r in d["indicators"]}
    assert (row["elevation_max"]["rank"], row["elevation_max"]["of"]) == (2, 3)  # Paser 1100 > PPU 750 > Balikpapan 200
    assert (row["lc_builtup"]["rank"], row["lc_builtup"]["of"]) == (2, 3)
    assert {f["key"] for f in d["provenance"]["source_files"]} == {"T1", "W1"}
    assert client.get("/api/peta/regions/9999/").status_code == 404


def test_rank_endpoint(loaded, client):
    d = client.get("/api/peta/rank/?indicator=lc_builtup&level=regency&prov=64").json()
    assert [r["kemendagri_code"] for r in d["results"]] == ["6471", "6409", "6401"]
    assert d["stats"]["count"] == 3 and d["total"] == 3
    asc = client.get("/api/peta/rank/?indicator=lc_builtup&level=regency&order=asc").json()
    assert asc["results"][0]["kemendagri_code"] == "6401"
    assert client.get("/api/peta/rank/?indicator=nope").status_code == 400
    assert client.get("/api/peta/rank/?level=desa").status_code == 400


def test_indicators_catalog(loaded, client):
    d = client.get("/api/peta/indicators/").json()
    keys = [i["key"] for i in d["indicators"]]
    assert {"elevation_mean", "relief", "share_elev_ge_1000", "share_slope_ge_25", "lc_tree", "lc_builtup", "lc_cropland"} <= set(keys)
    assert d["regions"] == {"regency": 3, "district": 1} and "bukan klasifikasi resmi" in d["classification_note"]


def test_lowland_and_relief_indicators(loaded):
    v = {pv.indicator.key: pv.value for pv in PetaRegion.objects.get(code="6409").values.select_related("indicator")}
    assert v["lowland_lt_5"] == 9.6 and v["lowland_lt_10"] == 17.0
    assert v["local_relief_mean"] == 68.0 and v["relief_bergunung"] == 0.7 and v["relief_datar"] == 20.2


def test_old_export_without_new_fields_stores_no_value(db, export):
    a = _area("6409", "PPU", 89.0, 750.0, 86.9)
    del a["terrain"]["lowland_pct"], a["terrain"]["local_relief"]
    load_export(export([a]))
    keys = set(PetaRegion.objects.get(code="6409").values.values_list("indicator__key", flat=True))
    assert "elevation_mean" in keys and "lowland_lt_5" not in keys and "relief_bergunung" not in keys


def _ntl(area, series):
    area["nightlights"] = {
        "unit": "nW/cm²/sr", "lit_threshold_nw": 1.0, "base_year": 2018, "latest_year": max(series),
        "years": {str(y): {"lit_pct": v, "lit_km2": v, "sum_lit": v * 10, "mean_nw": v / 10} for y, v in series.items()},
        "growth": {},
        "provenance": {"dataset": "wb_len_viirs_monthly", "source_records": ["202401/avg_rade9@64"],
                       "annual_sha256": {}, "boundary_sha256": "b", "config_sha256": "c", "computed_at": "x"},
    }
    return area


@pytest.fixture
def loaded_ntl(db, tmp_path):
    p = tmp_path / "x.json"
    files = {DEM: {"T1": _file()}, WC: {"W1": _file()},
             "wb_len_viirs_monthly": {"202401/avg_rade9@64": {"url": "u", "sha256_window": "cd" * 32, "shape": [10, 10],
                                                               "dtype": "float32", "read_at": "t", "etag": "e"}}}
    areas = [_ntl(_area("6409", "PPU", 89.0, 750.0, 86.9), {2018: 2.8, 2024: 10.1}),
             _ntl(_area("6471", "BALIKPAPAN", 40.0, 200.0, 50.0), {2018: 42.0, 2024: 58.7}),
             _ntl(_area("640904", "SEPAKU", 145.0, 750.0, 91.0), {2018: 0.6, 2024: 11.9})]
    p.write_text(json.dumps({"datasets": {}, "files": files, "areas": areas}))
    return load_export(p)


def test_yearly_values_and_window_records(loaded_ntl):
    r = PetaRegion.objects.get(code="640904")
    series = dict(r.values.filter(indicator__key="ntl_lit_pct").values_list("year", "value"))
    assert series == {2018: 0.6, 2024: 11.9}
    assert r.values.get(indicator__key="elevation_mean").year == 0
    f = PetaSourceFile.objects.get(dataset="wb_len_viirs_monthly")
    assert f.sha256 == "cd" * 32 and f.bytes == 400


def test_yearly_api(loaded_ntl, client):
    d = client.get("/api/peta/regions/6409/").json()
    row = next(r for r in d["indicators"] if r["key"] == "ntl_lit_pct")
    assert row["year"] == 2024 and row["series"] == {"2018": 2.8, "2024": 10.1} and (row["rank"], row["of"]) == (2, 2)
    rk = client.get("/api/peta/rank/?indicator=ntl_lit_pct&level=regency&year=2018").json()
    assert rk["year"] == 2018 and [x["kemendagri_code"] for x in rk["results"]] == ["6471", "6409"]
    assert client.get("/api/peta/rank/?indicator=ntl_lit_pct&level=regency").json()["year"] == 2024
    assert client.get("/api/peta/rank/?indicator=ntl_lit_pct&year=1999").status_code == 400
