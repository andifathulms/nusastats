# Peta Wilayah Phase 4: Nusa Tenggara Barat and Nusa Tenggara Timur (all three layers)

Runs: 2026-10-07 (`uv run python -m all --level kabupaten|kecamatan [--layer nightlights] --prov 52 --prov 53`).

## Outcome

- **NTB (52): 10 kabupaten/kota, 117 kecamatan. NTT (53): 22 kabupaten/kota, 315 kecamatan. All three layers: no
  failed checks, no errors, no skipped names or night-lights years.**
- The previous Claude session ended while NTB's night-lights data was being read. Nothing was lost; the run resumed
  with all finished outputs and NTT's cached annual rasters intact.
- Backend export: 2,576 areas (199 kabupaten, 2,377 kecamatan), loaded with `load_peta`.

## Validation

| Check | NTB | NTT |
|---|---|---|
| UTM vs geodesic / pixel vs UTM area | 0.08% / 0.18% | 0.19% / 0.19% |
| Nodata: DEM / land cover / night lights | 0 / 0 / none skipped | 0 / 0 / none skipped |
| Kabupaten sum to the province polygon | +0.000% | −0.000% |
| Max/min nest, kabupaten ↔ kecamatan | 10 of 10 | 22 of 22 |
| Kecamatan areas / land cover weighted | 0.166% / 0.008 pt | 0.018% / 0.007 pt |
| Smallest kecamatan | Rasanae Barat 7,6 km² | Kota Lama 3,0 km² (Kupang) |

**Peaks.**

| Peak | Published | Our maximum | Reading |
|---|---|---|---|
| Rinjani (Lombok Timur) | 3.726 m | 3.705 m at 116.458°E 8.412°S | −21 m, a sharp summit. Plausible. |
| Mutis (Timor Tengah Utara / Selatan) | 2.427 m | 2.409 m at 124.228°E 9.561°S | −18 m. Plausible. |
| **Tambora** (Bima / Dompu) | 2.850–2.851 m | **2.711 m** at 117.958°E 8.247°S (rim) | **−140 m, unresolved.** A narrow caldera rim loses some height at 30 m, but not this much. The published figure is quoted everywhere, but we found no record of when or how it was measured. Recorded as open, like Soputan (+125 m, opposite sign). |

Sources: [detik (Rinjani)](https://www.detik.com/bali/nusra/d-7994319/10-fakta-menarik-gunung-rinjani-gunung-api-aktif-tertinggi-kedua-di-indonesia),
[detik (Mutis)](https://www.detik.com/bali/wisata/d-7781388/pesona-gunung-mutis-destinasi-alam-eksotis-di-pulau-timor-ntt),
[Good News From Indonesia (Tambora)](https://www.goodnewsfromindonesia.id/2018/09/24/setelah-2-abad-meletus-seperti-apa-tambora-sekarang).

## Findings

- **Terrain.** Kabupaten: NTB 8 Perbukitan, 1 Campuran, 1 Dataran rendah; NTT 17 Perbukitan, 3 Campuran,
  2 Dataran rendah. NTT has 23 *Pegunungan* kecamatan.
- **Savanna.** Grassland plus shrubland is about 58% in Sumba Timur, Belu and Sabu Raijua, and 48% in Sumba Tengah.
  Land cover distinguishes these dry islands from the forested provinces done so far. Kota Mataram has the least tree
  cover (21%), then Kota Kupang (32%).
- **Night lights.**
  - Kota Mataram is 100% lit and Kota Kupang 86,7%.
  - Lombok Tengah is 54,4% lit, the highest share for a non-city kabupaten so far (the airport and Mandalika area).
  - Fastest growth from real bases: Malaka ×6,9 (5 → 35 km²), Sabu Raijua ×6,4, Manggarai Timur ×3,5, Sumba Barat
    Daya ×3,4.
  - Darkest: Sumba Tengah 0,34% lit.

## NTB

| Kode | Nama | Kelas medan | Rata-rata (m) | Maks (m) | Tutupan pohon | Rumput + semak | Lahan terbangun | Bercahaya 2018 → 2024 |
|---|---|---|---|---|---|---|---|---|
| 5201 | Lombok Barat | Perbukitan | 226 | 1.978 | 76,4% | 7,9% | 4,3% | 28,6% → 35,2% |
| 5202 | Lombok Tengah | Campuran | 278 | 2.933 | 51,6% | 8,8% | 5,2% | 38,2% → 54,4% |
| 5203 | Lombok Timur | Perbukitan | 559 | 3.705 | 58,4% | 13,7% | 5,5% | 18,9% → 39,8% |
| 5204 | Sumbawa | Perbukitan | 315 | 1.870 | 70,0% | 14,7% | 0,6% | 1,6% → 3,8% |
| 5205 | Dompu | Perbukitan | 332 | 2.639 | 54,6% | 31,3% | 0,8% | 1,3% → 4,1% |
| 5206 | Bima | Perbukitan | 393 | 2.711 | 57,4% | 31,1% | 0,8% | 1,2% → 3,6% |
| 5207 | Sumbawa Barat | Perbukitan | 291 | 1.120 | 86,3% | 4,2% | 0,8% | 6,1% → 14,2% |
| 5208 | Lombok Utara | Perbukitan | 544 | 2.903 | 81,2% | 8,9% | 2,4% | 5,7% → 13,9% |
| 5271 | Kota Mataram | Dataran rendah | 19 | 70 | 21,0% | 6,5% | 54,8% | 100,0% → 100,0% |
| 5272 | Kota Bima | Perbukitan | 228 | 1.172 | 53,7% | 30,9% | 5,7% | 17,9% → 32,0% |

## NTT

| Kode | Nama | Kelas medan | Rata-rata (m) | Maks (m) | Tutupan pohon | Rumput + semak | Lahan terbangun | Bercahaya 2018 → 2024 |
|---|---|---|---|---|---|---|---|---|
| 5301 | Kupang | Perbukitan | 294 | 1.772 | 70,6% | 24,9% | 0,4% | 1,1% → 3,3% |
| 5302 | Timor Tengah Selatan | Perbukitan | 528 | 2.404 | 69,9% | 27,2% | 0,5% | 0,5% → 1,2% |
| 5303 | Timor Tengah Utara | Perbukitan | 432 | 2.409 | 63,1% | 33,5% | 0,7% | 0,7% → 1,5% |
| 5304 | Belu | Perbukitan | 482 | 1.576 | 36,4% | 58,0% | 1,4% | 2,7% → 4,3% |
| 5305 | Alor | Perbukitan | 463 | 1.824 | 80,5% | 18,1% | 0,5% | 0,3% → 0,9% |
| 5306 | Flores Timur | Perbukitan | 290 | 1.704 | 85,3% | 12,5% | 1,1% | 0,7% → 1,6% |
| 5307 | Sikka | Perbukitan | 388 | 1.684 | 89,2% | 8,6% | 1,0% | 1,6% → 3,2% |
| 5308 | Ende | Perbukitan | 485 | 1.739 | 91,2% | 6,8% | 0,7% | 0,9% → 1,6% |
| 5309 | Ngada | Perbukitan | 647 | 2.202 | 75,1% | 22,3% | 0,7% | 0,3% → 0,8% |
| 5310 | Manggarai | Perbukitan | 636 | 2.353 | 88,6% | 7,6% | 1,0% | 1,5% → 2,9% |
| 5311 | Sumba Timur | Perbukitan | 339 | 1.224 | 39,9% | 58,0% | 0,2% | 0,4% → 0,8% |
| 5312 | Sumba Barat | Perbukitan | 274 | 812 | 70,1% | 24,8% | 0,6% | 1,0% → 3,1% |
| 5313 | Lembata | Perbukitan | 291 | 1.618 | 74,3% | 22,9% | 1,0% | 0,8% → 2,0% |
| 5314 | Rote Ndao | Dataran rendah | 84 | 452 | 61,8% | 29,6% | 0,5% | 0,7% → 2,2% |
| 5315 | Manggarai Barat | Perbukitan | 328 | 1.981 | 79,0% | 17,0% | 0,4% | 0,7% → 1,4% |
| 5316 | Nagekeo | Perbukitan | 375 | 2.119 | 69,3% | 25,8% | 0,7% | 0,6% → 1,7% |
| 5317 | Sumba Tengah | Perbukitan | 345 | 914 | 50,4% | 47,6% | 0,1% | 0,0% → 0,3% |
| 5318 | Sumba Barat Daya | Campuran | 232 | 900 | 77,4% | 20,7% | 0,6% | 0,7% → 2,3% |
| 5319 | Manggarai Timur | Perbukitan | 595 | 2.284 | 89,7% | 8,5% | 0,3% | 0,1% → 0,5% |
| 5320 | Sabu Raijua | Dataran rendah | 91 | 350 | 38,1% | 57,6% | 0,5% | 0,7% → 4,7% |
| 5321 | Malaka | Campuran | 209 | 956 | 60,4% | 29,0% | 1,1% | 0,5% → 3,1% |
| 5371 | Kota Kupang | Campuran | 168 | 478 | 31,8% | 38,6% | 27,3% | 66,4% → 86,7% |
