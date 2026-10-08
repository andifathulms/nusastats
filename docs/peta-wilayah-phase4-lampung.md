# Peta Wilayah Phase 4: Lampung (all three layers) — first Sumatra province

Runs: 2026-10-08, 16:05–17:05 UTC (`uv run python -m all --level kabupaten|kecamatan [--layer nightlights] --prov 18`).

## Outcome

- **15 kabupaten/kota and 229 kecamatan, all three layers: no failed checks, no errors, no skipped names or
  night-lights years.**
- Only 6 new DEM tiles (3 of 9 were cached from Banten and Java), so tile eviction was not needed.
- Backend export loaded with `load_peta`.

## Validation

| Check | Result |
|---|---|
| UTM vs geodesic / pixel vs UTM area | max 0.08% / 0.38% |
| Smallest kecamatan | **Pulau Pisang** 1,5 km² (an island off the west coast), Tanjungkarang Timur 2,1 km², Enggal 2,8 km²; all pass, Pulau Pisang including night lights |
| Nodata: DEM / land cover / night lights | 0% / 0% / none skipped |
| Land cover shares sum; palette | 99,98–100,02%; exact |
| Kabupaten sum to the province polygon | within 0.000% |
| Kabupaten max/min = highest/lowest kecamatan max/min | exact in 15 of 15 |
| Kecamatan areas sum to the kabupaten; land cover weighted | within 0.016%; within 0.007 point |

**Peaks.**

| Peak | Published | Our maximum | Difference |
|---|---|---|---|
| Pesagi (Lampung Barat) | 2.262 m (some sources 2.249 m) | 2.224 m at 104.147°E 4.923°S | −25 to −38 m |
| Tanggamus | 2.100 m | 2.102 m at 104.675°E 5.427°S | +2 m |

One source gives Pesagi's second summit as "3.221 m". Nothing in Lampung approaches that, so it is ignored as a typo.

Sources: [detik (Pesagi)](https://www.detik.com/sumbagsel/wisata/d-8410485/wisata-gunung-pesagi-atap-provinsi-lampung-punya-dua-jalur-pendakian),
[iNews (Lampung's highest peaks)](https://www.inews.id/regional/lampung/deretan-gunung-tertinggi-di-lampung-ada-yang-punya-2-puncak/all).

## Findings

- **Terrain.** Kabupaten: 9 Dataran rendah, 4 Perbukitan, 2 Dataran. Kecamatan: 130 Dataran rendah, 60 Perbukitan,
  29 Dataran, 6 Campuran, 4 Pegunungan. The Barisan range sits in the west; the east is a broad lowland.
- **Very low land (lower bound).** Tulang Bawang 48,4% and Mesuji 47,8% under 10 m: the eastern swamp coast.
- **Cropland.** Kota Metro 36,6%, Lampung Tengah 32,0%, Tulang Bawang 25,6%. Built-up: Kota Bandar Lampung 48,3%.
- **Night lights.**
  - Darkest: Pesisir Barat 1,2% lit in 2024, Lampung Barat 2,3%.
  - Fastest growth from real bases: Pesisir Barat ×8,2 (4 → 35 km²), Mesuji ×5,3 (43 → 227 km²), Lampung Barat ×3,7,
    Tulang Bawang Barat ×3,5.

| Kode | Nama | Kelas medan | Rata-rata (m) | Maks (m) | Tutupan pohon | Lahan pertanian | Lahan terbangun | < 10 m | Bercahaya 2018 → 2024 |
|---|---|---|---|---|---|---|---|---|---|
| 1801 | Lampung Selatan | Dataran rendah | 80 | 1.280 | 67,5% | 21,4% | 5,6% | 11,5% | 42,3% → 69,7% |
| 1802 | Lampung Tengah | Dataran rendah | 65 | 1.185 | 53,9% | 32,0% | 4,4% | 9,2% | 17,3% → 35,1% |
| 1803 | Lampung Utara | Dataran rendah | 164 | 2.116 | 81,5% | 13,0% | 2,8% | 0,1% | 6,4% → 19,1% |
| 1804 | Lampung Barat | Perbukitan | 881 | 2.224 | 86,1% | 4,2% | 1,3% | 0,0% | 0,6% → 2,3% |
| 1805 | Tulang Bawang | Dataran rendah | 15 | 68 | 49,3% | 25,6% | 1,8% | 48,4% | 5,1% → 13,4% |
| 1806 | Tanggamus | Perbukitan | 447 | 2.102 | 91,3% | 4,3% | 1,7% | 2,6% | 4,5% → 8,5% |
| 1807 | Lampung Timur | Dataran rendah | 34 | 261 | 62,5% | 18,2% | 3,5% | 16,9% | 13,9% → 33,1% |
| 1808 | Way Kanan | Dataran rendah | 138 | 1.700 | 88,9% | 6,3% | 1,4% | 0,3% | 4,3% → 7,4% |
| 1809 | Pesawaran | Perbukitan | 261 | 1.680 | 83,0% | 11,4% | 3,4% | 3,2% | 19,3% → 32,7% |
| 1810 | Pringsewu | Dataran | 184 | 1.046 | 65,6% | 24,3% | 8,0% | 0,0% | 28,5% → 53,0% |
| 1811 | Mesuji | Dataran rendah | 16 | 77 | 69,8% | 16,6% | 1,5% | 47,8% | 2,0% → 10,3% |
| 1812 | Tulang Bawang Barat | Dataran rendah | 32 | 78 | 77,0% | 12,7% | 3,5% | 9,7% | 7,3% → 25,7% |
| 1813 | Pesisir Barat | Perbukitan | 334 | 1.965 | 96,3% | 1,9% | 0,4% | 4,6% | 0,1% → 1,2% |
| 1871 | Kota Bandar Lampung | Dataran | 136 | 546 | 45,0% | 3,3% | 48,3% | 6,9% | 98,3% → 99,1% |
| 1872 | Kota Metro | Dataran rendah | 50 | 72 | 26,5% | 36,6% | 35,4% | 0,0% | 98,9% → 100,0% |
