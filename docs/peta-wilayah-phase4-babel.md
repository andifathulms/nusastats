# Peta Wilayah Phase 4: Kepulauan Bangka Belitung (all three layers)

Runs: 2026-10-09, 11:00–11:52 UTC (`uv run python -m all --level kabupaten|kecamatan [--layer nightlights] --prov 19`),
followed by a second pass that found every area up to date.

## Outcome

- **7 kabupaten/kota and 47 kecamatan, all three layers: no failed checks, no errors, no skipped names or
  night-lights years.**
- Backend export loaded with `load_peta`.

## Validation

| Check | Result |
|---|---|
| UTM vs geodesic / pixel vs UTM area | max 0.19% / 0.13% |
| Smallest kecamatan | Taman Sari 3,2 km², Girimaya 4,5 km² (Kota Pangkal Pinang); all pass |
| Nodata: DEM / land cover / night lights | 0% / 0% / none skipped |
| Land cover shares sum; palette | 99,98–100,01%; exact |
| Kabupaten sum to the province polygon | 16.690,1 km², within 0.000% |
| Kabupaten max/min = highest/lowest kecamatan max/min | exact in 7 of 7 |
| Kecamatan areas sum to the kabupaten; land cover weighted | within 0.004%; within 0.029 point |

**Peaks.**

| Peak | Published | Our maximum | Difference |
|---|---|---|---|
| Maras (Bangka; highest in the province) | 705 m (Mongabay; Bui summit from 1940s US Army maps), 710 m (RRI 2026); the usual hikers' summit about 695 m | Bangka 698,7 m at 105.849°E 1.864°S | −6 m vs 705; within the published range |

Other kabupaten maxima (not matched to a published height): Bangka Tengah 661 m, Belitung 503 m, Bangka Selatan 470 m,
Bangka Barat 446 m, Belitung Timur 422 m.

Sources: [Mongabay (2021)](https://mongabay.co.id/2021/06/12/setiap-bukit-di-bangka-adalah-wilayah-larangan-mengapa/),
[Mongabay (2026)](https://mongabay.co.id/short-article/2026/08/gunung-maras-oase-hijau-yang-tersembunyi-di-pulau-bangka/),
[RRI](https://rri.co.id/en/environment/2601545/gunung-maras-national-park-strengthens-commitment-to-biodiversity-conservation),
[Gunung Bagging (Maras – Bukit Buik)](https://www.gunungbagging.com/?p=25730).

## Findings

- **Terrain.** Every kabupaten/kota and all 47 kecamatan are *Dataran rendah* (means 13–33 m), with isolated granite
  hills rising to 420–700 m.
- **Low coasts.** Under 10 m: Kota Pangkal Pinang 48,9%, the kabupaten 15,5–22,0%.
- **Land cover.** Tree cover 75–82% outside the city; grassland 8,6–14,9% and bare land 1,2–2,9%, with mangrove up to
  7,9% (Bangka Barat). WorldCover has no mining class, so these shares cannot be attributed to tin mining from this data
  alone. Kota Pangkal Pinang is 29,8% built-up.
- **Night lights.** Kota Pangkal Pinang 77,5% → 83,9% lit. Every kabupaten roughly doubled its lit area (×2,1–2,6):
  Bangka 4,5% → 9,7%, Belitung 3,4% → 7,1%.

| Kode | Nama | Kelas medan | Rata-rata (m) | Maks (m) | <10 m | Tutupan pohon | Lahan terbangun | Bercahaya 2018 → 2024 |
|---|---|---|---|---|---|---|---|---|
| 1901 | Bangka | Dataran rendah | 28 | 699 | 15,5% | 80,8% | 1,5% | 4,5% → 9,7% |
| 1902 | Belitung | Dataran rendah | 30 | 503 | 19,1% | 81,9% | 1,3% | 3,4% → 7,1% |
| 1903 | Bangka Selatan | Dataran rendah | 27 | 470 | 19,4% | 79,8% | 0,6% | 0,9% → 2,2% |
| 1904 | Bangka Tengah | Dataran rendah | 33 | 661 | 18,7% | 74,6% | 1,2% | 3,2% → 6,7% |
| 1905 | Bangka Barat | Dataran rendah | 24 | 446 | 16,5% | 79,3% | 0,8% | 1,4% → 3,3% |
| 1906 | Belitung Timur | Dataran rendah | 26 | 422 | 22,0% | 78,8% | 0,8% | 1,5% → 3,0% |
| 1971 | Kota Pangkal Pinang | Dataran rendah | 13 | 84 | 48,9% | 45,6% | 29,8% | 77,5% → 83,9% |
