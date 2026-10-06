# Peta Wilayah Phase 4: Maluku and Maluku Utara (all three layers)

Runs: 2026-10-06 (`uv run python -m all --level kabupaten|kecamatan [--layer nightlights] --prov 81 --prov 82`).

## Outcome

- **Maluku (81): 11 kabupaten/kota, 118 kecamatan. Maluku Utara (82): 10 kabupaten/kota, 118 kecamatan. All three
  layers: no failed checks; no skipped names or night-lights years.** Babar Barat (810804) was named from Dukcapil
  village records.
- **Two operational incidents, no data effect.**
  - The Mac slept overnight on battery and the run paused for about 9 hours; it resumed on wake.
  - Network drops failed 9 kabupaten in the first night-lights pass, all in the HEAD request, which had no retry. It
    now retries like the listings, and the 9 re-ran from cache.
- Backend export: 2,046 areas (158 kabupaten, 1,888 kecamatan), loaded with `load_peta`.

## Validation

| Check | Maluku | Maluku Utara |
|---|---|---|
| UTM vs geodesic / pixel vs UTM area | 0.19% / 0.09% | 0.19% / 0.07% |
| Nodata: DEM / land cover / night lights | 0 / 0 / none skipped | 0 / 0 / none skipped |
| Kabupaten sum to the province polygon | +0.000% | −0.001% |
| Max/min nest, kabupaten ↔ kecamatan | 11 of 11 | 10 of 10 |
| Kecamatan areas / land cover weighted | 0.043% / 0.009 pt | 0.011% / 0.010 pt |
| Smallest kecamatan | Kota Masohi 5,5 km² | Pulau Hiri 6,7 km² |

**Peaks: the closest set of matches so far.**

| Peak | Published | Our maximum | Difference |
|---|---|---|---|
| Binaiya (Seram, Maluku Tengah) | 3.030 m | 3.032 m at 129.456°E 3.173°S | +2 m |
| Gamalama (Kota Ternate) | 1.715 m | 1.723 m at 127.333°E 0.809°N | +7 m |
| Kapalatmada (Buru, Buru–Buru Selatan border) | 2.683 m | 2.693 m at 126.220°E 3.300°S | +10 m |

Sources: [List of ultras of the Malay Archipelago](https://en.wikipedia.org/wiki/List_of_ultras_of_the_Malay_Archipelago),
[gunungbagging.com (Binaiya)](https://www.gunungbagging.com/binaiya/), [Tirto (Gamalama)](https://tirto.id/benarkah-gunung-gamalama-di-ternate-akan-erupsi-gXWl).

## Findings

- **Terrain.** Kecamatan: Maluku 67 Perbukitan, 39 Dataran rendah, 10 Campuran, 2 Pegunungan; Maluku Utara 98
  Perbukitan, 11 Campuran, 8 Dataran rendah, 1 Pegunungan. Kota Ternate (Gamalama's island) is 42,8% *bergunung*
  by local relief, Buru Selatan 39,3%.
- **Mangrove.** Kepulauan Aru 19,6%, the highest share of any kabupaten so far, then Kepulauan Tanimbar 8,5%.
- **Night lights.**
  - Kota Ambon 38,8% lit in 2024, Kota Ternate 24,4%, Kota Tual 12,1%.
  - **Halmahera Tengah's lit area grew ×15 from a real base (12,6 km² in 2018)** to 8,3% of the area. That is the
    region of the Weda Bay nickel industrial area, a plausible source, though the lights alone do not name it.
  - Halmahera Selatan ×3,5 and Halmahera Timur ×3,4.

| Kode | Nama | Kelas medan | Rata-rata (m) | Maks (m) | Bergunung | Tutupan pohon | Mangrove | Bercahaya 2018 → 2024 |
|---|---|---|---|---|---|---|---|---|
| 8101 | Maluku Tengah | Perbukitan | 397 | 3.032 | 26,6% | 93,7% | 1,0% | 0,3% → 0,6% |
| 8102 | Maluku Tenggara | Campuran | 146 | 779 | 7,8% | 92,8% | 1,5% | 1,0% → 1,3% |
| 8103 | Kepulauan Tanimbar | Dataran rendah | 60 | 380 | 0,0% | 84,9% | 8,5% | 0,2% → 0,5% |
| 8104 | Buru | Perbukitan | 505 | 2.667 | 33,8% | 82,5% | 0,8% | 0,5% → 0,9% |
| 8105 | Seram Bagian Timur | Perbukitan | 228 | 1.193 | 4,5% | 95,6% | 1,8% | 0,3% → 0,4% |
| 8106 | Seram Bagian Barat | Perbukitan | 379 | 1.465 | 28,6% | 96,3% | 0,8% | 0,2% → 0,4% |
| 8107 | Kepulauan Aru | Dataran rendah | 30 | 110 | 0,0% | 76,0% | 19,6% | 0,1% → 0,2% |
| 8108 | Maluku Barat Daya | Perbukitan | 341 | 1.414 | 32,0% | 84,4% | 0,1% | 0,3% → 0,7% |
| 8109 | Buru Selatan | Perbukitan | 617 | 2.693 | 39,3% | 91,2% | 0,1% | 0,1% → 0,2% |
| 8171 | Kota Ambon | Perbukitan | 156 | 713 | 10,8% | 87,5% | 0,1% | 31,8% → 38,8% |
| 8172 | Kota Tual | Dataran rendah | 38 | 388 | 0,3% | 89,0% | 0,3% | 6,2% → 12,1% |
| 8201 | Halmahera Barat | Perbukitan | 264 | 1.547 | 12,9% | 95,8% | 1,8% | 0,6% → 1,3% |
| 8202 | Halmahera Tengah | Perbukitan | 204 | 1.250 | 8,2% | 93,4% | 1,4% | 0,6% → 8,3% |
| 8203 | Halmahera Utara | Perbukitan | 233 | 1.271 | 9,5% | 93,8% | 1,0% | 1,2% → 1,8% |
| 8204 | Halmahera Selatan | Perbukitan | 249 | 2.081 | 19,8% | 95,4% | 2,2% | 0,5% → 1,6% |
| 8205 | Kepulauan Sula | Perbukitan | 191 | 1.135 | 16,4% | 97,4% | 1,0% | 0,3% → 0,8% |
| 8206 | Halmahera Timur | Perbukitan | 326 | 1.435 | 23,4% | 95,2% | 1,2% | 0,3% → 1,1% |
| 8207 | Pulau Morotai | Perbukitan | 277 | 1.199 | 27,1% | 97,1% | 0,9% | 0,5% → 1,1% |
| 8208 | Pulau Taliabu | Perbukitan | 318 | 1.403 | 16,5% | 94,0% | 2,0% | 0,3% → 0,8% |
| 8271 | Kota Ternate | Perbukitan | 291 | 1.722 | 42,8% | 84,0% | 0,8% | 20,3% → 24,4% |
| 8272 | Kota Tidore Kepulauan | Perbukitan | 312 | 1.738 | 23,9% | 96,6% | 1,2% | 1,4% → 3,2% |
