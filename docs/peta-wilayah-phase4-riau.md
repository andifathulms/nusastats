# Peta Wilayah Phase 4: Riau (all three layers)

Runs: 2026-10-09, 07:35–09:17 UTC (`uv run python -m all --level kabupaten|kecamatan [--layer nightlights] --prov 14`),
followed by a second pass that found every area up to date.

## Outcome

- **12 kabupaten/kota and 172 kecamatan, all three layers: no failed checks, no errors, no skipped names or
  night-lights years.**
- Backend export loaded with `load_peta`.

## Validation

| Check | Result |
|---|---|
| UTM vs geodesic / pixel vs UTM area | max 0.19% / 0.40% (Pekanbaru Kota, 2,3 km²) |
| Smallest kecamatan | Pekanbaru Kota 2,3 km², Senapelan 3,0 km²; all pass |
| Nodata: DEM / land cover / night lights | 0% / 0% / none skipped |
| Land cover shares sum; palette | 99,98–100,02%; exact |
| Kabupaten sum to the province polygon | 89.853,1 km², within 0.000% |
| Kabupaten max/min = highest/lowest kecamatan max/min | exact in 12 of 12 |
| Kecamatan areas sum to the kabupaten; land cover weighted | within 0.047%; within 0.019 point |

**Highest points.** Riau has no well-known summit to match. The highest DEM point is 1.257 m in kec. Kampar Kiri
Hulu (Kampar) at 100.793°E 0.205°S, on the Bukit Barisan edge by the Sumatera Barat border; Rokan IV Koto (Rokan
Hulu) reaches 1.140 m. Indragiri Hilir, a coastal kabupaten, reads 573 m in kec. Kemuning at 102.628°E 1.103°S: that
is the Bukit Tigapuluh range on the Jambi border, consistent with Indragiri Hulu (827 m) and Tanjung Jabung Barat
(725 m, Jambi report) nearby.

## Findings

- **The flattest province so far.** 11 of 12 kabupaten/kota are *Dataran rendah* and Kuantan Singingi is *Dataran*.
  Kecamatan: 159 Dataran rendah, 6 Perbukitan, 3 Campuran, 3 Dataran, and one *Pegunungan* (Kampar Kiri Hulu).
- **Very low land along the Malacca Strait.** Under 10 m: Indragiri Hilir 67,3%, Kota Dumai 44,6%, Rokan Hilir
  41,1%, Kepulauan Meranti 40,5%, Bengkalis 28,0%.
- **Tree cover 74–96%**, which includes the oil palm and acacia plantations that dominate the province (WorldCover
  does not separate them from forest). Kota Pekanbaru is 18,5% built-up.
- **Night lights.** Kota Pekanbaru is flat at 74–75% lit; the large lit areas are Kampar (735 km² in 2018), Bengkalis
  and Siak. Growth: Rokan Hulu ×3,6, Kuantan Singingi ×3,3, Rokan Hilir ×2,6, Indragiri Hulu ×2,3. The coastal
  Indragiri Hilir and Kepulauan Meranti stay under 2% lit.

| Kode | Nama | Kelas medan | Rata-rata (m) | Maks (m) | <10 m | Tutupan pohon | Lahan terbangun | Bercahaya 2018 → 2024 |
|---|---|---|---|---|---|---|---|---|
| 1401 | Kampar | Dataran rendah | 108 | 1.257 | 2,1% | 95,5% | 0,8% | 7,1% → 10,2% |
| 1402 | Indragiri Hulu | Dataran rendah | 70 | 827 | 10,6% | 93,3% | 0,5% | 1,8% → 4,3% |
| 1403 | Bengkalis | Dataran rendah | 18 | 84 | 28,0% | 84,1% | 0,7% | 7,3% → 10,2% |
| 1404 | Indragiri Hilir | Dataran rendah | 15 | 573 | 67,3% | 76,3% | 0,3% | 0,8% → 1,3% |
| 1405 | Pelalawan | Dataran rendah | 28 | 184 | 19,2% | 88,0% | 0,3% | 1,7% → 3,3% |
| 1406 | Rokan Hulu | Dataran rendah | 86 | 1.140 | 1,3% | 95,3% | 0,6% | 1,5% → 5,4% |
| 1407 | Rokan Hilir | Dataran rendah | 16 | 96 | 41,1% | 79,9% | 0,5% | 2,2% → 5,9% |
| 1408 | Siak | Dataran rendah | 24 | 115 | 21,6% | 92,2% | 0,7% | 7,2% → 10,4% |
| 1409 | Kuantan Singingi | Dataran | 125 | 919 | 0,0% | 95,0% | 0,4% | 0,9% → 3,2% |
| 1410 | Kepulauan Meranti | Dataran rendah | 14 | 52 | 40,5% | 78,5% | 0,2% | 1,2% → 1,7% |
| 1471 | Kota Pekanbaru | Dataran rendah | 24 | 95 | 23,4% | 73,6% | 18,5% | 74,4% → 75,1% |
| 1472 | Kota Dumai | Dataran rendah | 14 | 57 | 44,6% | 84,1% | 1,8% | 12,0% → 18,8% |
