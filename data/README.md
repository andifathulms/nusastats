# Raw data staging (for later ingest)

Scraped source data, held here for ingest **after** the app redesign settles.
Nothing here is wired into the app yet. Everything joins by Indonesian
**kode wilayah** (Kemendagri): province 2 / kabupaten 4 / kecamatan 6 / desa 10
digits — the same keys the `dukcapil` app already uses (`kode_desa_spatial`,
`prov_code`/`kab_code`/`kec_code`).

Large blobs are `.gitignore`d (regenerate with the scripts); the small tabular
data + scripts + manifests are committed.

## `dukcapil_extra/` — new Dukcapil themed layers + historical population

Source: `gis.dukcapil.kemendagri.go.id/arcgis/rest/services`. Fetched with
`fetch_extra.py` (see `manifest.json` for exact fields per layer). One JSON of
raw ArcGIS attribute rows per (service, layer). Note: these themed layers only
publish down to **kabupaten** (province + kab), not desa.

**Genuinely new (we don't already have these):**
- `AGR_AKTALAHIR / AKTAKAWIN / AKTACERAI` — birth/marriage/divorce **certificate ownership**
- `AGR_ANGKA_PERKAWINAN / PERCERAIAN` — marriage/divorce **event rates**
- `AGR_IMR` — **infant mortality rate**
- `Penyebab_Kematian` — **cause of death** (28–32 fields)
- `KEPEMILIKAN_KIA` — child ID (KIA) coverage
- `Monitoring_Pendaftaran_IKD` — digital ID (IKD) registration
- `AGR_PINDAH_DATANG` — migration (separate in/out layers)

**Historical population (new time points → real trends):**
- `AGR_VISUAL_PROP_202302` (Feb 2023), `..._PROP_202401` / `_KAB_202401` /
  `_KEC_202401` (Jan 2024) — full population fields (~121–126) at those dates.
- `AGR_VISUAL_KEL_202401` (Jan 2024, ~83k desa) — **gitignored** (large);
  regenerate with `python3 fetch_extra.py village`.

Current (already ingested) population = the `_FIX` layers @ 2026-07.

## `big_boundaries/` — authoritative BIG desa boundaries (gitignored, 1.0 GB)

Source: BIG (Badan Informasi Geospasial) —
`geoservices.big.go.id/rbi/.../BATASWILAYAH/Administrasi_AR_KelDesa_10K`.
Fetched with `fetch_big.py` (one geojson per province, `big-villages-<prov>.geojson`).

- 38 provinces, **83,399 desa/kelurahan at 1:10K** — ~**73× the boundary detail**
  of the generalized copy Dukcapil serves (the current maps look jagged because
  Dukcapil's copy has ~10 vertices/desa; BIG has ~700).
- Keyed by `domain_id` = `KDEPUM` with dots stripped = the Kemendagri desa code
  = our `kode_desa_spatial` → **direct join** to Dukcapil village data. BIG also
  carries BPS codes (`KD*BPS`) for a BPS↔Kemendagri crosswalk.
- ~1.0 GB raw (nd=5, ~1 m, full vertices). **Too big to serve as-is** — for the
  web maps, `simplify_big.py` writes a Douglas-Peucker display copy per province
  to `frontend/public/dukcapil-villages-<prov>.geojson`, and `dissolve.py`
  derives smooth kec/kab/prov outlines from it (dissolve full-res desa first,
  then simplify — see the script header).
- `compute_area.py` computes the true geodesic per-desa **land area** from this
  archive → `backend/dukcapil/data/big_area.json` (committed, ~1.8 MB), which
  `manage.py load_big_area` ingests into `DukcapilRegion.luas_big`. This exists
  because Dukcapil's own `luas_wilayah` is the kabupaten total copied onto every
  desa (broken at village level); `luas_big` is the real per-region area.

## Regenerate

```bash
python3 dukcapil_extra/fetch_extra.py all       # themed + historical (prov/kab/kec)
python3 dukcapil_extra/fetch_extra.py village   # + historical village (83k)
python3 big_boundaries/fetch_big.py             # all BIG desa boundaries (1 GB)
python3 big_boundaries/simplify_big.py 0.0004   # -> frontend/public display desa
python3 big_boundaries/dissolve.py              # -> smooth kec/kab/prov outlines
python3 big_boundaries/compute_area.py          # -> backend .../big_area.json
#   then: manage.py load_big_area               # -> DukcapilRegion.luas_big
```
