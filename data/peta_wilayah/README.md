# Peta Wilayah pipeline

Terrain (and, from Phase 2, land cover) statistics and map layers for any
provinsi / kabupaten / kecamatan, keyed by Kemendagri kode. Spec:
`docs/FEATURE-peta-wilayah.md`.

Requires the BIG desa archive in `data/big_boundaries/` (`fetch_big.py`).
Everything else is fetched into the git-ignored `cache/`.

```bash
cd data/peta_wilayah
uv sync                                   # Python 3.12 venv from uv.lock (no system GDAL)
uv run python -m terrain --kode 6409      # one command from an empty cache
uv run python -m outlines --prov 64       # (run automatically by terrain)
uv run --group dev pytest -q tests
```

Outputs go to `frontend/public/peta/{kode}/`: `terrain.json`, `bounds.json`,
`hillshade.webp`, `elevation.webp`. Layers are on an EPSG:4326 grid, which
matches the SVG map's linear lon/lat projection. Stats are computed in UTM.

- `sources.json` (committed): dataset licences and attribution, plus the sha256
  of every downloaded file.
- `config/terrain_rules.yaml`: classification thresholds.
- `config/terrain.yaml`: processing and render parameters.
- Provinsi 96 has no BIG archive, so it is skipped and logged in
  `cache/outlines/skipped.json`.
