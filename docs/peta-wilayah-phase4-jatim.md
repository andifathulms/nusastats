# Peta Wilayah Phase 4: Jawa Timur (all three layers)

Runs: 2026-10-07, 14:27–19:05 UTC (`uv run python -m all --level kabupaten|kecamatan [--layer nightlights] --prov 35`).
The first Java province, and the largest number of kecamatan of any province so far.

## Outcome

- **38 kabupaten/kota and 666 kecamatan, all three layers: no failed checks, no errors, no retries needed, no skipped
  names or night-lights years.**
- Disk barely moved (9,4 → 9,0 GB free).
- Backend export: 3,280 areas (237 kabupaten, 3,043 kecamatan), loaded with `load_peta`.

## Validation

| Check | Result |
|---|---|
| UTM vs geodesic / pixel vs UTM area | max 0.19% / 0.22% (Prajuritkulon, 7,4 km², Kota Mojokerto) |
| Smallest kecamatan | Simokerto 2,6 km², Bubutan 3,9 km², Genteng 4,1 km² (all Kota Surabaya); all pass |
| Nodata: DEM / land cover / night lights | 0% / 0% / none skipped |
| Land cover shares sum; palette | 99,98–100,02%; exact |
| Kabupaten sum to the province polygon | within 0.000% |
| Kabupaten max/min = highest/lowest kecamatan max/min | exact in 38 of 38 |
| Kecamatan areas sum to the kabupaten; land cover weighted | within 0.301%; within 0.033 point |

**Peaks.**

| Peak | Published | Our maximum | Reading |
|---|---|---|---|
| Semeru (Lumajang / Malang) | 3.676 m (commonly cited; the search confirmed it is Java's highest, but did not state the figure) | 3.673 m at 112.922°E 8.108°S | −3 m against the commonly cited figure |
| Arjuno (Pasuruan / Kota Batu) | 3.339 m | 3.332 m at 112.590°E 7.765°S | −7 m |
| **Raung**, Puncak Sejati (Banyuwangi / Bondowoso / Jember) | 3.344 m | **3.274 m** at 114.055°E 8.128°S (all three kabupaten read 3.261–3.274 m there) | **−70 m.** Likely the narrow pinnacle on the caldera rim being averaged down by 30 m pixels; not verified. |

Sources: [gunungbagging.com (Arjuno)](https://www.gunungbagging.com/arjuno/),
[detik (Java's highest peaks)](https://www.detik.com/edu/detikpedia/d-6487034/9-gunung-tertinggi-di-pulau-jawa-semeru-sampai-sindoro),
[Orami (East Java peaks)](https://www.orami.co.id/magazine/gunung-di-jawa-timur).

## Findings

- **A lowland province, unlike the islands done so far.** Kabupaten: 15 Dataran rendah, 12 Campuran,
  10 Perbukitan, 1 Pegunungan. Kecamatan: 345 Dataran rendah, 183 Perbukitan, 116 Campuran, 22 Pegunungan.
- **Cropland dominates the north.** Lamongan 61,2% (the highest of any kabupaten so far), Tuban 42,5%, Jombang 41,8%,
  Bojonegoro 40,8%.
- **Built-up.** Kota Surabaya 59,1%, Kota Malang 57,6%, Kota Mojokerto 55,3%, Kota Madiun 52,3%.
- **Very low land (lower bound).** Kota Surabaya 78,0% under 10 m, Kota Pasuruan 77,7%, Sidoarjo 74,4%, Gresik 43,3%.
- **Night lights: the brightest province so far.**
  - The least-lit kabupaten are still 15–31% lit (Pacitan 14,9%, Trenggalek 28,2%, Bondowoso 31,2%).
  - Growth is strongest where it was darkest: Pacitan ×3,2 (67 → 214 km²), Trenggalek ×2,9, Sumenep ×2,3
    (506 → 1.177 km²), Ngawi ×2,3.

| Kode | Nama | Kelas medan | Rata-rata (m) | Maks (m) | Tutupan pohon | Lahan pertanian | Lahan terbangun | < 10 m | Bercahaya 2018 → 2024 |
|---|---|---|---|---|---|---|---|---|---|
| 3501 | Pacitan | Perbukitan | 409 | 1.237 | 90,0% | 3,3% | 2,1% | 2,1% | 4,7% → 14,9% |
| 3502 | Ponorogo | Perbukitan | 430 | 2.555 | 65,4% | 22,7% | 7,2% | 0,0% | 24,7% → 46,7% |
| 3503 | Trenggalek | Perbukitan | 373 | 1.278 | 86,8% | 7,1% | 4,0% | 1,9% | 9,7% → 28,2% |
| 3504 | Tulungagung | Campuran | 244 | 2.300 | 65,5% | 19,3% | 11,3% | 0,3% | 40,2% → 54,8% |
| 3505 | Blitar | Perbukitan | 316 | 2.858 | 74,5% | 14,6% | 7,9% | 0,4% | 33,3% → 58,4% |
| 3506 | Kediri | Campuran | 262 | 2.351 | 46,5% | 39,2% | 12,0% | 0,0% | 57,7% → 76,7% |
| 3507 | Malang | Perbukitan | 625 | 3.670 | 80,2% | 8,7% | 6,7% | 0,6% | 35,5% → 53,4% |
| 3508 | Lumajang | Perbukitan | 481 | 3.673 | 72,7% | 16,2% | 5,0% | 4,5% | 16,8% → 36,2% |
| 3509 | Jember | Campuran | 344 | 3.260 | 71,0% | 19,3% | 5,6% | 5,1% | 35,0% → 50,8% |
| 3510 | Banyuwangi | Campuran | 329 | 3.274 | 76,0% | 15,1% | 4,5% | 3,8% | 32,0% → 46,1% |
| 3511 | Bondowoso | Perbukitan | 756 | 3.265 | 70,7% | 18,4% | 3,5% | 0,0% | 15,9% → 31,2% |
| 3512 | Situbondo | Campuran | 303 | 2.487 | 67,0% | 22,5% | 3,5% | 9,2% | 18,8% → 31,8% |
| 3513 | Probolinggo | Perbukitan | 577 | 3.082 | 67,6% | 19,9% | 5,3% | 7,3% | 35,2% → 47,4% |
| 3514 | Pasuruan | Campuran | 487 | 3.332 | 54,7% | 22,0% | 10,0% | 10,0% | 58,4% → 73,3% |
| 3515 | Sidoarjo | Dataran rendah | 6 | 43 | 9,7% | 25,8% | 29,1% | 74,4% | 87,1% → 95,9% |
| 3516 | Mojokerto | Campuran | 328 | 3.140 | 47,3% | 34,1% | 13,1% | 0,5% | 76,0% → 83,0% |
| 3517 | Jombang | Dataran rendah | 144 | 2.152 | 43,1% | 41,8% | 12,2% | 0,0% | 63,7% → 76,9% |
| 3518 | Nganjuk | Campuran | 214 | 2.550 | 45,9% | 39,1% | 9,1% | 0,0% | 37,6% → 55,3% |
| 3519 | Madiun | Campuran | 226 | 2.318 | 56,1% | 31,3% | 8,0% | 0,0% | 35,4% → 56,6% |
| 3520 | Magetan | Perbukitan | 422 | 3.255 | 47,0% | 37,4% | 12,4% | 0,0% | 45,2% → 81,6% |
| 3521 | Ngawi | Campuran | 182 | 3.102 | 52,1% | 37,0% | 7,0% | 0,0% | 28,8% → 65,8% |
| 3522 | Bojonegoro | Dataran rendah | 86 | 904 | 43,6% | 40,8% | 5,5% | 1,5% | 28,5% → 58,8% |
| 3523 | Tuban | Dataran rendah | 89 | 515 | 40,2% | 42,5% | 6,3% | 12,6% | 35,5% → 57,6% |
| 3524 | Lamongan | Dataran rendah | 34 | 200 | 23,6% | 61,2% | 7,2% | 35,8% | 47,2% → 75,2% |
| 3525 | Gresik | Dataran rendah | 33 | 649 | 24,0% | 37,1% | 11,6% | 43,3% | 68,3% → 80,3% |
| 3526 | Bangkalan | Dataran rendah | 54 | 278 | 53,6% | 20,8% | 5,4% | 16,1% | 62,8% → 98,7% |
| 3527 | Sampang | Dataran rendah | 66 | 268 | 46,8% | 22,5% | 6,2% | 14,6% | 66,6% → 95,3% |
| 3528 | Pamekasan | Campuran | 101 | 423 | 43,3% | 22,5% | 10,0% | 9,3% | 86,6% → 98,8% |
| 3529 | Sumenep | Dataran rendah | 62 | 466 | 51,0% | 15,0% | 3,9% | 24,1% | 24,3% → 56,5% |
| 3571 | Kota Kediri | Dataran rendah | 90 | 511 | 22,5% | 34,6% | 38,6% | 0,0% | 96,9% → 99,8% |
| 3572 | Kota Blitar | Campuran | 181 | 257 | 26,6% | 25,1% | 46,4% | 0,0% | 100,0% → 100,0% |
| 3573 | Kota Malang | Perbukitan | 473 | 700 | 28,6% | 9,3% | 57,6% | 0,0% | 100,0% → 100,0% |
| 3574 | Kota Probolinggo | Dataran rendah | 22 | 55 | 24,1% | 30,7% | 38,1% | 20,6% | 100,0% → 100,0% |
| 3575 | Kota Pasuruan | Dataran rendah | 6 | 26 | 12,1% | 19,4% | 37,8% | 77,7% | 92,9% → 98,0% |
| 3576 | Kota Mojokerto | Dataran rendah | 23 | 38 | 18,7% | 21,1% | 55,3% | 0,0% | 100,0% → 100,0% |
| 3577 | Kota Madiun | Dataran rendah | 68 | 90 | 15,2% | 28,9% | 52,3% | 0,0% | 100,0% → 100,0% |
| 3578 | Kota Surabaya | Dataran rendah | 8 | 53 | 10,2% | 7,9% | 59,1% | 78,0% | 100,0% → 100,0% |
| 3579 | Kota Batu | Pegunungan | 1.357 | 3.323 | 71,7% | 7,1% | 12,4% | 0,0% | 42,5% → 50,8% |
