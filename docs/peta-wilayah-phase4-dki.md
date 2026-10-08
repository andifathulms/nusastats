# Peta Wilayah Phase 4: DKI Jakarta (all three layers) — Java complete

Runs: 2026-10-08, 10:08–10:33 UTC (`uv run python -m all --level kabupaten|kecamatan [--layer nightlights] --prov 31`).
**With DKI Jakarta, all six Java provinces are done.**

## Outcome

- **6 kabupaten/kota (5 kota + Kepulauan Seribu) and 44 kecamatan, all three layers: no failed checks, no errors, no
  skipped years.** Kepulauan Seribu's islets (10,7 km² in total) pass every check, including night lights.
- Backend export loaded with `load_peta`.

## Validation

| Check | Result |
|---|---|
| UTM vs geodesic / pixel vs UTM area | max 0.03% / 0.24% (Kepulauan Seribu Utara) |
| Smallest kecamatan | Johar Baru 2,4 km², Kepulauan Seribu Selatan 4,0 km², Senen 4,3 km²; all pass |
| Nodata: DEM / land cover / night lights | 0% / 0% / none skipped |
| Land cover shares sum; palette | 99,98–100,01%; exact |
| Kabupaten sum to the province polygon | within 0.012% |
| Kabupaten max/min = highest/lowest kecamatan max/min | exact in 6 of 6 |
| Kecamatan areas sum to the kabupaten; land cover weighted | within 0.209%; within 0.067 point |

No peak reference: the highest point is 92 m (Jakarta Timur).

## Findings

- **All 44 kecamatan are *Dataran rendah*.**
- **Built-up.** Jakarta Pusat 88,4%, Jakarta Barat 84,6%, Jakarta Selatan 80,5%.
- **Very low land (lower bound; buildings raise the surface model).** Jakarta Utara is at least 64,2% under 5 m and
  97,7% under 10 m. The lowest model values are below sea level (Jakarta Utara min −17 m); these are likely water
  surfaces or model artefacts, and are **not** a measurement of land subsidence.
- **Night lights.** All five kota are 100% lit in 2018 and 2024 (saturated, no growth signal). Kepulauan Seribu
  37,5 → 43,6%.

| Kode | Nama | Luas (km²) | Kelas medan | Rata-rata (m) | Lahan terbangun | < 5 m | < 10 m | Bercahaya 2018 → 2024 |
|---|---|---|---|---|---|---|---|---|
| 3101 | Kepulauan Seribu | 10,7 | Dataran rendah | 7,2 | 12,2% | 40,7% | 71,3% | 37,5% → 43,6% |
| 3171 | Jakarta Pusat | 47,9 | Dataran rendah | 9,4 | 88,4% | 8,5% | 62,8% | 100,0% → 100,0% |
| 3172 | Jakarta Utara | 147,1 | Dataran rendah | 4,2 | 71,3% | 64,2% | 97,7% | 100,0% → 100,0% |
| 3173 | Jakarta Barat | 125,4 | Dataran rendah | 8,2 | 84,6% | 20,7% | 75,2% | 100,0% → 100,0% |
| 3174 | Jakarta Selatan | 144,7 | Dataran rendah | 33,4 | 80,5% | 0,0% | 0,7% | 100,0% → 100,0% |
| 3175 | Jakarta Timur | 185,1 | Dataran rendah | 26,8 | 77,0% | 4,4% | 21,0% | 100,0% → 100,0% |
