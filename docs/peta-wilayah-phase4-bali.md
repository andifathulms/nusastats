# Peta Wilayah Phase 4: Bali (all three layers)

Runs: 2026-10-07, 01:43–04:37 UTC (`uv run python -m all --level kabupaten|kecamatan [--layer nightlights] --prov 51`).
The Mac kept sleeping on battery, so the wall time was long; the computation itself was quick and nothing was lost.

## Outcome

- **9 kabupaten/kota and 57 kecamatan, all three layers: no failed checks, no errors, no skipped names or
  night-lights years.**
- Backend export: 2,112 areas (167 kabupaten, 1,945 kecamatan), loaded with `load_peta`.

## Validation

| Check | Result |
|---|---|
| UTM vs geodesic / pixel vs UTM area | max 0.10% / 0.09% |
| Nodata: DEM / land cover / night lights | 0% / 0% / none skipped |
| Land cover shares sum; palette | 99,98–100,02%; exact |
| Kabupaten sum to the province polygon | within 0.001% |
| Kabupaten max/min = highest/lowest kecamatan max/min | exact in 9 of 9 |
| Kecamatan areas sum to the kabupaten; land cover weighted | within 0.027%; within 0.007 point |
| **Gunung Agung** (published 3.031 m) | Karangasem max **3.019 m** at 115.498°E 8.340°S. −12 m: a bare, sharp crater rim, averaged down by 30 m pixels (like Rantemario). |
| **Gunung Batukaru** (published 2.276 m) | Tabanan max **2.268 m**. −8 m. |

Sources: [bali.com (Agung)](https://bali.com/places/mount-agung/),
[Good News From Indonesia (Batukaru)](https://www.goodnewsfromindonesia.id/2023/02/01/inilah-5-gunung-tertinggi-di-bali-siap-untuk-menaklukkannya).

## Findings

- **Terrain.** Bangli is *Pegunungan* (mean 978 m, the Batur caldera). Badung is *Campuran* (urban south, mountain
  north). Kota Denpasar is *Dataran rendah*. The rest are *Perbukitan*.
- **Land cover.** Kota Denpasar is 59,8% built-up; Badung 20,3% and Gianyar 15,4%. Gianyar has the most cropland
  (22,3%), followed by Badung and Tabanan.
- **Night lights: the brightest province so far.**
  - Kota Denpasar was 100% lit in both 2018 and 2024 (saturated: no room to grow).
  - Gianyar 70 → 87%, Badung 80 → 86%.
  - The biggest change is in the east and north: Bangli 9 → 33%, Karangasem 11 → 30%, Klungkung 29 → 52%,
    Jembrana 13 → 26%.

| Kode | Nama | Kelas medan | Rata-rata (m) | Maks (m) | Tutupan pohon | Lahan pertanian | Lahan terbangun | Bercahaya 2018 → 2024 |
|---|---|---|---|---|---|---|---|---|
| 5101 | Jembrana | Perbukitan | 270 | 1.411 | 88,8% | 7,0% | 2,0% | 12,6% → 26,0% |
| 5102 | Tabanan | Perbukitan | 484 | 2.268 | 76,2% | 15,0% | 5,1% | 19,6% → 36,9% |
| 5103 | Badung | Campuran | 278 | 2.095 | 52,9% | 16,9% | 20,3% | 79,7% → 85,8% |
| 5104 | Gianyar | Perbukitan | 339 | 990 | 59,2% | 22,3% | 15,4% | 70,2% → 87,2% |
| 5105 | Klungkung | Perbukitan | 180 | 623 | 70,9% | 6,9% | 5,8% | 29,2% → 52,3% |
| 5106 | Bangli | Pegunungan | 978 | 2.130 | 77,0% | 4,5% | 4,3% | 9,2% → 32,9% |
| 5107 | Karangasem | Perbukitan | 536 | 3.019 | 81,5% | 6,3% | 3,1% | 11,3% → 30,4% |
| 5108 | Buleleng | Perbukitan | 443 | 2.093 | 86,7% | 5,8% | 3,5% | 17,7% → 30,1% |
| 5171 | Kota Denpasar | Dataran rendah | 26 | 94 | 17,2% | 9,5% | 59,8% | 100,0% → 100,0% |
