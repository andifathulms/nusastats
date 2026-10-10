# Peta Wilayah Phase 4: Papua, all six provinces (all three layers) — Phase 4 complete

With Papua, all 514 kabupaten/kota in Indonesia are computed at kabupaten and kecamatan level.

Runs: 2026-10-10, 08:17–14:27 UTC (`uv run python -m all --level kabupaten|kecamatan [--layer nightlights]
--prov 91 … --prov 96`), followed by a second pass that found every area up to date; Papua Barat Daya night lights
re-run at 14:31 after the noise-floor change below.

## Outcome

- **42 kabupaten/kota and 788 kecamatan in six provinces, all three layers: no failed terrain or land cover checks,
  no errors, no skipped names.**
- **Provinsi 96 (Papua Barat Daya) is computed for the first time.** BIG has no province-96 archive; its desa are in
  the province-92 archive under pre-2022 regency codes and are mapped by `config/big_code_remap.yaml` (commit
  16e924fd; checked desa by desa, see [the crosswalk doc](peta-wilayah-crosswalk.md)). Provinsi 92 is built without
  those features, so no stale 92xx codes are produced.
- **Night lights: 65 of 830 areas have a year left out**, each recorded with its reason in `years_skipped`:
  - 73 area-years **too cloudy** (more than 1% of the area with no cloud-free night): 62 in 2024 and 11 in 2023,
    almost all in the Papua Tengah (2 kabupaten, 21 kecamatan) and Papua Pegunungan (1 kabupaten, 37 kecamatan)
    highlands, plus 2 kecamatan in Teluk Wondama (92).
  - 2 area-years **below the noise floor**: Sorong (9601) and kec. Botain (960154), 2024. One pixel's only
    cloud-free night of 2024 (May) read −0,51 nW (floor −0,5), so its "annual median" was a single noisy reading.
    The 2023 annual raster for 96 has no negative pixel at all (minimum +0,09 nW). Until now a value below the floor
    failed the whole area; it now leaves that year out for that area, like a cloudy year
    (`nightlights/compute.py`; documented in [the layers doc](peta-wilayah-new-layers.md)). This changes no config,
    so no other area was recomputed; no other area in the country had triggered it.
  - Where 2024 is left out, the 2018 → 2024 growth is not reported (`growth.note` says why); no other year is
    substituted.
- **Provenance repair before export.** The export refused to run: the 2024 annual rasters for 92, 94 and 95 used
  source windows missing from `sources.json`. Those three rasters were built at 09:51–09:58 UTC, out of this run's
  order, by another process reading 2024 night lights at the same time; this run then saved `sources.json` over
  that process's records and later reused the rasters from the cache. They were rebuilt with `annual.ensure(…,
  force=True)` once nothing else was running: all three are **byte-identical** (sha256 `e53f5706e558…`,
  `837bff0269b1…`, `12913e9793c3…`), so no area value changed, and all 266 annual rasters in the country now have
  every source window recorded. Only one process at a time may write `sources.json`.
- Backend export loaded with `load_peta`.

## Validation

| Check | 91 Papua | 92 Papua Barat | 93 Papua Selatan | 94 Papua Tengah | 95 Papua Pegunungan | 96 Papua Barat Daya |
|---|---|---|---|---|---|---|
| Kabupaten / kecamatan | 9 / 105 | 7 / 86 | 4 / 82 | 8 / 131 | 8 / 252 | 6 / 132 |
| Kecamatan named from village records | 1 | 0 | 2 | 1 | 0 | 24 |
| UTM vs geodesic / pixel vs UTM (max) | 0,20% / 0,10% | 0,18% / 0,05% | 0,19% / 0,02% | 0,19% / 0,13% | 0,19% / 0,18% | 0,20% / 0,19% |
| Smallest kecamatan | Anotaurei 2,5 km² | Manokwari Timur 21,0 km² | Akat 95,6 km² | Pagaleme 12,2 km² | Tiomneri 2,5 km² | Sorong 3,5 km² |
| Kabupaten sum vs province polygon | 80.953,9 km², 0.000% | 59.518,3 km², 0.000% | 117.052,3 km², 0.000% | 60.728,3 km², 0.000% | 52.203,7 km², 0.000% | 39.122,9 km², 0.000% |
| Max/min nesting | 9 of 9 | 7 of 7 | 4 of 4 | 8 of 8 | 8 of 8 | 6 of 6 |
| Kecamatan area sum; land cover weighted | 0,009%; 0,006 pt | 0,005%; 0,006 pt | 0,001%; 0,024 pt | 0,006%; 0,008 pt | 0,008%; 0,006 pt | 0,049%; 0,023 pt |

DEM and land cover nodata 0% everywhere; land cover shares 99,98–100,02%; palette exact.

**Peaks.**

| Peak | Published | Our maximum | Difference |
|---|---|---|---|
| Puncak Jaya / Carstensz Pyramid (Mimika–Puncak border; highest in Indonesia) | 4.884 m | Mimika 4.804 m at 137.185°E 4.083°S | −80 m. A sheer limestone pyramid that a 30 m pixel cannot hold, like Daik (−52 m) and Raung (about −70 m) |
| Puncak Trikora (Jayawijaya) | 4.750 m (Indonesian sources), 4.730 m (English sources) | Jayawijaya 4.715 m at 138.682°E 4.262°S | −15 to −35 m |
| Puncak Mandala (Pegunungan Bintang) | 4.760 m (Indonesian sources), 4.640 m (English sources) | Pegunungan Bintang 4.699 m at 140.290°E 4.708°S | between the two published figures |

Puncak (kabupaten) reads 4.795 m at 137.181°E 4.062°S, 2,4 km north of the Carstensz point, and Paniai 4.711 m at
137.061°E 4.039°S. This report does not assign names to those summits.

Sources: [Wikipedia (Puncak Jaya)](https://en.wikipedia.org/wiki/Puncak_Jaya),
[Summitpost (Carstensz)](https://www.summitpost.org/show/mountain_link.pl/mountain_id/132),
[Good News From Indonesia](https://www.goodnewsfromindonesia.id/2025/10/10/daftar-puncak-tertinggi-di-indonesia),
[RRI Biak](https://rri.co.id/biak/hobi/1895298/tiga-gunung-tertinggi-di-indonesia-ada-di-papua),
[Orami](https://www.orami.co.id/magazine/gunung-tertinggi-di-indonesia).

## Findings

- **The highest terrain in the country.** Lanny Jaya (mean 2.899 m) and Jayawijaya (2.495 m) are the two highest of
  all 514 kabupaten/kota; 7 of 8
  Papua Pegunungan kabupaten are *Pegunungan*, as are 6 of 8 in Papua Tengah. Kecamatan in Papua Pegunungan: 223 of
  252 *Pegunungan*. Intan Jaya is 75,8% *bergunung* by local relief.
- **Papua Selatan is all lowland.** All 4 kabupaten and 79 of 82 kecamatan are *Dataran rendah*. Merauke is 37,6%
  under 10 m; its herbaceous-wetland share (15,3%) is the second-highest of all 514 kabupaten/kota, after
  Hulu Sungai Utara (17,7%, Kalimantan Selatan); Mappi is fourth (11,7%).
- **Forest everywhere.** Tree cover is 72–99% in every kabupaten; built-up land is at most 8,0% (Kota Sorong).
- **The darkest region.** Outside Kota Sorong (26,2% → 41,0% lit) and Kota Jayapura (10,9% → 15,4%, a large kota
  that includes forest), every kabupaten is under 5% lit in 2024, and most highland kabupaten under 0,1%. Growth
  ratios such as Maybrat ×17 come from bases under 1 km² and are not headline-worthy (the UI shows "dari <1 km²").

| Kode | Nama | Kelas medan | Rata-rata (m) | Maks (m) | Bergunung | Tutupan pohon | Lahan basah | Bercahaya 2018 → 2024 |
|---|---|---|---|---|---|---|---|---|
| 9103 | Jayapura | Perbukitan | 310 | 1.997 | 5,5% | 97,4% | 0,0% | 0,5% → 0,7% |
| 9105 | Kepulauan Yapen | Perbukitan | 314 | 1.464 | 31,2% | 97,1% | 0,0% | 0,7% → 1,0% |
| 9106 | Biak Numfor | Dataran | 118 | 729 | 1,0% | 94,6% | 0,0% | 2,3% → 3,0% |
| 9110 | Sarmi | Campuran | 188 | 2.148 | 6,6% | 98,2% | 0,0% | 0,0% → 0,1% |
| 9111 | Keerom | Perbukitan | 334 | 1.768 | 5,6% | 98,6% | 0,0% | 0,2% → 0,5% |
| 9115 | Waropen | Perbukitan | 250 | 1.286 | 5,0% | 95,6% | 0,1% | 0,0% → 0,1% |
| 9119 | Supiori | Perbukitan | 217 | 994 | 11,2% | 91,9% | 0,0% | 0,7% → 0,6% |
| 9120 | Mamberamo Raya | Campuran | 197 | 2.223 | 5,5% | 91,3% | 0,3% | 0,0% → 0,0% |
| 9171 | Kota Jayapura | Perbukitan | 199 | 1.575 | 6,9% | 87,6% | 0,7% | 10,9% → 15,4% |
| 9202 | Manokwari | Perbukitan | 640 | 2.947 | 50,0% | 96,2% | 0,0% | 2,4% → 4,0% |
| 9203 | Fak Fak | Campuran | 221 | 1.488 | 3,6% | 93,7% | 0,1% | 0,1% → 0,2% |
| 9206 | Teluk Bintuni | Dataran | 187 | 2.297 | 5,7% | 83,3% | 0,2% | 0,3% → 0,4% |
| 9207 | Teluk Wondama | Perbukitan | 382 | 2.192 | 18,5% | 97,9% | 0,0% | 0,1% → 0,2% |
| 9208 | Kaimana | Perbukitan | 346 | 1.666 | 18,5% | 94,1% | 0,1% | 0,1% → 0,1% |
| 9211 | Manokwari Selatan | Perbukitan | 533 | 2.265 | 39,4% | 96,7% | 0,0% | 0,4% → 1,1% |
| 9212 | Pegunungan Arfak | Pegunungan | 1.674 | 2.884 | 69,6% | 95,1% | 0,1% | 0,0% → 0,0% |
| 9301 | Merauke | Dataran rendah | 19 | 87 | 0,0% | 67,7% | 15,3% | 0,1% → 0,3% |
| 9302 | Boven Digoel | Dataran rendah | 70 | 704 | 0,0% | 97,0% | 1,0% | 0,1% → 0,1% |
| 9303 | Mappi | Dataran rendah | 21 | 75 | 0,0% | 80,7% | 11,7% | 0,0% → 0,1% |
| 9304 | Asmat | Dataran rendah | 23 | 509 | 0,0% | 85,5% | 3,5% | 0,0% → 0,0% |
| 9401 | Nabire | Perbukitan | 469 | 3.744 | 31,0% | 95,0% | 0,4% | 0,3% → 0,9% |
| 9402 | Puncak Jaya | Pegunungan | 1.239 | 3.938 | 59,3% | 97,0% | 0,0% | 0,0% → 0,0% |
| 9403 | Paniai | Pegunungan | 2.096 | 4.711 | 66,9% | 86,7% | 2,3% | 0,0% → — (2024 dilewati) |
| 9404 | Mimika | Dataran rendah | 399 | 4.804 | 19,4% | 78,9% | 0,3% | 0,9% → 1,5% |
| 9405 | Puncak | Pegunungan | 1.987 | 4.795 | 60,2% | 93,2% | 0,9% | 0,0% → 0,0% |
| 9406 | Dogiyai | Pegunungan | 1.404 | 3.663 | 58,9% | 95,5% | 0,8% | 0,0% → 0,1% |
| 9407 | Intan Jaya | Pegunungan | 1.655 | 4.427 | 75,8% | 98,0% | 0,0% | 0,0% → — (2024 dilewati) |
| 9408 | Deiyai | Pegunungan | 1.059 | 3.074 | 56,5% | 93,4% | 0,8% | 0,0% → 0,3% |
| 9501 | Jayawijaya | Pegunungan | 2.495 | 4.715 | 44,4% | 71,8% | 0,9% | 0,6% → 1,0% |
| 9502 | Pegunungan Bintang | Pegunungan | 1.184 | 4.699 | 52,5% | 97,2% | 0,0% | 0,0% → — (2024 dilewati) |
| 9503 | Yahukimo | Pegunungan | 1.359 | 4.526 | 55,8% | 93,0% | 0,0% | 0,0% → 0,0% |
| 9504 | Tolikara | Pegunungan | 1.256 | 3.931 | 66,3% | 96,0% | 0,1% | 0,0% → 0,1% |
| 9505 | Mamberamo Tengah | Pegunungan | 1.080 | 3.769 | 62,9% | 96,1% | 0,1% | 0,0% → 0,0% |
| 9506 | Yalimo | Perbukitan | 1.029 | 3.966 | 54,2% | 97,0% | 0,0% | 0,0% → 0,1% |
| 9507 | Lanny Jaya | Pegunungan | 2.899 | 4.105 | 41,9% | 85,2% | 3,9% | 0,0% → 0,0% |
| 9508 | Nduga | Pegunungan | 1.321 | 4.356 | 53,7% | 94,6% | 0,2% | 0,0% → 0,0% |
| 9601 | Sorong | Dataran rendah | 120 | 975 | 2,7% | 89,6% | 0,0% | 1,4% → — (2024 dilewati) |
| 9602 | Sorong Selatan | Dataran rendah | 58 | 558 | 0,0% | 82,7% | 0,1% | 0,1% → 0,2% |
| 9603 | Raja Ampat | Perbukitan | 157 | 1.179 | 11,8% | 93,4% | 0,1% | 0,1% → 0,3% |
| 9604 | Tambrauw | Pegunungan | 887 | 2.498 | 53,8% | 98,8% | 0,0% | 0,0% → 0,0% |
| 9605 | Maybrat | Perbukitan | 288 | 1.705 | 5,2% | 97,1% | 0,2% | 0,0% → 0,1% |
| 9671 | Kota Sorong | Perbukitan | 92 | 410 | 0,2% | 82,2% | 0,0% | 26,2% → 41,0% |
