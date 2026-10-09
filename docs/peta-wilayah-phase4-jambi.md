# Peta Wilayah Phase 4: Jambi (all three layers)

Runs: 2026-10-09, 04:53–06:01 UTC (`uv run python -m all --level kabupaten|kecamatan [--layer nightlights] --prov 15`),
followed by a second pass that found every area up to date.

## Outcome

- **11 kabupaten/kota and 144 kecamatan, all three layers: no failed checks, no errors, no skipped names or
  night-lights years.**
- Backend export loaded with `load_peta`.

## Validation

| Check | Result |
|---|---|
| UTM vs geodesic / pixel vs UTM area | max 0.20% / 0.40% (Pasar Jambi, 1,7 km²; next highest 0.10%) |
| Smallest kecamatan | Pasar Jambi 1,7 km², Koto Baru 1,9 km² (Kota Sungai Penuh); all pass |
| Nodata: DEM / land cover / night lights | 0% / 0% / none skipped |
| Land cover shares sum; palette | 99,98–100,01%; exact |
| Kabupaten sum to the province polygon | 49.026,5 km², within 0.000% |
| Kabupaten max/min = highest/lowest kecamatan max/min | exact in 11 of 11 |
| Kecamatan areas sum to the kabupaten; land cover weighted | within 0.059%; within 0.020 point |

**Peaks.**

| Peak | Published | Our maximum | Difference |
|---|---|---|---|
| Kerinci (Kerinci / Solok Selatan border; highest in Sumatra, active volcano) | 3.805 m | Kerinci 3.775 m at 101.264°E 1.698°S | −30 m; recheck the Solok Selatan side when Sumatera Barat runs |

A 30 m shortfall on a sharp volcanic summit is in line with earlier ones (Raung about −70 m, Patah −12 m): a 30 m DEM
pixel averages the summit with the slopes around it.

Sources: [Detik (Gunung Kerinci)](https://www.detik.com/sumbagsel/wisata/d-6765375/catatan-perjalanan-menapaki-gunung-kerinci-gunung-tertinggi-di-sumatera/amp),
[Antara Bengkulu](https://bengkulu.antaranews.com/berita/354657/5-puncak-gunung-api-tertinggi-di-indonesia-yang-perlu-didaki-nomor-3-terdekat-dengan-bengkulu?page=2).

## Findings

- **Terrain.** Kerinci (mean 1.244 m, 35,6% *bergunung*) and Kota Sungai Penuh (52,0% *bergunung*) are *Pegunungan*;
  Merangin is *Perbukitan*, Bungo *Campuran*, and the other seven *Dataran rendah*. Kecamatan: 86 Dataran rendah,
  23 Perbukitan, 20 Pegunungan, 8 Campuran, 7 Dataran.
- **Very low east coast.** Under 10 m: Tanjung Jabung Timur 63,2%, Tanjung Jabung Barat 33,4%, Muaro Jambi 25,2%.
- **Tree cover 79–96% outside the cities**, which includes rubber and oil palm (WorldCover does not separate them).
  Kota Jambi is 38,7% built-up.
- **Night lights.** Kota Jambi 96,5% → 98,8% lit. Growth: Kerinci ×4,5 (30 km² lit in 2018), Tebo ×3,8, Bungo ×3,1,
  Merangin and Batanghari ×2,7. Tanjung Jabung Timur barely changed (×1,2).

| Kode | Nama | Kelas medan | Rata-rata (m) | Maks (m) | <10 m | Bergunung | Tutupan pohon | Lahan terbangun | Bercahaya 2018 → 2024 |
|---|---|---|---|---|---|---|---|---|---|
| 1501 | Kerinci | Pegunungan | 1.244 | 3.775 | 0,0% | 35,6% | 80,8% | 0,7% | 0,9% → 3,9% |
| 1502 | Merangin | Perbukitan | 531 | 2.934 | 0,0% | 15,0% | 94,4% | 0,5% | 0,6% → 1,8% |
| 1503 | Sarolangun | Dataran rendah | 165 | 2.130 | 0,0% | 5,9% | 95,5% | 0,4% | 1,7% → 2,8% |
| 1504 | Batanghari | Dataran rendah | 55 | 469 | 0,8% | 0,0% | 95,6% | 0,3% | 1,5% → 4,1% |
| 1505 | Muaro Jambi | Dataran rendah | 24 | 146 | 25,2% | 0,0% | 84,8% | 0,8% | 6,9% → 11,5% |
| 1506 | Tanjung Jabung Barat | Dataran rendah | 46 | 725 | 33,4% | 0,1% | 92,0% | 0,5% | 6,1% → 9,9% |
| 1507 | Tanjung Jabung Timur | Dataran rendah | 11 | 105 | 63,2% | 0,0% | 78,7% | 0,3% | 2,1% → 2,6% |
| 1508 | Bungo | Campuran | 270 | 2.642 | 0,0% | 8,2% | 95,7% | 0,7% | 1,8% → 5,7% |
| 1509 | Tebo | Dataran rendah | 93 | 815 | 0,0% | 0,6% | 95,0% | 0,4% | 0,7% → 2,8% |
| 1571 | Kota Jambi | Dataran rendah | 23 | 72 | 18,5% | 0,0% | 49,1% | 38,7% | 96,5% → 98,8% |
| 1572 | Kota Sungai Penuh | Pegunungan | 1.157 | 2.258 | 0,0% | 52,0% | 76,6% | 2,2% | 12,9% → 14,9% |
