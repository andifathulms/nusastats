# Peta Wilayah Phase 4: Aceh (all three layers) — Sumatra complete

Runs: 2026-10-09, 15:21–17:05 UTC (`uv run python -m all --level kabupaten|kecamatan [--layer nightlights] --prov 11`),
followed by a second pass that found every area up to date.

## Outcome

- **23 kabupaten/kota and 290 kecamatan, all three layers: no failed checks, no errors, no skipped names or
  night-lights years.**
- With Aceh, every Sumatra province (11–19, 21) is computed at kabupaten and kecamatan level.
- Backend export loaded with `load_peta`.

## Validation

| Check | Result |
|---|---|
| UTM vs geodesic / pixel vs UTM area | max 0.19% / 0.25% |
| Smallest kecamatan | Kota Kualasimpang 2,6 km², Kuta Raja 3,1 km²; all pass |
| Nodata: DEM / land cover / night lights | max 0.012% (Pulo Aceh, an island kecamatan; limit 1%) / 0% / none skipped |
| Land cover shares sum; palette | 99,98–100,02%; exact |
| Kabupaten sum to the province polygon | 56.834,9 km², within 0.000% |
| Kabupaten max/min = highest/lowest kecamatan max/min | exact in 23 of 23 |
| Kecamatan areas sum to the kabupaten; land cover weighted | within 0.176%; within 0.011 point |

**Peaks.**

| Peak | Published | Our maximum | Difference |
|---|---|---|---|
| Leuser massif (Gayo Lues) | Loser summit 3.404 m; one source lists an unnamed summit at 3.445 m (others 3.381 m, 3.119 m for the Leuser summit) | kec. Kutapanjang 3.460 m at 97.219°E 3.798°N; kec. Blangpegayon 3.371 m at 97.255°E 3.789°N | the province maximum; +15 m vs 3.445. Which named summit each point is cannot be settled from these sources |
| Bandahara (Gayo Lues; 3.749°N 97.782°E) | 3.012 m (Bakosurtanal 3.011,9 m), 3.030 m (Wikipedia), 3.007 m (PeakVisor) | kec. Pining 2.997 m at 97.783°E 3.749°N | −15 m vs 3.012 |
| Geureudong (Bener Meriah) | about 2.885 m | Bener Meriah 2.875 m at 96.817°E 4.811°N | −10 m |
| Peuet Sagoe (Pidie) | 2.801 m | Pidie 2.783 m at 96.329°E 4.915°N | −18 m |
| Burni Telong (Bener Meriah) | 2.624 m, 2.670 m | kec. Wih Pesam 2.600 m at 96.821°E 4.770°N | −24 m vs 2.624 |
| Seulawah Agam (Aceh Besar) | 1.810 m (Gunung Bagging), 1.726 m (Wikipedia-based) | kec. Seulimeum 1.804 m at 95.656°E 5.447°N | −6 m vs 1.810; the DEM supports the higher figure |

**The Langkat border point from the Sumatera Utara run** is on the Aceh side: kec. Badar (Aceh Tenggara) reads
2.834,6 m at 97.853°E 3.629°N, so Langkat's 2.821,5 m is its border slope. The
[Sumatera Utara report](peta-wilayah-phase4-sumut.md) is updated.

Sources: [Gunung Bagging (Aceh)](https://www.gunungbagging.com/nanggroe-aceh-darussalam/),
[Gunung Bagging (Bandahara)](https://www.gunungbagging.com/bandahara/),
[Wikipedia (Mount Bandahara)](https://en.wikipedia.org/wiki/Mount_Bandahara),
[PeakVisor (Ketambe)](https://peakvisor.com/adm/ketambe.html),
[Orami](https://www.orami.co.id/magazine/gunung-tertinggi-di-pulau-sumatera),
[Mountain Forecast (Bur Ni Telong)](https://mountain-forecast.com/peaks/Bur-Ni-Telong).

## Findings

- **Terrain: the most mountainous Sumatra province.** Gayo Lues (mean 1.469 m, 69,5% *bergunung*), Aceh Tengah, Aceh
  Tenggara, Bener Meriah and Aceh Barat Daya are *Pegunungan*; 10 are *Perbukitan*, 2 *Campuran*, 6 *Dataran rendah*.
  Kecamatan: 127 Dataran rendah, 74 Perbukitan, 62 Pegunungan, 22 Campuran, 5 Dataran.
- **Very low coasts.** Under 10 m: Kota Banda Aceh 99,2%, Kota Langsa 59,5%, Kota Lhokseumawe 44,2%.
- **Land cover.** Kota Banda Aceh is 54,4% built-up. Tree cover is 93–96% across the Leuser kabupaten. Aceh Utara
  has the most cropland (14,9%).
- **Night lights.** Kota Banda Aceh and Kota Lhokseumawe are 95–99% lit; Banda Aceh is flat (99,7% → 99,4%). Growth:
  Aceh Selatan ×4,6, Nagan Raya ×3,6, Aceh Tenggara ×3,4, Aceh Tamiang ×2,2. Gayo Lues is the darkest kabupaten
  (0,5% lit in 2024).

| Kode | Nama | Kelas medan | Rata-rata (m) | Maks (m) | <10 m | Bergunung | Tutupan pohon | Lahan terbangun | Bercahaya 2018 → 2024 |
|---|---|---|---|---|---|---|---|---|---|
| 1101 | Aceh Selatan | Perbukitan | 569 | 3.382 | 7,1% | 50,8% | 95,8% | 0,3% | 0,5% → 2,4% |
| 1102 | Aceh Tenggara | Pegunungan | 1.142 | 3.392 | 0,0% | 67,9% | 94,8% | 0,3% | 0,8% → 2,6% |
| 1103 | Aceh Timur | Perbukitan | 345 | 3.084 | 12,7% | 20,2% | 88,3% | 0,4% | 3,9% → 7,4% |
| 1104 | Aceh Tengah | Pegunungan | 1.272 | 2.819 | 0,0% | 53,5% | 90,4% | 0,4% | 0,7% → 1,3% |
| 1105 | Aceh Barat | Perbukitan | 253 | 1.741 | 11,0% | 14,3% | 92,2% | 0,5% | 2,1% → 4,8% |
| 1106 | Aceh Besar | Perbukitan | 377 | 2.154 | 6,6% | 25,5% | 78,1% | 1,5% | 10,6% → 14,9% |
| 1107 | Pidie | Perbukitan | 738 | 2.783 | 5,2% | 35,1% | 87,0% | 1,1% | 4,0% → 9,2% |
| 1108 | Aceh Utara | Dataran rendah | 170 | 1.633 | 23,3% | 2,1% | 75,8% | 1,3% | 14,3% → 20,9% |
| 1109 | Simeulue | Perbukitan | 69 | 582 | 13,5% | 1,4% | 94,2% | 0,3% | 0,6% → 0,9% |
| 1110 | Aceh Singkil | Dataran rendah | 48 | 801 | 24,0% | 0,3% | 86,6% | 0,5% | 2,4% → 3,1% |
| 1111 | Bireuen | Perbukitan | 336 | 2.750 | 12,7% | 17,7% | 85,4% | 1,6% | 14,1% → 21,6% |
| 1112 | Aceh Barat Daya | Pegunungan | 611 | 3.089 | 12,0% | 59,2% | 94,3% | 0,5% | 1,9% → 5,1% |
| 1113 | Gayo Lues | Pegunungan | 1.469 | 3.460 | 0,0% | 69,5% | 93,5% | 0,1% | 0,2% → 0,5% |
| 1114 | Aceh Jaya | Perbukitan | 375 | 2.309 | 8,5% | 27,7% | 94,8% | 0,2% | 0,6% → 1,3% |
| 1115 | Nagan Raya | Campuran | 490 | 2.786 | 12,5% | 31,4% | 94,2% | 0,3% | 1,1% → 3,9% |
| 1116 | Aceh Tamiang | Campuran | 176 | 1.962 | 20,4% | 16,2% | 82,8% | 0,9% | 5,3% → 11,5% |
| 1117 | Bener Meriah | Pegunungan | 983 | 2.875 | 0,0% | 39,3% | 92,5% | 0,7% | 1,0% → 2,4% |
| 1118 | Pidie Jaya | Perbukitan | 621 | 2.718 | 10,2% | 42,3% | 84,7% | 1,2% | 10,1% → 12,9% |
| 1171 | Kota Banda Aceh | Dataran rendah | 4 | 20 | 99,2% | 0,0% | 20,2% | 54,4% | 99,7% → 99,4% |
| 1172 | Kota Sabang | Perbukitan | 147 | 640 | 3,6% | 25,7% | 94,2% | 2,7% | 20,3% → 21,1% |
| 1173 | Kota Lhokseumawe | Dataran rendah | 20 | 119 | 44,2% | 0,0% | 61,3% | 13,4% | 92,4% → 95,0% |
| 1174 | Kota Langsa | Dataran rendah | 20 | 174 | 59,5% | 0,0% | 41,5% | 7,5% | 28,0% → 35,7% |
| 1175 | Kota Subulussalam | Dataran rendah | 121 | 1.274 | 0,4% | 7,2% | 92,5% | 0,5% | 2,4% → 3,6% |
