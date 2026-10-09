# Peta Wilayah Phase 4: Bengkulu (all three layers)

Runs: 2026-10-09, 01:39–02:39 UTC (`uv run python -m all --level kabupaten|kecamatan [--layer nightlights] --prov 17`),
after the Mac restarted and the NusaStats stack was brought back up.

## Outcome

- **10 kabupaten/kota and 129 kecamatan, all three layers: no failed checks, no errors, no skipped names or
  night-lights years.**
- Backend export loaded with `load_peta`.

## Validation

| Check | Result |
|---|---|
| UTM vs geodesic / pixel vs UTM area | max 0.20% / 0.23% |
| Smallest kecamatan | Teluk Segara 2,6 km², Ratu Samban 2,9 km² (Kota Bengkulu); all pass |
| Nodata: DEM / land cover / night lights | 0% / 0% / none skipped |
| Land cover shares sum; palette | 99,99–100,02%; exact |
| Kabupaten sum to the province polygon | within 0.000% |
| Kabupaten max/min = highest/lowest kecamatan max/min | exact in 10 of 10 |
| Kecamatan areas sum to the kabupaten; land cover weighted | within 0.067%; within 0.013 point |

**Peaks.**

| Peak | Published | Our maximum | Difference |
|---|---|---|---|
| Kaba (Kepahiang / Rejang Lebong; active volcano) | 1.937–1.952 m (sources differ) | Kepahiang 1.954 m at 102.616°E 3.522°S | +2 to +17 m |
| Patah (Kaur, on the Sumatera Selatan border) | 2.852 m | Kaur 2.840 m at 103.306°E 4.258°S | −12 m; the Sumsel side may be higher, so recheck when Sumatera Selatan runs |

Sources: [Liputan6 (Kaba)](https://www.liputan6.com/lifestyle/read/5988417/6-fakta-menarik-gunung-kaba-di-bengkulu-yang-punya-danau-di-ketinggian-1100-mdpl),
[Liputan6 (Patah)](https://www.liputan6.com/lifestyle/read/5861184/6-fakta-menarik-gunung-patah-di-bengkulu-dengan-jalur-pendakian-ekstrem),
[Wikipedia (Mount Patah)](https://www.Wikipedia.org/wiki/Mount_Patah).

## Findings

- **Terrain.** Lebong is *Pegunungan* (mean 1.081 m, 43,1% *bergunung* by local relief). Kota Bengkulu is *Dataran
  rendah*; the other eight kabupaten are *Perbukitan*. Kecamatan: 66 Perbukitan, 37 Dataran rendah, 15 Campuran,
  11 Pegunungan.
- **One of the most forested provinces so far.** Tree cover is 91–97% in every kabupaten (Kota Bengkulu 56%).
- **Night lights: very dark outside the city.** Every kabupaten is under 6% lit in 2024 (Kota Bengkulu 86,1%).
  Lit area grew from small bases: Seluma ×5,7, Bengkulu Tengah ×4,4, Muko Muko ×4,1.

| Kode | Nama | Kelas medan | Rata-rata (m) | Maks (m) | Bergunung | Tutupan pohon | Lahan terbangun | Bercahaya 2018 → 2024 |
|---|---|---|---|---|---|---|---|---|
| 1701 | Bengkulu Selatan | Perbukitan | 309 | 2.715 | 14,0% | 92,2% | 1,1% | 1,3% → 2,6% |
| 1702 | Rejang Lebong | Perbukitan | 763 | 2.464 | 12,8% | 93,7% | 1,4% | 1,7% → 3,9% |
| 1703 | Bengkulu Utara | Perbukitan | 276 | 2.489 | 8,6% | 96,6% | 0,4% | 0,4% → 1,3% |
| 1704 | Kaur | Perbukitan | 571 | 2.840 | 18,7% | 94,2% | 0,4% | 0,3% → 1,0% |
| 1705 | Seluma | Perbukitan | 339 | 1.896 | 14,4% | 95,3% | 0,5% | 0,3% → 1,7% |
| 1706 | Muko Muko | Perbukitan | 276 | 2.242 | 10,6% | 97,1% | 0,4% | 0,3% → 1,4% |
| 1707 | Lebong | Pegunungan | 1.081 | 2.456 | 43,1% | 91,3% | 0,5% | 0,3% → 0,8% |
| 1708 | Kepahiang | Perbukitan | 743 | 1.954 | 4,8% | 94,7% | 1,6% | 2,4% → 3,4% |
| 1709 | Bengkulu Tengah | Perbukitan | 209 | 1.513 | 4,7% | 95,2% | 0,7% | 1,3% → 5,7% |
| 1771 | Kota Bengkulu | Dataran rendah | 13 | 82 | 0,0% | 56,1% | 27,9% | 79,7% → 86,1% |
