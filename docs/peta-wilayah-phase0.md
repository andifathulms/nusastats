# Peta Wilayah — Phase 0 discovery report

Date: 2026-10-05 · Spec: `docs/FEATURE-peta-wilayah.md` · No pipeline code written.

## 1. Boundaries

**Source of truth: BIG 1:10K desa/kelurahan polygons** (Badan Informasi
Geospasial, `geoservices.big.go.id/rbi/.../Administrasi_AR_KelDesa_10K`).
Everything else is derived from them.

| Level | File | Committed? | Detail |
|---|---|---|---|
| Desa (full-res) | `data/big_boundaries/big-villages-{prov}.geojson` | No (gitignored, ~1.0 GB, 37 provinces) | All vertices, coords rounded to 5 dp (~1 m) |
| Desa (display) | `frontend/public/dukcapil-villages-{prov}.geojson` | Yes | Douglas-Peucker ε≈0.0004° (`simplify_big.py`) |
| Kecamatan | `frontend/public/dukcapil-districts.geojson` + `dukcapil-districts-{prov}.geojson` | Yes | Dissolved from full-res desa, simplified tol 0.0004° |
| Kabupaten/kota | `frontend/public/dukcapil-regencies.geojson` (520 features) | Yes | Dissolved, tol 0.0009° |
| Provinsi | `frontend/public/dukcapil-provinces.geojson` (38) | Yes | Dissolved, tol 0.002° |
| Overview SVG paths | `frontend/public/outline-{provinces,regencies}.json` | Yes | Pre-projected for `OutlineMap` |
| Legacy | `frontend/public/indonesia-provinces.geojson` (34, BPS-style `1100` ids) | Yes | Older; not used for this feature |

- **Format:** GeoJSON FeatureCollection, Polygon/MultiPolygon, properties are only
  `{domain_id, name}`.
- **CRS:** EPSG:4326 lon/lat. There is no `crs` member, but the fetch used `outSR=4326`
  and the coordinates check out (e.g. `[116.76957, -0.90587]`).
- **Kode field:** `domain_id`. **Kemendagri style**, no dots: prov 2 digits / kab 4 /
  kec 6 / desa 10 (BIG `KDEPUM` with the dots removed). The hierarchy is the code
  prefix (`[:2]`, `[:4]`, `[:6]`).
- **Scripts:** `data/big_boundaries/{fetch_big,simplify_big,dissolve,compute_area}.py`.
  They use only `shapely` and the standard library. `dissolve.py` builds each level at
  full resolution but **writes only simplified output**. No full-res kec/kab/prov
  geometry is saved to disk.
- **Gaps and oddities:**
  - Province **96 (Papua Barat Daya)** has no BIG archive, so its boundaries fall back
    to the simplified public desa file.
  - There is a stray empty `big-villages- .geojson` (the blank province code also
    appears in `manifest.json`), plus a matching `frontend/public/dukcapil-villages- .geojson`.
  - The per-province `dukcapil-districts-{prov}.geojson` files (commit `e2b1983`) were
    made by a split step that is not among the committed scripts.

**Test area confirmed:** Penajam Paser Utara = **`6409`** (Kemendagri), 4 kecamatan
(`640901` Penajam, `640902` Waru, `640903` Babulu, `640904` Sepaku), 54 desa. Its
geodesic area from the BIG desa polygons is **3,226.2 km²**. That figure matches
`backend/dukcapil/data/big_area.json` and is the reference for the Phase 1
"area within 2%" check.

## 2. Region codes in the app (BPS vs Kemendagri)

The code uses two numbering systems:

- **Kemendagri codes:** boundaries, the `dukcapil` app (`DukcapilRegion.code`,
  `prov_code`/`kab_code`/`kec_code`) and `djpk` (via a name-match crosswalk,
  `backend/djpk/crosswalk.py`).
- **BPS domain ids:** the `catalog`/`stats` stack (`catalog.Domain.domain_id`) and
  the region page route `/jelajahi/[domainId]`.

The two systems use **different numbers for many regencies, and for the Papua
provinces**. The bridge is name + Kota/Kab status matching in
`api/dukcapil_views.py` (`_resolve_dukcapil_regency`, `_REGENCY_CROSSWALK`) and on the
frontend (`dukcapilProvinceCode`: BPS `9400`→`91`, `9100`→`92`).

The new layers will key on Kemendagri codes (as the spec asks). The region page will
need the existing crosswalk to find them. I have not checked the BPS id for PPU
against `catalog.Domain`, because I did not query the database.

## 3. Frontend stack

- Next.js 14.2 (app router) + React 18 + Tailwind 3 + Recharts. Design system is
  "Laut & Kertas" (`DESIGN.md`, `lib/theme.ts`).
- **No map library is installed.** The maps are custom SVG components:
  - `ChoroplethMap`: fetches GeoJSON, zoom/pan, kec/desa levels.
  - `OutlineMap`: pre-projected outline paths.
  - `DukcapilMap`, `home/HeroMap`.
  - There is no MapLibre, Leaflet or d3 in `package.json`.
- **No headless browser** (Playwright/Puppeteer) is installed. `package.json` only
  has the scripts `dev`, `build` and `start`, so there is no `card` script.

## 4. Python / processing environment

- The backend is Django 5 + DRF + Celery in Docker. `backend/requirements.txt` has
  **no geo libraries**.
- The host has Python 3.9.6 and `shapely` 2.0.7. `rasterio`, `geopandas` and GDAL
  are **not** installed.
- The existing data scripts run on the host, outside Docker, with minimal
  dependencies.

## 5. Conflicts and adaptations

1. **CLAUDE.md/PRD describe "Cakupan", a BPS-only coverage tool.** The repo has since
   grown into NusaStats (dukcapil, djpk, frontend). CLAUDE.md's Phase 5 frontend gate
   has already been passed, so it does not block this work. Its traceability rules
   (stored, hashed source response for every value) apply in spirit. Proposal: record
   a SHA-256 for every downloaded tile in `sources.json`, and point every stats JSON
   at the tile hashes it used. This is the same precedent as `DukcapilFetchLog`.
2. **"Expose as regular NusaStats indicators" (spec §5.4) clashes with the data
   model.** `stats.DataPoint` must reference a confirmed BPS `catalog.Variable` and a
   BPS `CoverageCheckLog`, and the `dukcapil` docstring explicitly forbids putting
   non-BPS data into it. The existing pattern for a new source is a self-contained
   app keyed on Kemendagri codes, as `dukcapil` and `djpk` are. Proposal: a new
   `wilayah`/`terrain` Django app (indicator catalog + per-region values + source
   log), loaded from the derived JSON by a management command. It must call
   `bump_data_version` so the read-API cache invalidates.
3. **Folder layout (spec §4.1) vs the existing convention.**
   - Raw-data scripts live under `data/<source>/` with a `manifest.json`.
   - Web assets go to `frontend/public/`.
   - Small committed derived data goes to `backend/<app>/data/`.

   Proposal:
   - Put the pipeline code under `data/peta_wilayah/` (or top-level `pipelines/`, if
     you prefer the spec as written).
   - Write the layer images to `frontend/public/peta/{kode}/`, so Next.js can serve
     them; `data/derived/layers/` would not be served.
   - Put the stats JSON under the new backend app's `data/`.
   - Add `data/cache/` to `data/.gitignore`. `exports/` is already ignored.
4. **There is no saved full-res kab/kec geometry.** Stats must not use the
   simplified public files (their areas drift). The pipeline should dissolve the
   area's desa from the full-res BIG archive on the fly. That is cheap per area and
   reuses `dissolve.py`'s logic. It also means the 1 GB BIG archive is a
   prerequisite: someone has to run `fetch_big.py` for a fresh checkout, so it is not
   a true "empty cache, one command" setup. Province 96 would use the simplified
   fallback; that should be flagged in its metadata.
5. **Map library.** The spec prefers MapLibre GL when none exists. Every current map
   is custom SVG, and DESIGN.md defines map styling around it. Two options:
   - Add MapLibre: gives proper raster overlays, but is a new dependency with its own
     styling, and has no basemap unless tiles are added.
   - Extend the SVG map with a georeferenced `<image>` layer placed from
     `bounds.json`: simpler and consistent with the current maps, but less capable
     when zooming.

   This needs your call before Phase 3.
6. **Python dependencies.** rasterio/rioxarray/geopandas are new. Proposal: a
   pipeline-only `requirements-peta.txt` installed in a host venv. Leave them out of
   the backend Docker image, because the web app never touches rasters.
7. **Playwright** is a new frontend dev dependency for `npm run card` (Phase 5 only).
8. **Colors.** The WorldCover palette and the hypsometric tint are fixed data colors
   outside the Laut & Kertas tokens. That is acceptable under DESIGN.md's data-ramp
   precedent, but they must stay identical in dark mode, as the spec requires.
9. **IKN caveat.** Sepaku (`640904`) overlaps the Ibu Kota Nusantara area. The
   boundaries here are Kemendagri/BIG kabupaten boundaries and do not show IKN
   separately. Cards for 6409 should keep the "Batas wilayah indikatif" footer, and
   we may need a note.

## 6. Decisions needed before Phase 1

1. Where the pipeline lives: `data/peta_wilayah/` (matches the repo) or top-level
   `pipelines/` (matches the spec).
2. Whether to approve a new self-contained backend app for the terrain/land-cover
   indicators, instead of `stats.DataPoint`.
3. Whether a host venv with rasterio and friends is acceptable.
4. (Before Phase 3) MapLibre or an extension of the existing SVG map.
