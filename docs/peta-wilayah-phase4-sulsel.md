# Peta Wilayah Phase 4: Sulawesi Selatan (kabupaten/kota and kecamatan)

Run: 2026-10-05, 04:45–05:02 UTC. Command: `uv run python -m all --level kabupaten --prov 73`.
Log: `batch-20261005T044522Z.jsonl` (local).

## Outcome

- **24 of 24 kabupaten/kota, both layers: 48 jobs computed, 0 failed checks, 0 errors.**
- 31 new tiles downloaded (sha256 in `sources.json`).
- Stats JSON committed; map images stay local.
- The backend export now covers 706 areas (Kalimantan plus Sulsel) and is loaded with `load_peta`.

## Validation

| Check | Result |
|---|---|
| UTM vs geodesic polygon area | max 0.19% |
| Pixel vs UTM polygon area | max 0.004% |
| DEM nodata / land cover nodata | 0% / max 0.0031% (limit 0.1%; first non-zero value so far) |
| Land cover shares sum | 99,99–100,01%; colours exactly the official palette |
| Kabupaten areas sum to the province polygon | within 0.000% |
| **Latimojong / Rantemario** (published 3,478 m) | Enrekang max **3,433 m** at 120.024°E 3.385°S, right on the summit (Enrekang–Luwu border; Luwu reads 3,416 m). −45 m (−1.3%) |

Pattern across the three peaks checked so far: forested massifs read **higher** than the published height, because
the surface model includes canopy (Bukit Raya +33 m). Sharp, bare summits read **lower**, because 30 m pixels average
the peak down (Halau-Halau −27 m, Rantemario −45 m). Cards should round heights, and never claim a summit height to
the metre.

## Summary

Terrain classes: 3 Pegunungan (Tana Toraja, Toraja Utara, Luwu Utara), 10 Perbukitan,
6 Campuran, 5 Dataran rendah. Kota Makassar is the only area where *Lahan terbangun* dominates (51%).
Cropland share is highest in the rice belt: Wajo 35,9%, Takalar 31,6%, Pinrang 29,6%, Sidenreng Rappang 28,9%.

| Kode | Nama | Kelas medan | Rata-rata (m) | Maks (m) | Tutupan pohon | Lahan pertanian | Lahan terbangun |
|---|---|---|---|---|---|---|---|
| 7301 | Kepulauan Selayar | Campuran | 116 | 615 | 86,8% | 0,8% | 0,8% |
| 7302 | Bulukumba | Campuran | 222 | 2.514 | 75,5% | 15,8% | 3,0% |
| 7303 | Bantaeng | Perbukitan | 493 | 2.800 | 74,8% | 12,8% | 4,6% |
| 7304 | Jeneponto | Dataran rendah | 153 | 2.357 | 50,5% | 25,9% | 4,6% |
| 7305 | Takalar | Dataran rendah | 51 | 649 | 39,5% | 31,6% | 4,2% |
| 7306 | Gowa | Perbukitan | 565 | 2.860 | 72,2% | 13,6% | 3,2% |
| 7307 | Sinjai | Perbukitan | 433 | 2.849 | 83,6% | 10,2% | 1,7% |
| 7308 | Bone | Campuran | 236 | 1.962 | 63,8% | 21,2% | 1,6% |
| 7309 | Maros | Perbukitan | 354 | 1.682 | 69,4% | 13,5% | 2,2% |
| 7310 | Pangkajene Kepulauan | Dataran rendah | 134 | 1.347 | 54,0% | 15,2% | 2,5% |
| 7311 | Barru | Perbukitan | 312 | 1.691 | 78,7% | 8,5% | 1,4% |
| 7312 | Soppeng | Campuran | 266 | 1.465 | 71,3% | 19,0% | 2,0% |
| 7313 | Wajo | Dataran rendah | 47 | 1.019 | 36,6% | 35,9% | 1,7% |
| 7314 | Sidenreng Rappang | Campuran | 319 | 3.311 | 58,4% | 28,9% | 2,3% |
| 7315 | Pinrang | Campuran | 335 | 2.144 | 53,3% | 29,6% | 2,2% |
| 7316 | Enrekang | Perbukitan | 840 | 3.433 | 81,2% | 3,0% | 1,0% |
| 7317 | Luwu | Perbukitan | 544 | 3.416 | 74,2% | 11,7% | 1,2% |
| 7318 | Tana Toraja | Pegunungan | 1.166 | 3.081 | 76,0% | 3,2% | 0,4% |
| 7322 | Luwu Utara | Pegunungan | 1.158 | 3.020 | 87,9% | 3,1% | 0,4% |
| 7324 | Luwu Timur | Perbukitan | 618 | 3.016 | 75,2% | 3,7% | 0,5% |
| 7326 | Toraja Utara | Pegunungan | 1.470 | 2.879 | 83,8% | 6,0% | 0,8% |
| 7371 | Kota Makassar | Dataran rendah | 6 | 36 | 16,4% | 6,3% | 51,3% |
| 7372 | Kota Pare Pare | Perbukitan | 140 | 794 | 68,2% | 7,0% | 13,1% |
| 7373 | Kota Palopo | Perbukitan | 404 | 1.923 | 76,0% | 7,2% | 5,4% |

## Step 2: kecamatan (313)

Run 05:09–05:36 UTC, `uv run python -m all --level kecamatan --prov 73`: **620 jobs computed, 0 failed checks,
0 errors.** No new tiles.

**3 kecamatan were first skipped** as "no Kemendagri name": 730511, 730512 and 730603. They are real kecamatan:
BIG has their desa, and Dukcapil's village records name them (730511 Polongbangkeng Timur and 730512 Laikang in
Kab. Takalar; 730603 Tompobulu in Kab. Gowa). Dukcapil's kecamatan layer has no row for them, so the display boundary
file leaves them nameless.

Nationally, 169 kecamatan are nameless in the display file:
- 136 are the stale Papua 92xx codes (no name anywhere; remap later);
- 2 in Karimun (210323, 210324) have no name anywhere;
- 31 are real kecamatan named only in Dukcapil village records.

**Fix:** `manage.py export_kecamatan_names` writes `backend/peta/data/kecamatan_names.json` (7,275 kecamatan,
code → name, each with the village row and DukcapilFetchLog it came from; ambiguous names are left out). The outline
step uses it only where the display file has no name. Re-running the batch computed just those 3 (6 jobs, 620 up to
date), so **all 313 Sulsel kecamatan are covered**. Tompobulu classifies as Pegunungan.

| Check | Result |
|---|---|
| Kabupaten max/min = highest/lowest kecamatan max/min | exact in 24 of 24 |
| Kecamatan areas sum to the kabupaten area | within 0.073% |
| Area-weighted kecamatan land cover = kabupaten shares | within 0.016 percentage points |
| Pixel vs UTM polygon area | max 0.97%, in Kepulauan Sangkarrang (0.9 km² of islets, where one 30 m pixel is a big share). Limit 2% |
| Land cover nodata | max 0.078%, in Liukang Kalmas (small islands, coastal pixels). Limit 0.1% |

Even smaller island kecamatan elsewhere could exceed the 2% area limit. They would then fail loudly and be logged,
not be rendered. Decide then whether tiny islands need a size-aware limit.

Backend export: 1,019 areas (80 kabupaten, 939 kecamatan), 18,342 values, loaded with `load_peta`.
