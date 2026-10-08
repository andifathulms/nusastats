# Peta Wilayah Phase 4: Banten (all three layers)

Runs: 2026-10-08, 07:29–08:54 UTC (`uv run python -m all --level kabupaten|kecamatan [--layer nightlights] --prov 36`).

## Outcome

- **8 kabupaten/kota and 155 kecamatan, all three layers: no failed checks, no errors, no skipped names or
  night-lights years.**
- Backend export: 4,791 areas (312 kabupaten, 4,479 kecamatan), loaded with `load_peta`.

## Validation

| Check | Result |
|---|---|
| UTM vs geodesic / pixel vs UTM area | max 0.08% / 0.15% |
| Smallest kecamatan | Cilegon 8,2 km², Batuceper 8,5 km², Larangan 8,5 km² |
| Nodata: DEM / land cover / night lights | 0% / 0% / none skipped |
| Land cover shares sum; palette | 99,98–100,02%; exact |
| Kabupaten sum to the province polygon | within 0.000% |
| Kabupaten max/min = highest/lowest kecamatan max/min | exact in 8 of 8 |
| Kecamatan areas sum to the kabupaten; land cover weighted | within 0.061%; within 0.011 point |

**Peaks.**

| Peak | Published | Our maximum | Difference |
|---|---|---|---|
| Karang (Pandeglang / Serang) | 1.768–1.778 m (sources differ) | 1.779 m at 106.049°E 6.268°S | +1 to +11 m |
| Halimun (Lebak, on the Jawa Barat border) | 1.929 m | Lebak 1.917 m | −12 m |

Sources: [Wikipedia (Gunung Karang)](https://en.wikipedia.org/wiki/Gunung_Karang),
[gunungbagging.com (Banten)](https://www.gunungbagging.com/banten/).

## Findings

- **A lowland province.** Six of the eight kabupaten/kota are *Dataran rendah*; Lebak is *Perbukitan*. Kecamatan:
  106 Dataran rendah, 30 Perbukitan, 11 Dataran, 8 Campuran.
- **The Jakarta fringe is built up and fully lit.** Kota Tangerang 71,2% built-up and Kota Tangerang Selatan 67,0%;
  both 100% lit in 2018 and 2024 (saturated). Kab. Tangerang 98,7 → 99,8% lit.
- **Very low land (lower bound).** Kab. Tangerang 41,7% under 10 m, Kab. Serang 26,4%.
- **Night lights grow in the south.** Lebak 9,2 → 21,0% (×2,3) and Pandeglang 11,9 → 21,8% (×1,8).

| Kode | Nama | Kelas medan | Rata-rata (m) | Maks (m) | Tutupan pohon | Lahan pertanian | Lahan terbangun | < 10 m | Bercahaya 2018 → 2024 |
|---|---|---|---|---|---|---|---|---|---|
| 3601 | Pandeglang | Dataran rendah | 123 | 1.779 | 78,9% | 15,5% | 2,3% | 10,7% | 11,9% → 21,8% |
| 3602 | Lebak | Perbukitan | 295 | 1.917 | 86,9% | 8,4% | 2,2% | 2,2% | 9,2% → 21,0% |
| 3603 | Tangerang | Dataran rendah | 19 | 76 | 27,5% | 29,1% | 26,8% | 41,7% | 98,7% → 99,8% |
| 3604 | Serang | Dataran rendah | 100 | 1.780 | 52,2% | 27,6% | 9,0% | 26,4% | 66,3% → 80,1% |
| 3671 | Kota Tangerang | Dataran rendah | 15 | 45 | 17,0% | 2,2% | 71,2% | 19,8% | 100,0% → 100,0% |
| 3672 | Kota Cilegon | Dataran rendah | 53 | 549 | 47,6% | 7,4% | 34,0% | 25,2% | 100,0% → 100,0% |
| 3673 | Kota Serang | Dataran rendah | 45 | 348 | 45,1% | 24,7% | 20,4% | 20,6% | 91,7% → 99,9% |
| 3674 | Kota Tangerang Selatan | Dataran rendah | 43 | 79 | 29,1% | 0,5% | 67,0% | 0,0% | 100,0% → 100,0% |
