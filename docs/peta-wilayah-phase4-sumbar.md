# Peta Wilayah Phase 4: Sumatera Barat (all three layers)

Runs: 2026-10-09, 06:10–07:20 UTC (`uv run python -m all --level kabupaten|kecamatan [--layer nightlights] --prov 13`),
followed by a second pass that found every area up to date.

## Outcome

- **19 kabupaten/kota and 179 kecamatan, all three layers: no failed checks, no errors, no skipped names.**
- **One night-lights year dropped:** Sungai Pua (130612, Agam; 41 km²) has no 2024 value because 5,68% of its area
  had no cloud-free night that year (limit 1,0%). Its 2018–2023 values stand; the skip is recorded in its
  `nightlights.json` (`years_skipped`).
- Backend export loaded with `load_peta`.

## Validation

| Check | Result |
|---|---|
| UTM vs geodesic / pixel vs UTM area | max 0.16% / 0.33% |
| Smallest kecamatan | Padang Barat and Aur Birugo Tigo Baleh 5,4 km²; all pass |
| Nodata: DEM / land cover | 0% / 0% |
| Land cover shares sum; palette | 99,98–100,02%; exact |
| Kabupaten sum to the province polygon | 42.086,5 km², within 0.000% |
| Kabupaten max/min = highest/lowest kecamatan max/min | exact in 19 of 19 |
| Kecamatan areas sum to the kabupaten; land cover weighted | within 0.154%; within 0.025 point |

**Peaks.**

| Peak | Published | Our maximum | Difference |
|---|---|---|---|
| Kerinci (Solok Selatan side) | 3.805 m | Solok Selatan 3.754 m at 101.264°E 1.697°S | the Jambi side (Kerinci, 3.775 m) is the DEM summit, so the −30 m in the [Jambi report](peta-wilayah-phase4-jambi.md) stands |
| Talamau (Pasaman Barat) | 2.912–2.919 m (sources differ) | Pasaman Barat 2.900 m at 99.984°E 0.079°N | −12 to −19 m |
| Marapi (Agam / Tanah Datar; active volcano) | 2.891 m | Agam 2.892 m at 100.473°E 0.380°S | +1 m |
| Singgalang (Agam / Tanah Datar) | 2.877 m | kec. IV Koto (Agam) 2.873 m at 100.331°E 0.390°S | −4 m |
| Talang (Solok; active volcano) | 2.597 m | kec. Gunung Talang 2.587 m at 100.682°E 0.979°S | −10 m |

Sources: [Good News From Indonesia](https://www.goodnewsfromindonesia.id/2025/10/08/daftar-gunung-tertinggi-di-sumatra),
[Popmama](https://www.popmama.com/life/health/gunung-tertinggi-di-sumatera-barat-00-h1fg6-vbzm5w),
[Antara (Talamau 2.913 m)](https://megapolitan.antaranews.com/berita/124992/alami-hipotermia-dua-orang-pendaki-gunung-talamau-berhasil-dievakuasi),
[Republika 2012 (Talang)](https://news.republika.co.id/berita/lxsill/25-gunung-api-di-indonesia-tak-normal).

## Findings

- **The hilliest province so far.** 15 of 19 kabupaten/kota are *Perbukitan*; Solok is *Pegunungan* (mean 980 m,
  42,7% *bergunung*). Only Kota Pariaman is *Dataran rendah*. Kecamatan: 110 Perbukitan, 33 Dataran rendah,
  22 Pegunungan, 11 Campuran, 3 Dataran. Kota Padang is 45,7% *bergunung*: the city's eastern half rises into the
  Bukit Barisan up to 1.885 m.
- **Lowland is coastal and narrow:** under 10 m, Kota Pariaman 44,2%, Pesisir Selatan 15,4%, Pasaman Barat 14,0%,
  Kota Padang 13,8%.
- **Land cover.** Kota Bukittinggi is 41,4% built-up; cropland is highest in Kota Payakumbuh (28,2%) and Kota Pariaman
  (20,4%). Kepulauan Mentawai is 95,4% tree cover.
- **Night lights.** Kota Payakumbuh 72,7% → 98,0% lit. Growth: Pasaman Barat ×5,6, Lima Puluh Kota ×4,6,
  Solok Selatan ×4,4, Tanah Datar ×3,9 (4,1% → 16,2%). Kepulauan Mentawai stays almost dark (0,2% lit in 2024).

| Kode | Nama | Kelas medan | Rata-rata (m) | Maks (m) | <10 m | Bergunung | Tutupan pohon | Lahan terbangun | Bercahaya 2018 → 2024 |
|---|---|---|---|---|---|---|---|---|---|
| 1301 | Pesisir Selatan | Perbukitan | 518 | 2.679 | 15,4% | 34,7% | 94,6% | 0,6% | 0,9% → 3,0% |
| 1302 | Solok | Pegunungan | 980 | 2.686 | 0,0% | 42,7% | 86,5% | 1,0% | 1,7% → 5,7% |
| 1303 | Sijunjung | Perbukitan | 371 | 1.893 | 0,0% | 22,2% | 96,3% | 0,5% | 1,8% → 3,5% |
| 1304 | Tanah Datar | Perbukitan | 756 | 2.874 | 0,0% | 24,2% | 79,8% | 1,9% | 4,1% → 16,2% |
| 1305 | Padang Pariaman | Perbukitan | 240 | 2.303 | 9,2% | 15,9% | 85,0% | 2,1% | 10,3% → 26,0% |
| 1306 | Agam | Perbukitan | 610 | 2.892 | 8,6% | 20,0% | 81,9% | 1,7% | 6,2% → 14,1% |
| 1307 | Lima Puluh Kota | Perbukitan | 613 | 2.273 | 0,0% | 32,8% | 90,3% | 0,7% | 1,7% → 7,7% |
| 1308 | Pasaman | Perbukitan | 725 | 2.715 | 0,0% | 43,4% | 92,5% | 0,4% | 0,3% → 1,2% |
| 1309 | Kepulauan Mentawai | Perbukitan | 75 | 390 | 7,0% | 0,0% | 95,4% | 0,1% | 0,1% → 0,2% |
| 1310 | Dharmasraya | Campuran | 199 | 2.562 | 0,0% | 3,4% | 93,0% | 0,6% | 2,0% → 4,6% |
| 1311 | Solok Selatan | Perbukitan | 664 | 3.754 | 0,0% | 26,7% | 95,0% | 0,4% | 0,4% → 1,8% |
| 1312 | Pasaman Barat | Dataran | 253 | 2.900 | 14,0% | 10,8% | 91,7% | 0,7% | 0,9% → 4,9% |
| 1371 | Kota Padang | Perbukitan | 477 | 1.885 | 13,8% | 45,7% | 80,5% | 11,3% | 42,1% → 50,1% |
| 1372 | Kota Solok | Perbukitan | 643 | 1.546 | 0,0% | 10,2% | 67,3% | 11,8% | 56,7% → 61,5% |
| 1373 | Kota Sawahlunto | Perbukitan | 438 | 1.207 | 0,0% | 24,8% | 90,0% | 2,0% | 15,2% → 18,2% |
| 1374 | Kota Padang Panjang | Perbukitan | 823 | 1.395 | 0,0% | 26,0% | 61,1% | 19,9% | 79,9% → 85,2% |
| 1375 | Kota Bukittinggi | Perbukitan | 913 | 990 | 0,0% | 0,0% | 38,7% | 41,4% | 90,0% → 93,5% |
| 1376 | Kota Payakumbuh | Perbukitan | 524 | 834 | 0,0% | 0,5% | 51,1% | 17,7% | 72,7% → 98,0% |
| 1377 | Kota Pariaman | Dataran rendah | 18 | 84 | 44,2% | 0,0% | 60,7% | 13,2% | 95,6% → 98,6% |
