# FEATURE: Peta Wilayah — Terrain, Land Cover & Map Cards

Feature spec for NusaStats. Read this together with `CLAUDE.md` and `DESIGN.md`.
Phase 0 findings are in `docs/peta-wilayah-phase0.md`. The decisions taken after Phase 0
(2026-10-05) are folded into this document. They are marked **[Decided]** where they
replace the original proposal.

## 0. Rules for whoever builds this (Claude Code)

1. **Existing conventions win.** Read `PRD.md`, `CLAUDE.md`, and any `DESIGN.md` first. Use the project's existing stack, folder layout, naming, and styling. Where this doc conflicts with them, follow them and note the conflict.
2. **Do not duplicate boundaries.** NusaStats already has administrative boundaries down to desa level: the BIG 1:10K desa polygons in `data/big_boundaries/`, keyed by Kemendagri `domain_id`. Every new layer reads those boundaries and joins on the existing kode wilayah. Never download a second boundary dataset.
3. **Deterministic and auditable.** Same inputs give the same outputs. Every number has a recorded source, year, and method. No ML in the computation path.
4. **Local only.** No hosting work. Large raw data lives in a git-ignored cache; only scripts and small derived outputs are committed.
5. **Work in phases** (section 7). Finish and verify one phase before starting the next. Report back at the end of Phase 0 before writing pipeline code.

## 1. Goal

For any provinsi, kabupaten/kota, or kecamatan already in NusaStats:

- Render its map with an **elevation / hillshade** layer and a **land cover** layer.
- Compute **terrain and land cover statistics** and store them as regular NusaStats indicators.
- Classify the area's terrain (lowland / hilly / mountainous / mixed) with a **transparent, configurable rule**.
- Export a **1080×1920 PNG card** for TikTok, combining the map with key numbers.

## 2. Non-goals (for now)

- No public deployment, tile server, or backend service.
- No editing of boundaries.
- No time series of land cover change (possible later, see section 9).
- No claim that the terrain class is an official classification.

## 3. Data sources

Verify each license and exact attribution text from the official source before finishing Phase 1 and Phase 2, and store it in the source manifest (section 4.2).

| Layer | Dataset | Resolution | Access | License |
|---|---|---|---|---|
| Elevation | Copernicus DEM GLO-30 | ~30 m | Public COG tiles (1°×1°), e.g. AWS Open Data bucket `copernicus-dem-30m` | Free with attribution (verified, see below) |
| Land cover | ESA WorldCover 2021 v200 | 10 m | Public COG tiles (3°×3°), e.g. AWS Open Data bucket `esa-worldcover` | CC BY 4.0 |
| Boundaries | Existing NusaStats data | — | Already in repo | As already documented |

Download only the tiles that intersect the selected area's bounding box. The whole of Indonesia is tens of GB and must never be downloaded in one go.

**Copernicus DEM, verified 2026-10-05** (dataspace.copernicus.eu COP-DEM collection page; the AWS bucket `readme.html`):

- **Required notice for modified/derived products:** "produced using Copernicus WorldDEM-30 © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA; all rights reserved".
- **It is a surface model (DSM).** Heights include canopy and buildings, so "elevation" in a forested area is top-of-canopy. Heights are relative to the EGM2008 geoid (EPSG:3855), in metres.
- **Ocean has no tiles.** A tile absent from the bucket's `tileList.txt` is ocean.
- **Tile naming:** `Copernicus_DSM_COG_10_S01_00_E116_00_DEM` covers lat −1…0, lon 116…117.

### WorldCover classes (labels and colors)

Use the official WorldCover palette so maps match the source documentation. Indonesian labels are for display.

| Code | Class | Label (ID) | Color |
|---|---|---|---|
| 10 | Tree cover | Tutupan pohon | `#006400` |
| 20 | Shrubland | Semak belukar | `#ffbb22` |
| 30 | Grassland | Padang rumput | `#ffff4c` |
| 40 | Cropland | Lahan pertanian | `#f096ff` |
| 50 | Built-up | Lahan terbangun | `#fa0000` |
| 60 | Bare / sparse vegetation | Lahan terbuka | `#b4b4b4` |
| 70 | Snow and ice | Salju dan es | `#f0f0f0` |
| 80 | Permanent water bodies | Badan air | `#0064c8` |
| 90 | Herbaceous wetland | Lahan basah | `#0096a0` |
| 95 | Mangroves | Mangrove | `#00cf75` |
| 100 | Moss and lichen | Lumut | `#fae6a0` |

Note for display: satellite land cover can confuse plantations (sawit, akasia) with natural forest; both usually appear as "Tutupan pohon". Cards must not say "hutan" for class 10; say "tutupan pohon".

## 4. Pipeline

**[Decided]** The pipeline is Python 3.12 in its own **uv-managed venv** under `data/peta_wilayah/`. `pyproject.toml` and `uv.lock` are committed, and dependencies are pinned. There is **no system GDAL**: rasterio's wheels bundle their own. These libraries stay out of the backend Docker image, because the web app never reads rasters. Libraries: numpy, shapely, pyproj, rasterio, Pillow, PyYAML (no geopandas or rioxarray needed).

### 4.1 Layout

**[Decided]** This follows the repo convention: raw-data scripts live under `data/<source>/`, and web assets live under `frontend/public/`.

```
data/peta_wilayah/
  pyproject.toml, uv.lock, .python-version
  sources.json      # committed manifest: datasets, licences, per-tile sha256
  config/
    terrain_rules.yaml   # classification thresholds (5.2)
    terrain.yaml         # processing/render params (resolution, hillshade, tint)
  common/           # paths, tile index, cache, manifest, projection, outlines
  outlines/         # BIG desa -> full-detail kec/kab/prov outlines (cached)
  terrain/          # DEM download, clip, slope, hillshade, stats
  landcover/        # WorldCover (Phase 2)
  tests/
  cache/            # git-ignored: raw tiles, full-detail outlines, run logs
frontend/public/peta/{kode}/
  terrain.json, landcover.json
  hillshade.webp, elevation.webp, landcover.webp, bounds.json
```

### 4.2 Cache and manifest

- `data/peta_wilayah/cache/` is git-ignored. Downloads are idempotent: a cached tile is reused only if its sha256 matches the one recorded in `sources.json`. If a re-download produces a different hash from the recorded one, the run fails loudly, because the upstream data has changed.
- `data/peta_wilayah/sources.json` (committed) records, per dataset: source URL pattern, version, year, licence, attribution text, and per-tile sha256, size and download date.
- **[Decided]** A full rebuild for one area works from an empty `cache/` with one command, **assuming the BIG desa archive (`data/big_boundaries/big-villages-*.geojson`) is present**. That archive is shared boundary data, regenerated with `data/big_boundaries/fetch_big.py`, and is not part of this cache.

### 4.3 Processing per area

0. **[Decided] Full-detail outlines.** The committed `frontend/public/dukcapil-*.geojson` outlines are simplified for display, so they must not be used for stats. The `outlines` step dissolves a province's full-res BIG desa polygons into full-detail kecamatan, kabupaten and provinsi outlines, cached in `cache/outlines/{prov}/`. It runs automatically when missing. Provinsi **96** (Papua Barat Daya) has no BIG archive, so it is **logged as skipped** (`cache/outlines/skipped.json` and stdout). It never falls back to the simplified display file.
1. Load the area polygon from the full-detail outlines by kode wilayah. Handle multipolygons (islands).
2. Find intersecting tiles from the bounding box, download missing ones, build a VRT/mosaic.
3. Clip to the polygon. Pixels outside are nodata.
4. **Reproject for any area or slope calculation** to the local UTM zone chosen from the polygon centroid (Indonesia spans several zones). Never compute areas or slopes in degrees.
5. Terrain: elevation, slope (degrees), hillshade (azimuth 315°, altitude 45°, values configurable).
6. Land cover: per-class pixel counts converted to km².
7. Render web-friendly layers (WebP with transparency outside the polygon) plus `bounds.json` for placing them on the map. Keep each image under ~2 MB; downsample if needed and record the factor. **[Decided]** Display layers are rendered on a regular **EPSG:4326 lon/lat grid**. The existing SVG map (`ChoroplethMap`) projects linearly in lon/lat (x = (lon − lonMin)·s·cos(midLat), y = (latMax − lat)·s), so a lon/lat raster stretched over its `bounds.json` box lines up exactly. Stats are still computed in UTM.

### 4.4 Commands

Run from `data/peta_wilayah/`:

```
uv run python -m outlines  --prov 64          # full-detail outlines (auto-run by terrain)
uv run python -m terrain   --kode 6409
uv run python -m landcover --kode 6409        # Phase 2
uv run python -m all       --level kabupaten  # Phase 4: batch, resumable
```

Batch runs must be resumable (skip areas whose outputs are newer than their inputs) and log failures without stopping the whole run.

## 5. Statistics and indicators

### 5.1 Terrain stats (`frontend/public/peta/{kode}/terrain.json`)

- Elevation (m): min, max, mean, median, p5, p95.
- Relief (m): p95 − p5.
- Area share by elevation band: <100, 100–500, 500–1000, 1000–2000, ≥2000 m.
- Slope (°): mean; area share for <8°, 8–25°, ≥25°.
- `terrain_class` and `terrain_class_reason` (see 5.2).
- Metadata: dataset, version, pixel size used, CRS used, computed_at.

### 5.2 Terrain classification rule

Thresholds live in `config/terrain_rules.yaml`, not in code. Rules are checked in order; the first match wins. Starting values (tunable):

1. **Pegunungan** — ≥40% of area at ≥1000 m, OR ≥40% of area with slope ≥25°.
2. **Perbukitan** — ≥50% of area with slope ≥8°, OR ≥50% of area at ≥200 m.
3. **Dataran rendah** — ≥60% of area at <100 m AND ≥60% of area with slope <8°.
4. **Campuran** — anything else.

`terrain_class_reason` must state which rule matched and the actual values, e.g. `"Perbukitan: 58,0% area lereng ≥8°"` (Indonesian copy and number format). The UI and cards label this as a NusaStats classification, not an official one.

### 5.3 Land cover stats (`frontend/public/peta/{kode}/landcover.json`)

- Area (km²) and share (%) per WorldCover class.
- Dominant class.
- Metadata as above, including the WorldCover year.

### 5.4 Integration with existing indicators

**[Decided]** The values go into a **new self-contained backend app**, modelled on `dukcapil` and `djpk`. They do not go into `stats.DataPoint`, which is reserved for BPS-confirmed data. The app is keyed by Kemendagri `domain_id` (2/4/6 digits) and has:

- an indicator catalog;
- per-region values;
- a source log that points at the `sources.json` tile hashes;
- a management command that loads the derived JSON and calls `bump_data_version`.

BPS-keyed pages (`/jelajahi/[domainId]`) reach it through the existing BPS→Kemendagri regency crosswalk (`api/dukcapil_views.py`). **Before Phase 4, report every crosswalk match failure.**

Each value carries source, year, unit and method, like every other indicator. At minimum: mean elevation, relief, share above 1000 m, share of slope ≥25°, terrain class, share of tree cover, share of built-up, share of cropland.

Kecamatan values come from the same pipeline at kecamatan level. Kabupaten values must be computed from the kabupaten polygon directly, not averaged from kecamatan values.

## 6. Frontend

Follow the existing frontend stack and design system. **[Decided] No MapLibre.** Extend the existing SVG map (`ChoroplethMap`) with georeferenced `<image>` layers placed from `bounds.json`, in the same linear lon/lat projection (see 4.3 step 7).

### 6.1 Map view

- Area selector using the existing provinsi → kabupaten → kecamatan hierarchy.
- Layer toggle: Boundary only / Elevation + hillshade / Land cover.
- Kecamatan outlines on top of the kabupaten view, clickable to drill down.
- Legend for the active layer. Elevation uses a hypsometric tint (green lowland → tan → brown → white peaks) over hillshade.
- Side panel: terrain stats, terrain class with its reason, land cover breakdown as a bar, plus existing NusaStats indicators for the area.
- Source/attribution line always visible.

### 6.2 Card renderer

A dedicated route, e.g. `/card/{template}/{kode}`, rendering exactly 1080×1920 px, plus a script that screenshots it to PNG with a headless browser (e.g. Playwright):

```
npm run card -- --template terrain --kode 6409
npm run card -- --template landcover --level kabupaten --provinsi 64   # batch
```

Output to `exports/cards/{template}/{kode}.png` (git-ignored).

Templates for v1:

1. **terrain** — elevation map, terrain class, mean elevation, highest point, share above 1000 m.
2. **landcover** — land cover map, top 3 classes with shares, legend for visible classes only.
3. **compare** — two areas side by side on the same scale, one stat row each (optional, after 1 and 2 work).

Card layout rules:

- Title: area name, with provinsi underneath.
- Keep text and key content out of TikTok's UI zones: roughly the top 220 px, bottom 420 px, and right 160 px. Add a debug toggle that draws these zones.
- Corner tag `Fathul · Dev` in a fixed position and style on every card.
- Footer with data source, year, and "Batas wilayah indikatif".
- Numbers rounded for reading (e.g. "62%", "1.240 m") using Indonesian number formatting.
- Rendering must be deterministic: same kode and template produce the same image.

## 7. Phases and acceptance criteria

**Phase 0 — Discovery (report back, no pipeline code yet)**
- Where boundaries are stored, format, CRS, levels available, the kode wilayah field name and format, and whether it is BPS or Kemendagri style.
- Current frontend stack and whether a map library is present.
- Any conflicts between this doc and the existing PRD/CLAUDE.md.
- Done when a short report is written to `docs/peta-wilayah-phase0.md`.

**Phase 1 — Terrain for one kabupaten** (test area: Penajam Paser Utara, Kemendagri `6409`, confirmed in Phase 0)
- Tiles download from an empty `cache/` with one command, assuming the BIG desa archive is present (4.2).
- `peta/{kode}/terrain.json` and layer images produced; terrain class has a reason string.
- Sanity check: max elevation is plausible against a known reference. The area computed from the polygon in UTM, and the area from clipped pixels, are each within 2% of the polygon's own geodesic area (6409 reference: **3,226.2 km²**, the sum of the BIG desa polygons in `backend/dukcapil/data/big_area.json`).

**Phase 2 — Land cover for the same kabupaten**
- Class shares sum to 100% (±0.5%).
- Rendered colors match the official palette.

**Phase 3 — Map view in the app**
- Layer toggle, legend, stats panel, and kecamatan drilldown work for the test area.

**Phase 4 — Scale up**
- Before starting: report every BPS→Kemendagri crosswalk match failure (5.4).
- Batch run for all kabupaten/kota, then kecamatan, resumable and with a failure log.
- Indicators appear alongside existing NusaStats indicators, served from the new terrain/land-cover backend app (5.4).

**Phase 5 — Cards**
- `terrain` and `landcover` templates export correct 1080×1920 PNGs for single and batch runs.
- Safe-zone debug overlay works; attribution present on every card.

## 8. Accuracy guardrails

- Never present the terrain class as official.
- Always show the data year (e.g. "WorldCover 2021"), never imply it is current.
- "Tutupan pohon", not "hutan", for WorldCover class 10.
- If a computed value looks wrong (negative relief, shares not summing, missing tiles), fail loudly; do not render a card.

## 9. Later (not in v1)

Possible extra layers, each following the same pattern (pipeline → stats JSON → indicator → layer → card template): forest loss since 2000 (Hansen / Global Forest Watch), population density (WorldPop or GHSL), rainfall (CHIRPS), nighttime lights (VIIRS), and OSM roads/rivers as reference lines.
