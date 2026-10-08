# Peta Wilayah Phase 4: Jawa Tengah (all three layers)

Runs: 2026-10-08, 01:52–03:42 UTC (`uv run python -m all --level kabupaten|kecamatan [--layer nightlights] --prov 33`).

## Outcome

- **35 kabupaten/kota and 576 kecamatan, all three layers: no failed checks, no errors, no skipped names or
  night-lights years.**
- Backend export: 3,974 areas (277 kabupaten, 3,697 kecamatan), loaded with `load_peta`.

## Validation

| Check | Result |
|---|---|
| UTM vs geodesic / pixel vs UTM area | max 0.09% / 0.17% |
| Smallest kecamatan | Serengan 3,1 km² (Kota Surakarta), Pasar Kliwon 4,9 km², Semarang Tengah 5,3 km²; all pass |
| Nodata: DEM / land cover / night lights | 0% / 0% / none skipped |
| Land cover shares sum; palette | 99,98–100,02%; exact |
| Kabupaten sum to the province polygon | within 0.000% |
| Kabupaten max/min = highest/lowest kecamatan max/min | exact in 35 of 35 |
| Kecamatan areas sum to the kabupaten; land cover weighted | within 0.214%; within 0.028 point |

**Peaks: all within 16 m.**

| Peak | Published | Our maximum | Difference |
|---|---|---|---|
| Slamet (Pemalang) | 3.428 m | 3.425 m at 109.220°E 7.239°S | −3 m |
| Sumbing (Temanggung / Wonosobo / Magelang) | 3.371 m | 3.355 m at 110.071°E 7.384°S | −16 m |
| Merbabu (Boyolali) | 3.145 m | 3.137 m at 110.440°E 7.454°S | −8 m |
| Lawu, Hargo Dumilah (summit on the Magetan side, Jawa Timur) | 3.265 m | Magetan 3.255 m / Karanganyar 3.186 m | −10 m |
| Merapi (published 2.930 m) | | Klaten 2.905 m at the same point as Sleman's 2.906 m | **Closes the DIY note:** the Jawa Tengah side is not higher; the summit reads −24 m |

Sources: [detik (7 summit Jawa Tengah)](https://www.detik.com/jateng/wisata/d-8129886/7-summit-jawa-tengah-ini-urutan-gunung-tertinggi-dan-jalur-pendakiannya),
[Wikipedia (Volcanism of Java)](https://en.wikipedia.org/wiki/Volcanism_of_Java).

## Classification issue: flat inland plains labelled *Campuran*

First flagged in DIY; much larger here. **102 of the 129 areas classed *Campuran* in Jawa Tengah are at least 60% flat
(slope < 8°).** They miss *Dataran rendah* only because most of their land is above 100 m. Nine kabupaten/kota:

| Area | Flat (slope < 8°) | Under 100 m |
|---|---|---|
| Kota Surakarta | 99,0% | 53,8% |
| Klaten | 95,3% | 9,5% |
| Sukoharjo | 92,7% | 33,3% |
| Sragen | 90,9% | 43,6% |
| Blora | 86,0% | 49,9% |
| Kota Semarang | 78,6% | 53,5% |
| Brebes | 66,7% | 57,2% |
| Pemalang | 66,3% | 49,6% |
| Kendal | 63,8% | 44,1% |

"Mixed terrain" is wrong for Solo or Klaten. A fix needs a decision because it reclassifies areas already reported:
for example, a *Dataran* class (≥ 60% of the area with slope < 8°, at any elevation), checked before *Campuran*.

## Findings

- **Cropland.** Demak 58,2%, Sragen 41,0%, Sukoharjo 38,9%.
- **Built-up.** Kota Surakarta 84,2%, Kota Magelang 60,7%, Kota Tegal 51,7%.
- **Very low land (lower bound).** Kota Tegal 97,8% under 10 m, Kota Pekalongan 94,4%, Demak 83,2%.
- **Night lights.**
  - Least lit in 2024: Wonosobo 34,3%, Blora 37,7%, Banjarnegara 39,5%.
  - Fastest growth: Kebumen ×4,1 (166 → 682 km²), Purworejo ×3,5, Wonogiri ×3,4, Blora ×3,1.

| Kode | Nama | Kelas medan | Datar (< 8°) | Rata-rata (m) | Maks (m) | Lahan pertanian | Lahan terbangun | Bercahaya 2018 → 2024 |
|---|---|---|---|---|---|---|---|---|
| 3301 | Cilacap | Dataran rendah | 65,5% | 119 | 1.350 | 28,8% | 6,4% | 20,7% → 43,4% |
| 3302 | Banyumas | Campuran | 52,3% | 266 | 3.106 | 18,2% | 9,3% | 35,4% → 61,5% |
| 3303 | Purbalingga | Campuran | 56,8% | 366 | 3.127 | 17,3% | 7,2% | 21,8% → 56,5% |
| 3304 | Banjarnegara | Perbukitan | 33,5% | 652 | 2.384 | 10,8% | 5,2% | 15,4% → 39,5% |
| 3305 | Kebumen | Dataran rendah | 60,8% | 94 | 1.026 | 27,8% | 5,7% | 12,5% → 51,1% |
| 3306 | Purworejo | Campuran | 55,8% | 175 | 1.068 | 24,8% | 3,8% | 12,1% → 42,2% |
| 3307 | Wonosobo | Perbukitan | 31,4% | 866 | 3.328 | 8,2% | 5,6% | 12,9% → 34,3% |
| 3308 | Magelang | Perbukitan | 58,0% | 655 | 3.323 | 14,1% | 9,2% | 34,5% → 71,8% |
| 3309 | Boyolali | Perbukitan | 75,3% | 423 | 3.137 | 17,9% | 10,5% | 55,3% → 77,0% |
| 3310 | Klaten | Campuran | 95,3% | 231 | 2.905 | 35,3% | 19,6% | 93,6% → 98,5% |
| 3311 | Sukoharjo | Campuran | 92,7% | 121 | 664 | 38,9% | 22,9% | 97,2% → 100,0% |
| 3312 | Wonogiri | Perbukitan | 50,9% | 361 | 2.024 | 15,9% | 5,4% | 16,4% → 55,5% |
| 3313 | Karanganyar | Perbukitan | 60,8% | 513 | 3.186 | 18,5% | 13,5% | 66,3% → 92,6% |
| 3314 | Sragen | Campuran | 90,9% | 116 | 497 | 41,0% | 12,3% | 74,2% → 87,8% |
| 3315 | Grobogan | Dataran rendah | 86,5% | 70 | 529 | 38,7% | 7,8% | 33,8% → 59,4% |
| 3316 | Blora | Campuran | 86,0% | 112 | 455 | 31,6% | 5,3% | 12,2% → 37,7% |
| 3317 | Rembang | Dataran rendah | 79,7% | 94 | 802 | 31,8% | 6,2% | 31,9% → 64,0% |
| 3318 | Pati | Dataran rendah | 82,9% | 94 | 1.540 | 37,4% | 8,3% | 49,0% → 79,8% |
| 3319 | Kudus | Dataran rendah | 79,4% | 133 | 1.586 | 35,8% | 16,5% | 72,5% → 93,4% |
| 3320 | Jepara | Dataran rendah | 71,7% | 151 | 1.594 | 19,1% | 8,4% | 54,9% → 76,8% |
| 3321 | Demak | Dataran rendah | 98,6% | 9 | 233 | 58,2% | 11,1% | 66,9% → 87,0% |
| 3322 | Semarang | Perbukitan | 54,6% | 561 | 3.098 | 14,4% | 9,3% | 54,8% → 82,3% |
| 3323 | Temanggung | Perbukitan | 41,6% | 848 | 3.355 | 18,8% | 7,7% | 20,2% → 49,1% |
| 3324 | Kendal | Campuran | 63,8% | 289 | 2.594 | 20,6% | 8,9% | 41,7% → 62,2% |
| 3325 | Batang | Perbukitan | 55,8% | 469 | 2.560 | 11,4% | 7,3% | 39,6% → 69,7% |
| 3326 | Pekalongan | Perbukitan | 49,1% | 403 | 2.170 | 16,8% | 7,5% | 40,1% → 48,6% |
| 3327 | Pemalang | Campuran | 66,2% | 305 | 3.425 | 27,0% | 8,7% | 34,2% → 56,2% |
| 3328 | Tegal | Dataran rendah | 74,1% | 260 | 3.108 | 33,5% | 12,3% | 58,4% → 81,2% |
| 3329 | Brebes | Campuran | 66,7% | 222 | 2.758 | 34,4% | 8,2% | 40,9% → 56,7% |
| 3371 | Kota Magelang | Perbukitan | 85,1% | 367 | 510 | 3,9% | 60,7% | 100,0% → 100,0% |
| 3372 | Kota Surakarta | Campuran | 99,0% | 101 | 135 | 0,7% | 84,2% | 100,0% → 100,0% |
| 3373 | Kota Salatiga | Perbukitan | 85,6% | 624 | 824 | 7,3% | 32,9% | 100,0% → 100,0% |
| 3374 | Kota Semarang | Campuran | 78,6% | 114 | 443 | 4,9% | 41,0% | 98,4% → 100,0% |
| 3375 | Kota Pekalongan | Dataran rendah | 99,7% | 5 | 21 | 15,2% | 49,9% | 99,9% → 100,0% |
| 3376 | Kota Tegal | Dataran rendah | 99,9% | 4 | 23 | 8,2% | 51,7% | 100,0% → 100,0% |
