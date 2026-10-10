# Peta Wilayah pipeline

Terrain and land cover statistics and map layers for any
provinsi / kabupaten / kecamatan, keyed by Kemendagri kode. Spec:
`docs/FEATURE-peta-wilayah.md`.

Requires the BIG desa archive in `data/big_boundaries/` (`fetch_big.py`).
Everything else is fetched into the git-ignored `cache/`.

```bash
cd data/peta_wilayah
uv sync                                   # Python 3.12 venv from uv.lock (no system GDAL)
uv run python -m terrain --kode 6409      # one command from an empty cache
uv run python -m landcover --kode 6409    # ESA WorldCover 2021 v200
uv run python -m outlines --prov 64       # (run automatically by terrain)
uv run python -m all --level kabupaten --prov 64   # batch, resumable
uv run python -m desa --kode 6409         # per-desa lowland + night-lights shares (after terrain + nightlights)
uv run python -m desa --prov 64           # every kabupaten of a province with terrain.json
uv run python -m export                   # -> backend/peta/data/peta_export.json
uv run --group dev pytest -q tests
```

Then load into the backend: `docker compose exec web python manage.py load_peta`.

Outputs go to `frontend/public/peta/{kode}/`: `terrain.json`, `landcover.json`,
`bounds.json`, `hillshade.webp`, `elevation.webp`, `landcover.webp`, and `desa.json`
(per-desa % under 5/10 m and % lit at night, for population-weighted cards; the
population itself stays in Dukcapil and is joined by desa code at render time). All layers share one EPSG:4326 grid (`common/display.py`), which
matches the SVG map's linear lon/lat projection. Stats are computed in UTM.

- `sources.json` (committed): dataset licences and attribution, plus the sha256
  of every downloaded file.
- `config/terrain_rules.yaml`: classification thresholds.
- `config/terrain.yaml`: terrain processing and render parameters.
- `config/landcover.yaml`: the official WorldCover palette and labels, and land cover parameters. Land cover layers are lossless, and every rendered pixel is checked against the palette.
- Provinsi 96 has no BIG archive, so it is skipped and logged in
  `cache/outlines/skipped.json`.
