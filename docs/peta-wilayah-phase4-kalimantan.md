# Peta Wilayah Phase 4: Kalimantan (kabupaten/kota and kecamatan)

Run: 2026-10-05, 02:10–03:03 UTC.
Command: `uv run python -m all --level kabupaten --prov 61 --prov 62 --prov 63 --prov 64 --prov 65`.
Log: `data/peta_wilayah/cache/logs/batch-20261005T021041Z.jsonl` (local; summarised here).

## Outcome

- **56 of 56 kabupaten/kota done, both layers.** 109 jobs computed and 3 were already up to date (6409 from Phase 1–3,
  and Paser's land cover from the disk-guard test).
- **0 failed checks and 0 errors.** About 52 minutes of compute; the slowest job was Malinau terrain at 249 s.
- **Tiles:** 78 Copernicus DEM and 14 WorldCover tiles, 2.8 GB in the local cache, each sha256 recorded in
  `sources.json`. (The ~6 GB pre-run estimate also counted each DEM tile's auxiliary mask files, which are never
  downloaded.)
- **Committed:** the stats JSON and `bounds.json` per area. **Map images (.webp) stay local** (gitignored, as decided).

## Validation

| Check | Result |
|---|---|
| UTM vs geodesic polygon area | max deviation 0.19% (limit 2%) |
| Clipped pixel area vs UTM polygon area | max deviation 0.03% |
| DEM / land cover nodata inside polygons | 0% / 0% |
| Land cover shares sum | 99,98–100,02% (limit ±0,5%) |
| Rendered land cover colours | exactly the official palette in all 56 |
| Kabupaten areas sum to the province polygon | within 0.000% in all five provinces |
| **Bukit Raya** (published 2,278 m) | Katingan max **2,311 m** at 112.689°E 0.660°S, on the Kalbar–Kalteng border massif. +33 m, consistent with a surface model that includes canopy. Sintang reaches 2,294 m on the same massif. |
| **Gunung Halau-Halau** (published 1,892 m) | Hulu Sungai Tengah max **1,865 m** at 115.58°E 2.78°S (Meratus). −27 m (−1.4%). 30 m pixels can round off a sharp summit. Plausible, but the one reference that reads lower. |

## By province

| Provinsi | Kab/kota | Dataran rendah | Perbukitan | Campuran | Highest point |
|---|---|---|---|---|---|
| 61 Kalimantan Barat | 14 | 8 | 2 | 4 | 2.294 m |
| 62 Kalimantan Tengah | 14 | 10 | 1 | 3 | 2.311 m |
| 63 Kalimantan Selatan | 13 | 9 | 0 | 4 | 1.865 m |
| 64 Kalimantan Timur | 10 | 6 | 2 | 2 | 2.226 m |
| 65 Kalimantan Utara | 5 | 2 | 3 | 0 | 2.246 m |

Dominant land cover is *Tutupan pohon* in 54 areas. In Kota Pontianak and Kota Banjarmasin it is *Lahan terbangun*
(43%). Tree cover includes plantations, so never call it "hutan".

## All areas

Mean elevation and maximum in metres; shares of the area.

| Kode | Nama | Kelas medan | Rata-rata | Maks | Tutupan pohon | Lahan pertanian | Lahan terbangun |
|---|---|---|---|---|---|---|---|
| 6101 | Sambas | Dataran rendah | 35 | 1.570 | 81,7% | 3,0% | 0,6% |
| 6102 | Mempawah | Dataran rendah | 26 | 602 | 83,9% | 2,0% | 0,9% |
| 6103 | Sanggau | Dataran rendah | 79 | 1.401 | 96,0% | 0,1% | 0,3% |
| 6104 | Ketapang | Dataran rendah | 93 | 1.616 | 88,2% | 0,5% | 0,2% |
| 6105 | Sintang | Campuran | 225 | 2.294 | 97,1% | 0,0% | 0,1% |
| 6106 | Kapuas Hulu | Perbukitan | 324 | 2.004 | 96,2% | 0,1% | 0,1% |
| 6107 | Bengkayang | Campuran | 152 | 1.677 | 94,3% | 0,4% | 0,3% |
| 6108 | Landak | Campuran | 128 | 1.674 | 95,3% | 0,8% | 0,2% |
| 6109 | Sekadau | Campuran | 125 | 1.648 | 97,0% | 0,1% | 0,2% |
| 6110 | Melawi | Perbukitan | 240 | 1.692 | 95,0% | 0,0% | 0,1% |
| 6111 | Kayong Utara | Dataran rendah | 53 | 1.145 | 82,8% | 0,4% | 0,2% |
| 6112 | Kubu Raya | Dataran rendah | 12 | 439 | 68,2% | 0,6% | 0,5% |
| 6171 | Kota Pontianak | Dataran rendah | 5 | 30 | 27,1% | 0,1% | 43,1% |
| 6172 | Kota Singkawang | Dataran rendah | 40 | 937 | 80,7% | 2,5% | 3,9% |
| 6201 | Kotawaringin Barat | Dataran rendah | 34 | 1.028 | 82,5% | 0,4% | 0,3% |
| 6202 | Kotawaringin Timur | Dataran rendah | 53 | 991 | 88,4% | 0,5% | 0,3% |
| 6203 | Kapuas | Dataran rendah | 60 | 1.264 | 81,6% | 2,0% | 0,1% |
| 6204 | Barito Selatan | Dataran rendah | 45 | 870 | 84,4% | 2,0% | 0,2% |
| 6205 | Barito Utara | Campuran | 114 | 1.092 | 98,0% | 0,0% | 0,1% |
| 6206 | Katingan | Dataran rendah | 124 | 2.311 | 90,9% | 0,6% | 0,1% |
| 6207 | Seruyan | Dataran rendah | 87 | 1.530 | 82,3% | 0,6% | 0,1% |
| 6208 | Sukamara | Dataran rendah | 25 | 520 | 64,3% | 0,6% | 0,2% |
| 6209 | Lamandau | Campuran | 146 | 1.222 | 98,5% | 0,1% | 0,1% |
| 6210 | Gunung Mas | Campuran | 166 | 1.361 | 96,4% | 0,1% | 0,1% |
| 6211 | Pulang Pisau | Dataran rendah | 15 | 88 | 67,8% | 1,2% | 0,1% |
| 6212 | Murung Raya | Perbukitan | 414 | 1.901 | 99,0% | 0,0% | 0,0% |
| 6213 | Barito Timur | Dataran rendah | 50 | 796 | 90,3% | 0,8% | 0,4% |
| 6271 | Kota Palangkaraya | Dataran rendah | 30 | 160 | 79,4% | 1,3% | 1,4% |
| 6301 | Tanah Laut | Dataran rendah | 54 | 1.211 | 76,0% | 6,5% | 0,9% |
| 6302 | Kotabaru | Dataran rendah | 121 | 1.696 | 85,2% | 0,4% | 0,3% |
| 6303 | Banjar | Campuran | 134 | 1.333 | 72,7% | 9,8% | 1,1% |
| 6304 | Barito Kuala | Dataran rendah | 3 | 25 | 34,8% | 24,1% | 1,1% |
| 6305 | Tapin | Dataran rendah | 39 | 1.036 | 62,1% | 9,4% | 0,9% |
| 6306 | Hulu Sungai Selatan | Dataran rendah | 104 | 1.694 | 49,8% | 10,1% | 0,9% |
| 6307 | Hulu Sungai Tengah | Campuran | 262 | 1.865 | 76,9% | 6,2% | 1,3% |
| 6308 | Hulu Sungai Utara | Dataran rendah | 5 | 32 | 30,6% | 11,0% | 1,9% |
| 6309 | Tabalong | Campuran | 178 | 1.264 | 94,7% | 1,2% | 0,8% |
| 6310 | Tanah Bumbu | Dataran rendah | 111 | 1.240 | 88,3% | 1,7% | 0,7% |
| 6311 | Balangan | Campuran | 178 | 1.344 | 91,2% | 1,0% | 0,6% |
| 6371 | Kota Banjarmasin | Dataran rendah | 3 | 24 | 22,5% | 14,1% | 42,8% |
| 6372 | Kota Banjarbaru | Dataran rendah | 17 | 86 | 47,1% | 6,9% | 13,3% |
| 6401 | Paser | Campuran | 142 | 1.282 | 87,2% | 0,6% | 0,3% |
| 6402 | Kutai Kartanegara | Dataran rendah | 227 | 2.195 | 83,6% | 1,3% | 0,3% |
| 6403 | Berau | Perbukitan | 226 | 1.934 | 93,3% | 0,1% | 0,1% |
| 6407 | Kutai Barat | Dataran rendah | 97 | 1.232 | 93,1% | 0,6% | 0,2% |
| 6408 | Kutai Timur | Campuran | 239 | 2.133 | 94,2% | 0,1% | 0,1% |
| 6409 | Penajam Paser Utara | Dataran rendah | 89 | 751 | 86,9% | 2,4% | 0,5% |
| 6411 | Mahakam Ulu | Perbukitan | 512 | 2.226 | 99,2% | 0,0% | 0,0% |
| 6471 | Kota Balikpapan | Dataran rendah | 33 | 140 | 72,1% | 0,2% | 11,9% |
| 6472 | Kota Samarinda | Dataran rendah | 31 | 248 | 63,0% | 1,2% | 9,9% |
| 6474 | Kota Bontang | Dataran rendah | 22 | 124 | 56,5% | 0,2% | 11,5% |
| 6501 | Bulungan | Perbukitan | 236 | 2.093 | 85,5% | 0,1% | 0,1% |
| 6502 | Malinau | Perbukitan | 794 | 2.246 | 99,5% | 0,0% | 0,0% |
| 6503 | Nunukan | Perbukitan | 480 | 2.165 | 90,0% | 0,2% | 0,1% |
| 6504 | Tana Tidung | Dataran rendah | 29 | 735 | 70,9% | 0,3% | 0,1% |
| 6571 | Kota Tarakan | Dataran rendah | 27 | 121 | 67,3% | 0,2% | 7,6% |

## Step 2: kecamatan (626)

Run 03:12–04:41 UTC: `uv run python -m all --level kecamatan --prov 61 --prov 62 --prov 63 --prov 64 --prov 65`
(log `batch-20261005T031225Z.jsonl`). **1,244 jobs computed and 8 up to date** (PPU's four kecamatan from Phase 3).
**0 failed checks, 0 errors.** No new tiles: everything came from the kabupaten run's cache.

| Check | Result |
|---|---|
| Kecamatan guardrails | areas within 0.19% (UTM vs geodesic) and 0.17% (pixels vs UTM); no nodata; shares 99,98–100,02% |
| **Kabupaten max = highest kecamatan max** | exact in **56 of 56** |
| **Kabupaten min = lowest kecamatan min** | exact in **56 of 56** |
| Kecamatan areas sum to the kabupaten area | within 0.066% |
| Area-weighted kecamatan land cover = kabupaten shares | within 0.018 percentage points |

Each kabupaten is computed from its own polygon, not aggregated from kecamatan (spec §5.4). The nesting checks show
the two levels agree.

## Backend

`backend/peta/data/peta_export.json` (682 areas) is loaded by `manage.py load_peta` into the `peta` app: 12,276
values, served at `/api/peta/indicators/`, `/api/peta/regions/{code}/` (with peer ranks) and `/api/peta/rank/`.
The map panel shows those ranks.

## Not done yet in Phase 4

- The other regions of Indonesia (Sulawesi Selatan kabupaten next).
- Provinsi 96, via the old→new code remap noted in `docs/peta-wilayah-crosswalk.md`.
