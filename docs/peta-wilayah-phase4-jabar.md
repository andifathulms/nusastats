# Peta Wilayah Phase 4: Jawa Barat (all three layers)

Runs: 2026-10-08, 05:36–07:23 UTC (`uv run python -m all --level kabupaten|kecamatan [--layer nightlights] --prov 32`).
The first province computed with the *Dataran* class from the start (see `docs/peta-wilayah-rule-dataran.md`).

## Outcome

- **27 kabupaten/kota and 627 kecamatan, all three layers: no failed checks, no errors, no skipped names or
  night-lights years.**
- Backend export: 4,628 areas (304 kabupaten, 4,324 kecamatan), loaded with `load_peta`.

## Validation

| Check | Result |
|---|---|
| UTM vs geodesic / pixel vs UTM area | max 0.19% / 0.29% |
| Smallest kecamatan | Pekalipan 1,6 km² (Kota Cirebon), Astana Anyar 2,6 km², Bojongloa Kaler 3,1 km² (Kota Bandung); all pass |
| Nodata: DEM / land cover / night lights | 0% / 0% / none skipped |
| Land cover shares sum; palette | 99,98–100,02%; exact |
| Kabupaten sum to the province polygon | within 0.000% |
| Kabupaten max/min = highest/lowest kecamatan max/min | exact in 27 of 27 |
| Kecamatan areas sum to the kabupaten; land cover weighted | within 0.06%; within 0.021 point |

**Peaks.**

| Peak | Published | Our maximum | Difference |
|---|---|---|---|
| Ciremai (Majalengka / Kuningan) | 3.078 m | 3.064 m at 108.407°E 6.893°S | −14 m |
| Pangrango (Sukabumi / Cianjur / Bogor) | 3.019 m | 3.020 m at 106.965°E 6.770°S | +1 m |

Source: [Antara (20 highest peaks in Jawa Barat)](https://megapolitan.antaranews.com/berita/535399/daftar-20-gunung-tertinggi-di-jawa-barat),
[Good News From Indonesia (Gede Pangrango)](https://www.goodnewsfromindonesia.id/2022/12/29/7-fakta-menarik-gunung-gede-pangrango).

## Findings

- **Terrain.** Kabupaten: 16 Perbukitan, 9 Dataran rendah, 1 Pegunungan, 1 Dataran (Majalengka, 67,9% flat, mean
  367 m). Kecamatan: 339 Perbukitan, 198 Dataran rendah, 47 Pegunungan, 27 Dataran, and only 16 Campuran. With
  the new class, very few areas still fall through to "mixed".
- **Cropland on the north coast.** Indramayu 66,6% (the highest of any kabupaten so far), Karawang 54,2%, Cirebon
  47,0%.
- **Built-up.** Kota Bandung 78,9%, Kota Bekasi 77,0%, Kota Cimahi 71,6%.
- **Very low land (lower bound).** Indramayu 54,9% under 10 m, Bekasi 51,6%, Karawang 51,4%, Kota Cirebon 49,0%.
- **Night lights.**
  - Least lit: Pangandaran 17,8%, Cianjur 23,3%, Sukabumi 25,6%.
  - Fastest growth: Pangandaran ×2,8 (73 → 201 km²), Ciamis ×2,5, Bandung Barat ×2,0, Sukabumi ×1,9.

| Kode | Nama | Kelas medan | Rata-rata (m) | Maks (m) | Lahan pertanian | Lahan terbangun | < 10 m | Bercahaya 2018 → 2024 |
|---|---|---|---|---|---|---|---|---|
| 3201 | Bogor | Perbukitan | 425 | 3.015 | 8,6% | 13,2% | 0,0% | 58,0% → 75,5% |
| 3202 | Sukabumi | Perbukitan | 474 | 3.020 | 9,2% | 3,4% | 1,9% | 13,4% → 25,6% |
| 3203 | Cianjur | Perbukitan | 596 | 3.015 | 12,3% | 3,7% | 1,8% | 13,4% → 23,3% |
| 3204 | Bandung | Pegunungan | 1.212 | 2.612 | 17,5% | 12,8% | 0,0% | 45,9% → 58,4% |
| 3205 | Garut | Perbukitan | 828 | 2.809 | 12,0% | 4,7% | 1,1% | 15,1% → 25,9% |
| 3206 | Tasikmalaya | Perbukitan | 442 | 2.237 | 9,1% | 3,5% | 1,4% | 16,5% → 28,3% |
| 3207 | Ciamis | Perbukitan | 370 | 1.767 | 14,9% | 5,0% | 3,5% | 19,6% → 49,9% |
| 3208 | Kuningan | Perbukitan | 438 | 3.042 | 15,7% | 7,2% | 0,0% | 36,5% → 56,0% |
| 3209 | Cirebon | Dataran rendah | 43 | 569 | 47,0% | 15,6% | 45,5% | 76,1% → 91,6% |
| 3210 | Majalengka | Dataran | 367 | 3.064 | 40,1% | 8,3% | 0,1% | 34,4% → 62,3% |
| 3211 | Sumedang | Perbukitan | 516 | 1.965 | 13,8% | 6,1% | 0,0% | 19,8% → 37,1% |
| 3212 | Indramayu | Dataran rendah | 15 | 267 | 66,6% | 8,2% | 54,9% | 46,7% → 71,1% |
| 3213 | Subang | Dataran rendah | 194 | 2.208 | 44,5% | 7,4% | 19,9% | 49,9% → 74,4% |
| 3214 | Purwakarta | Perbukitan | 300 | 2.056 | 15,3% | 8,5% | 0,0% | 45,3% → 65,2% |
| 3215 | Karawang | Dataran rendah | 32 | 1.291 | 54,2% | 12,0% | 51,4% | 64,9% → 83,1% |
| 3216 | Bekasi | Dataran rendah | 18 | 133 | 42,8% | 25,1% | 51,6% | 91,3% → 96,6% |
| 3217 | Bandung Barat | Perbukitan | 851 | 2.211 | 10,3% | 9,0% | 0,0% | 31,0% → 60,6% |
| 3218 | Pangandaran | Perbukitan | 168 | 1.017 | 11,6% | 2,0% | 14,2% | 6,5% → 17,8% |
| 3271 | Kota Bogor | Perbukitan | 260 | 514 | 2,4% | 57,7% | 0,0% | 100,0% → 100,0% |
| 3272 | Kota Sukabumi | Perbukitan | 539 | 727 | 23,9% | 43,1% | 0,0% | 100,0% → 100,0% |
| 3273 | Kota Bandung | Perbukitan | 722 | 1.078 | 5,9% | 78,8% | 0,0% | 100,0% → 100,0% |
| 3274 | Kota Cirebon | Dataran rendah | 20 | 139 | 4,0% | 58,3% | 49,0% | 100,0% → 100,0% |
| 3275 | Kota Bekasi | Dataran rendah | 32 | 94 | 1,4% | 77,0% | 3,8% | 100,0% → 100,0% |
| 3276 | Kota Depok | Dataran rendah | 85 | 134 | 1,1% | 66,8% | 0,0% | 100,0% → 100,0% |
| 3277 | Kota Cimahi | Perbukitan | 762 | 1.083 | 2,9% | 71,6% | 0,0% | 100,0% → 100,0% |
| 3278 | Kota Tasikmalaya | Perbukitan | 359 | 496 | 24,6% | 27,4% | 0,0% | 96,5% → 98,6% |
| 3279 | Kota Banjar | Dataran rendah | 53 | 368 | 25,1% | 12,1% | 3,3% | 61,2% → 94,3% |
