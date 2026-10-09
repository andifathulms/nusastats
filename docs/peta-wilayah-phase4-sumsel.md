# Peta Wilayah Phase 4: Sumatera Selatan (all three layers)

Runs: 2026-10-09, 02:50–04:42 UTC (`uv run python -m all --level kabupaten|kecamatan [--layer nightlights] --prov 16`),
followed by a second pass that found every area up to date.

## Outcome

- **17 kabupaten/kota and 241 kecamatan, all three layers: no failed checks, no errors, no skipped names or
  night-lights years.** Transient DNS errors and connection resets during the night-lights reads were all
  recovered by the retry logic.
- Backend export loaded with `load_peta`.

## Validation

| Check | Result |
|---|---|
| UTM vs geodesic / pixel vs UTM area | max 0.14% / 0.23% |
| Smallest kecamatan | Bukit Kecil 2,4 km², Seberang Ulu Satu 3,9 km² (Kota Palembang); all pass |
| Nodata: DEM / land cover / night lights | 0% / 0% / none skipped |
| Land cover shares sum; palette | 99,98–100,02%; exact |
| Kabupaten sum to the province polygon | 86.771,7 km², within 0.000% |
| Kabupaten max/min = highest/lowest kecamatan max/min | exact in 17 of 17 |
| Kecamatan areas sum to the kabupaten; land cover weighted | within 0.028%; within 0.015 point |

**Peaks.**

| Peak | Published | Our maximum | Difference |
|---|---|---|---|
| Dempo (Kota Pagar Alam / Lahat; active volcano) | 3.142–3.178 m (sources differ; 3.159 most cited) | Lahat 3.154,8 m at 103.128°E 4.016°S; Pagar Alam 3.154,7 m on the same summit | −4 m vs 3.159 |
| Patah (Bengkulu–Sumatera Selatan border) | 2.852 m | Muara Enim 2.799 m at 103.316°E 4.270°S; the Bengkulu side (Kaur) reads 2.840 m at 103.306°E 4.258°S | the DEM summit lies on the Kaur side (−12 m); the Sumsel side reaches 2.799 m |

Sources: [Medcom (Dempo 3.142 m)](https://www.medcom.id/nasional/daerah/3NOOARXN-gunung-dempo-muntahkan-material-vulkanik-setinggi-2-km),
[p2k.stekom.ac.id (Dempo summits)](https://p2k.stekom.ac.id/ensiklopedia/Gunung_Dempo,_Pagar_Alam_Selatan,_Pagar_Alam),
[Mojok (Pagar Alam)](https://mojok.co/terminal/pagar-alam-kota-kecil-di-tengah-indahnya-sumatera-selatan/amp/);
Patah as in the [Bengkulu report](peta-wilayah-phase4-bengkulu.md).

## Findings

- **Terrain: a lowland province with a mountain rim.** 10 of 17 kabupaten are *Dataran rendah*; Kota Pagar Alam is
  the only *Pegunungan* (mean 1.249 m). Lahat, OKU Selatan and Empat Lawang are *Perbukitan*, Musi Rawas Utara is
  *Campuran*, and OKU and Kota Lubuklinggau are *Dataran*. Kecamatan: 160 Dataran rendah, 45 Perbukitan,
  16 Dataran, 14 Pegunungan, 6 Campuran.
- **Very low land on the east coast.** Under 10 m: Kota Palembang 78,0%, Banyuasin 70,6%, OKI 56,7%,
  Ogan Ilir 33,5%.
- **Tree cover is high but includes plantations.** ESA WorldCover's *tree cover* class does not separate forest from
  rubber and oil palm, which explains readings such as Kota Prabumulih at 93,4%. Kota Palembang is 38,6% built-up.
- **Night lights.** Kota Palembang 94,6% → 97,5% lit. Growth over meaningful bases: OKU Timur 6,8% → 17,9% (×2,6),
  OKI ×2,5, Muara Enim ×2,0. Musi Rawas Utara (×6,4), OKU Selatan (×5,9) and Empat Lawang (×4,2) start from small
  bases (6–21 km² lit in 2018).

| Kode | Nama | Kelas medan | Rata-rata (m) | Maks (m) | <10 m | Bergunung | Tutupan pohon | Lahan terbangun | Bercahaya 2018 → 2024 |
|---|---|---|---|---|---|---|---|---|---|
| 1601 | Ogan Komering Ulu | Dataran | 211 | 2.026 | 0,0% | 3,9% | 94,9% | 0,8% | 2,7% → 4,0% |
| 1602 | Ogan Komering Ilir | Dataran rendah | 12 | 107 | 56,7% | 0,0% | 61,0% | 0,5% | 1,6% → 4,0% |
| 1603 | Muara Enim | Dataran rendah | 260 | 2.799 | 5,8% | 3,2% | 91,2% | 0,8% | 6,6% → 13,4% |
| 1604 | Lahat | Perbukitan | 463 | 3.155 | 0,0% | 13,7% | 92,8% | 0,8% | 6,0% → 8,7% |
| 1605 | Musi Rawas | Dataran rendah | 144 | 2.007 | 0,0% | 6,5% | 95,0% | 0,5% | 2,8% → 4,4% |
| 1606 | Musi Banyuasin | Dataran rendah | 29 | 178 | 21,3% | 0,0% | 91,0% | 0,4% | 3,5% → 5,6% |
| 1607 | Banyuasin | Dataran rendah | 9 | 79 | 70,6% | 0,0% | 52,2% | 0,7% | 3,1% → 4,7% |
| 1608 | Ogan Komering Ulu Timur | Dataran rendah | 64 | 444 | 0,0% | 0,0% | 72,7% | 2,3% | 6,8% → 17,9% |
| 1609 | Ogan Komering Ulu Selatan | Perbukitan | 626 | 2.646 | 0,0% | 10,8% | 88,4% | 0,5% | 0,2% → 1,0% |
| 1610 | Ogan Ilir | Dataran rendah | 17 | 70 | 33,5% | 0,0% | 67,2% | 1,4% | 9,5% → 15,9% |
| 1611 | Empat Lawang | Perbukitan | 562 | 2.668 | 0,0% | 12,5% | 92,4% | 0,6% | 0,3% → 1,2% |
| 1612 | Penukal Abab Lematang Ilir | Dataran rendah | 32 | 123 | 15,7% | 0,0% | 92,5% | 0,8% | 5,7% → 11,2% |
| 1613 | Musi Rawas Utara | Campuran | 296 | 2.389 | 0,0% | 14,8% | 96,6% | 0,2% | 0,3% → 2,2% |
| 1671 | Kota Palembang | Dataran rendah | 7 | 44 | 78,0% | 0,0% | 31,9% | 38,6% | 94,6% → 97,5% |
| 1672 | Kota Pagar Alam | Pegunungan | 1.249 | 3.155 | 0,0% | 17,3% | 90,2% | 1,6% | 5,2% → 8,9% |
| 1673 | Kota Lubuklinggau | Dataran | 141 | 685 | 0,0% | 3,8% | 90,4% | 5,7% | 21,9% → 31,0% |
| 1674 | Kota Prabumulih | Dataran rendah | 41 | 86 | 0,2% | 0,0% | 93,4% | 4,3% | 33,3% → 50,8% |
