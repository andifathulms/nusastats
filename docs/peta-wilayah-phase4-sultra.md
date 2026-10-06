# Peta Wilayah Phase 4: Sulawesi Tenggara (all three layers)

Runs: 2026-10-05/06 (`uv run python -m all --level kabupaten|kecamatan [--layer nightlights] --prov 74`).
First province run with all three layer types from the start: terrain (including very low land and local relief),
land cover, and night lights 2018–2024.

## Outcome

- **17 kabupaten/kota and 221 kecamatan, all three layers: no failed checks, no skipped names, no skipped
  night-lights years.**
- **One incident.** A DNS outage outlasted the listing retries during the first night-lights pass, and 9 kabupaten
  failed with "nodename nor servname". Nothing was written for them, and they re-ran from the cached annual rasters.
  Listing now retries for about 2 minutes.
- Tongauna Utara (740242) has no row in Dukcapil's kecamatan layer and was named from village records automatically.
- Backend export: 1,520 areas (116 kabupaten, 1,404 kecamatan), 77,488 values.

## Validation

| Check | Result |
|---|---|
| UTM vs geodesic / pixel vs UTM area | max 0.08% / 0.41% (Batupoaro, a 1.9 km² urban kecamatan of Kota Baubau) |
| Nodata: DEM / land cover / night lights | 0% / 0% / no year over the limit |
| Land cover shares sum; palette | 99,98–100,02%; exact |
| Kabupaten sum to the province polygon | within 0.000% |
| Kabupaten max/min = highest/lowest kecamatan max/min | exact in 17 of 17 |
| Kecamatan areas sum to the kabupaten; land cover weighted | within 0.038%; within 0.01 point |
| **Gunung Mekongga** (published 2,620 m, Mosero-sero summit) | Kolaka Utara max **2,640 m** at 121.237°E 3.664°S, where three kabupaten meet on the massif (Kolaka 2,621 m, Kolaka Timur 2,605 m). +20 m, consistent with a forested peak in a surface model. |

## Findings

- **Terrain.** Kabupaten: 11 Perbukitan, 5 Dataran rendah, 1 Campuran, no Pegunungan. Kolaka Utara is still 53%
  *bergunung* by local relief: steep, but mostly below 1.000 m. Kecamatan: 98 Perbukitan, 81 Dataran rendah,
  33 Campuran, 9 Pegunungan.
- **Very low land (lower bound).** Muna Barat 18,3% under 10 m, Kota Kendari 13,8%, Wakatobi 13,5%.
- **Mangrove.** Muna Barat 11,5%, Buton Utara 9,1%, Muna 5,6%.
- **Night lights.**
  - Kota Kendari is 69,7% lit in 2024 and Kota Baubau 23,2%.
  - Konawe Utara's lit area grew ×15,8 from a real base (lit share 0,14% → 2,27%; Sulawesi's nickel-mining belt).
  - **Muna Barat's ×55 is from an almost-dark base** (0,009% → 0,52%).

**Card fix from this run.** A growth ratio over a base lit area under 1 km² is no longer shown as "×N". The panel and
card show the latest lit area "dari <1 km²" instead (`MIN_BASE_LIT_KM2` in `frontend/lib/peta.ts`).

| Kode | Nama | Kelas medan | Rata-rata (m) | Maks (m) | Bergunung | < 10 m | Tutupan pohon | Mangrove | Bercahaya 2018 → 2024 |
|---|---|---|---|---|---|---|---|---|---|
| 7401 | Kolaka | Perbukitan | 493 | 2.621 | 29,5% | 5,6% | 82,1% | 0,4% | 1,5% → 5,1% |
| 7402 | Konawe | Perbukitan | 427 | 2.427 | 29,9% | 1,9% | 86,9% | 0,3% | 1,0% → 4,6% |
| 7403 | Muna | Dataran rendah | 98 | 778 | 2,0% | 9,6% | 85,9% | 5,6% | 0,8% → 1,7% |
| 7404 | Buton | Perbukitan | 226 | 778 | 2,3% | 2,9% | 94,4% | 2,2% | 0,3% → 1,0% |
| 7405 | Konawe Selatan | Campuran | 133 | 954 | 3,1% | 6,5% | 78,4% | 3,8% | 0,9% → 3,5% |
| 7406 | Bombana | Perbukitan | 184 | 1.552 | 11,5% | 7,6% | 72,0% | 3,0% | 0,3% → 1,5% |
| 7407 | Wakatobi | Dataran rendah | 57 | 261 | 0,0% | 13,5% | 69,7% | 3,2% | 2,2% → 5,4% |
| 7408 | Kolaka Utara | Perbukitan | 764 | 2.640 | 53,4% | 4,1% | 91,8% | 0,6% | 0,2% → 0,9% |
| 7409 | Konawe Utara | Perbukitan | 389 | 2.017 | 36,8% | 5,4% | 91,6% | 1,6% | 0,1% → 2,3% |
| 7410 | Buton Utara | Perbukitan | 190 | 1.063 | 8,1% | 8,3% | 88,8% | 9,1% | 0,1% → 0,5% |
| 7411 | Kolaka Timur | Perbukitan | 674 | 2.605 | 33,0% | 0,0% | 91,0% | 0,0% | 0,2% → 0,7% |
| 7412 | Konawe Kepulauan | Perbukitan | 203 | 894 | 6,0% | 6,8% | 94,3% | 3,4% | 0,3% → 1,1% |
| 7413 | Muna Barat | Dataran rendah | 44 | 278 | 0,0% | 18,3% | 73,9% | 11,5% | 0,0% → 0,5% |
| 7414 | Buton Tengah | Dataran rendah | 76 | 505 | 0,8% | 8,0% | 87,0% | 1,4% | 0,7% → 2,7% |
| 7415 | Buton Selatan | Perbukitan | 197 | 681 | 2,5% | 2,1% | 86,4% | 0,1% | 1,1% → 2,1% |
| 7471 | Kota Kendari | Dataran rendah | 66 | 425 | 0,0% | 13,8% | 70,5% | 1,0% | 46,6% → 69,7% |
| 7472 | Kota Bau Bau | Perbukitan | 208 | 680 | 1,3% | 3,4% | 87,6% | 1,0% | 13,1% → 23,2% |
