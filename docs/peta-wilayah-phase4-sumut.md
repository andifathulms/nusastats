# Peta Wilayah Phase 4: Sumatera Utara (all three layers)

Runs: 2026-10-09, 12:33–15:04 UTC (`uv run python -m all --level kabupaten|kecamatan [--layer nightlights] --prov 12`),
followed by a second pass that found every area up to date.

## Outcome

- **33 kabupaten/kota and 455 kecamatan, all three layers: no failed checks, no errors, no skipped names or
  night-lights years.**
- Backend export loaded with `load_peta`.

## Validation

| Check | Result |
|---|---|
| UTM vs geodesic / pixel vs UTM area | max 0.08% / 0.42% (Tanjungbalai Utara, 0,8 km²) |
| Smallest kecamatan | Tanjungbalai Utara 0,8 km², Sibolga Sambas 0,9 km², Sibolga Kota 1,3 km²; all pass |
| Nodata: DEM / land cover / night lights | 0% / 0% / none skipped |
| Land cover shares sum; palette | 99,98–100,02%; exact |
| Kabupaten sum to the province polygon | 72.460,4 km², within 0.000% |
| Kabupaten max/min = highest/lowest kecamatan max/min | exact in 33 of 33 |
| Kecamatan areas sum to the kabupaten; land cover weighted | within 0.166%; within 0.147 point (Kota Sibolga and Kota Pematangsiantar, tree/built-up split at kecamatan edges in small cities; all other kabupaten within 0.05) |

**Peaks.**

| Peak | Published | Our maximum | Difference |
|---|---|---|---|
| Sibuatan (Karo / Dairi; usually called the province's highest) | 2.457–2.460 m | Dairi 2.452 m at 98.424°E 2.918°N (Karo side 2.449 m) | −5 to −8 m |
| Sinabung (Karo; erupted 2010 and 2013–2021) | 2.460 m before 2010, about 2.451 m after | kec. Naman Teran 2.441 m at 98.391°E 3.171°N | −10 to −19 m. The DEM was collected 2011–2015, during the eruptive period |
| Sorik Marapi (Mandailing Natal) | 2.145 m | kec. Puncak Sorik Marapi 2.136 m at 99.539°E 0.686°N | −9 m |
| Sibayak complex (Karo / Deli Serdang) | Takal Kuda 2.094 m; Deleng Pintau 2.212 m | kec. Merdeka 2.084 m at 98.504°E 3.241°N; kec. Kutalimbaru 2.206 m at 98.501°E 3.248°N | −10 m; −6 m |
| Lubuk Raya (Tapanuli Selatan) | 1.880 m (one source) | kec. Angkola Timur 1.896 m at 99.210°E 1.478°N | +16 m |
| Lake Toba surface | about 903–905 m | Samosir minimum and 5th percentile 901 m | −2 to −4 m |

**The province's DEM maximum is not Sibuatan.** Langkat reads 2.821,5 m in kec. Batang Serangan at 97.853°E 3.630°N,
on the Leuser range by the Aceh border. Sibuatan's "highest in Sumatera Utara" status probably refers to summits
reached by hiking routes; this report does not claim a named peak for the Langkat point. **Resolved in the
[Aceh run](peta-wilayah-phase4-aceh.md):** the summit is on the Aceh side (kec. Badar, Aceh Tenggara, 2.834,6 m at
97.853°E 3.629°N); Langkat's 2.821,5 m is its border slope.

Sources: [Gunung Bagging (Sumatera Utara)](https://www.gunungbagging.com/sumatera-utara/),
[iNews (Sibuatan)](https://www.inews.id/regional/sumut/gunung-sibuatan),
[Tirto (Sibayak)](https://tirto.id/profil-gunung-sibayak-letak-ketinggian-aktif-atau-tidak-g3x6),
[Rumah123](https://www.rumah123.com/explore/kota-medan/gunung-di-medan/),
[Gramedia](https://www.gramedia.com/best-seller/gunung-di-sumatera).

## Findings

- **Terrain: highlands around Lake Toba.** Six kabupaten are *Pegunungan* (Samosir mean 1.278 m, Humbang Hasundutan,
  Tapanuli Utara, Toba, Karo, Dairi); 9 are *Perbukitan*, 6 *Campuran* (including Langkat and the Nias kabupaten),
  11 *Dataran rendah*, and Deli Serdang *Dataran*. Kecamatan: 177 Dataran rendah, 162 Perbukitan, 76 Pegunungan,
  21 Dataran, 19 Campuran.
- **Lake Toba is inside the kabupaten polygons:** water is 27,1% of Samosir and 9,1% of Toba.
- **Very low east coast.** Under 10 m: Kota Tanjung Balai 92,3%, Batu Bara 56,4%, Labuhanbatu 46,6%, Kota Medan 36,0%.
- **Land cover.** Kota Medan is 58,8% built-up, the most of any kabupaten/kota in Sumatra so far; Kota Tebing Tinggi
  40,5%. Cropland is highest in Serdang Bedagai (17,4%) and Kota Pematangsiantar (16,3%).
- **Night lights.** Kota Medan is 100% lit in both 2018 and 2024; Deli Serdang has the largest lit area (1.344 km²
  in 2018, 62,0% lit by 2024). Growth: Batu Bara 26,2% → 55,3%, Kota Padang Sidempuan 33,9% → 61,7%, Karo ×5,3,
  Simalungun ×3,3, Tapanuli Selatan ×4,6. Nias Utara (×7,1) and Nias (×5,1) start from 1–2 km².

| Kode | Nama | Kelas medan | Rata-rata (m) | Maks (m) | <10 m | Bergunung | Tutupan pohon | Lahan terbangun | Bercahaya 2018 → 2024 |
|---|---|---|---|---|---|---|---|---|---|
| 1201 | Tapanuli Tengah | Perbukitan | 213 | 1.274 | 20,7% | 16,4% | 92,1% | 0,6% | 2,2% → 4,1% |
| 1202 | Tapanuli Utara | Pegunungan | 1.050 | 2.290 | 0,0% | 11,7% | 79,8% | 0,5% | 1,1% → 1,9% |
| 1203 | Tapanuli Selatan | Perbukitan | 612 | 2.011 | 2,6% | 26,9% | 94,1% | 0,3% | 1,0% → 4,7% |
| 1204 | Nias | Campuran | 123 | 672 | 5,7% | 1,1% | 93,8% | 0,4% | 0,3% → 1,4% |
| 1205 | Langkat | Campuran | 328 | 2.822 | 18,1% | 22,9% | 88,1% | 1,1% | 8,7% → 16,4% |
| 1206 | Karo | Pegunungan | 1.010 | 2.449 | 0,0% | 26,1% | 70,9% | 1,4% | 2,7% → 14,5% |
| 1207 | Deli Serdang | Dataran | 208 | 2.206 | 21,8% | 4,5% | 69,8% | 7,6% | 52,1% → 62,0% |
| 1208 | Simalungun | Perbukitan | 580 | 2.091 | 0,0% | 4,5% | 76,4% | 1,4% | 3,8% → 12,5% |
| 1209 | Asahan | Dataran rendah | 160 | 2.184 | 22,7% | 3,7% | 90,2% | 1,2% | 7,6% → 15,2% |
| 1210 | Labuhanbatu | Dataran rendah | 28 | 555 | 46,6% | 0,3% | 82,8% | 1,2% | 4,2% → 8,5% |
| 1211 | Dairi | Pegunungan | 966 | 2.452 | 0,0% | 25,3% | 76,4% | 0,9% | 1,2% → 3,3% |
| 1212 | Toba | Pegunungan | 1.016 | 2.282 | 0,0% | 25,2% | 70,8% | 0,7% | 1,7% → 4,2% |
| 1213 | Mandailing Natal | Perbukitan | 502 | 2.194 | 9,6% | 26,8% | 95,2% | 0,3% | 0,6% → 2,1% |
| 1214 | Nias Selatan | Campuran | 139 | 856 | 5,9% | 2,3% | 91,1% | 0,3% | 0,4% → 0,9% |
| 1215 | Pakpak Bharat | Perbukitan | 710 | 1.854 | 0,0% | 38,0% | 93,3% | 0,2% | 0,3% → 0,6% |
| 1216 | Humbang Hasundutan | Pegunungan | 1.035 | 2.041 | 0,0% | 21,2% | 78,9% | 0,6% | 0,3% → 1,2% |
| 1217 | Samosir | Pegunungan | 1.278 | 2.155 | 0,0% | 12,1% | 43,6% | 0,6% | 0,5% → 2,0% |
| 1218 | Serdang Bedagai | Dataran rendah | 63 | 1.239 | 20,6% | 0,5% | 74,0% | 3,0% | 25,5% → 44,4% |
| 1219 | Batu Bara | Dataran rendah | 12 | 77 | 56,4% | 0,0% | 72,5% | 3,9% | 26,2% → 55,3% |
| 1220 | Padang Lawas Utara | Campuran | 229 | 1.593 | 0,0% | 10,6% | 91,8% | 0,3% | 0,5% → 1,3% |
| 1221 | Padang Lawas | Campuran | 304 | 2.197 | 0,0% | 14,9% | 93,1% | 0,3% | 0,5% → 2,8% |
| 1222 | Labuhanbatu Selatan | Dataran rendah | 53 | 463 | 11,2% | 0,0% | 93,8% | 0,6% | 2,2% → 6,8% |
| 1223 | Labuhanbatu Utara | Dataran rendah | 148 | 2.046 | 27,4% | 11,5% | 86,0% | 0,5% | 1,7% → 4,5% |
| 1224 | Nias Utara | Dataran rendah | 65 | 407 | 7,4% | 0,0% | 93,6% | 0,3% | 0,1% → 0,6% |
| 1225 | Nias Barat | Campuran | 99 | 548 | 7,4% | 0,6% | 93,4% | 0,5% | 0,3% → 1,2% |
| 1271 | Kota Medan | Dataran rendah | 21 | 86 | 36,0% | 0,0% | 19,4% | 58,8% | 100,0% → 100,0% |
| 1272 | Kota Pematangsiantar | Perbukitan | 398 | 595 | 0,0% | 0,0% | 48,1% | 29,5% | 79,7% → 92,4% |
| 1273 | Kota Sibolga | Perbukitan | 91 | 371 | 24,0% | 19,9% | 66,4% | 29,4% | 92,5% → 97,8% |
| 1274 | Kota Tanjung Balai | Dataran rendah | 6 | 20 | 92,3% | 0,0% | 63,8% | 16,1% | 81,8% → 93,7% |
| 1275 | Kota Binjai | Dataran rendah | 37 | 85 | 0,0% | 0,0% | 58,3% | 26,5% | 93,5% → 100,0% |
| 1276 | Kota Tebing Tinggi | Dataran rendah | 24 | 53 | 0,0% | 0,0% | 47,2% | 40,5% | 99,0% → 99,6% |
| 1277 | Kota Padang Sidempuan | Perbukitan | 406 | 827 | 0,0% | 0,7% | 77,2% | 9,0% | 33,9% → 61,7% |
| 1278 | Kota Gunungsitoli | Perbukitan | 102 | 336 | 7,0% | 0,0% | 93,4% | 2,4% | 10,9% → 14,2% |
