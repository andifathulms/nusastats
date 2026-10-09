# Peta Wilayah Phase 4: Kepulauan Riau (all three layers)

Runs: 2026-10-09, 09:44–10:54 UTC (`uv run python -m all --level kabupaten|kecamatan [--layer nightlights] --prov 21`),
followed by a second pass that found every area up to date.

## Outcome

- **7 kabupaten/kota and 78 of 80 kecamatan, all three layers: no failed checks, no errors, no skipped
  night-lights years.**
- **2 kecamatan skipped, reported (not guessed):** the BIG archive has two Natuna kecamatan, **210323** (desa Pulau
  Panjang 2103232001, Pulau Kerdau 2103232002; 11,9 km², around 108.78°E 2.72°N) and **210324** (desa Kelarik Barat
  2103242001, Seluan Barat 2103242002; 7,2 km², around 107.85°E 4.14°N). Kemendagri/Dukcapil (period 2026-10) has
  neither kecamatan code nor any of the four desa, so there is no official name to give them and the batch runner logs
  them as `skipped_no_name`. Their land is still inside Natuna's kabupaten figures, which come from the full outline.
- 2 kecamatan (210213, 210214) are named from their village records, as elsewhere.
- Backend export loaded with `load_peta`.

## Validation

| Check | Result |
|---|---|
| UTM vs geodesic / pixel vs UTM area | max 0.19% / 0.16% |
| Smallest kecamatan | Tanjung Pinang Barat 4,4 km², Karimun 6,8 km²; all pass |
| Nodata: DEM / land cover / night lights | 0% / 0% / none skipped |
| Land cover shares sum; palette | 99,98–100,02%; exact |
| Kabupaten sum to the province polygon | 8.266,8 km², within 0.001% |
| Kabupaten max/min = highest/lowest kecamatan max/min | exact in 7 of 7 |
| Kecamatan areas sum to the kabupaten; land cover weighted | within 0.947%; within 0.072 point. The gap is Natuna, missing the two skipped kecamatan (19,1 km²) |

**Peaks.**

| Peak | Published | Our maximum | Difference |
|---|---|---|---|
| Daik (Lingga; highest in the province) | 1.165 m | Lingga 1.113 m at 104.550°E 0.196°S | −52 m. Daik's top is a set of sheer rock pinnacles that a 30 m DEM pixel cannot hold, like Raung (about −70 m) |
| Ranai (Natuna) | 1.035 m (tourism office, SAR 2026); an older geology source gives about 700 m for the granite body | Natuna 1.001 m at 108.336°E 3.976°N | −34 m vs 1.035 |

Sources: [Liputan6 (Daik)](https://www.liputan6.com/lifestyle/read/5626213/6-fakta-menarik-gunung-daik-yang-ketiga-puncaknya-dipercaya-dihuni-orang-bunian),
[Gunung Bagging (Daik)](https://www.gunungbagging.com/daik),
[Dinas Pariwisata Natuna (Ranai)](https://dinaspariwisata.natunakab.go.id/?p=3186),
[Koran Jakarta (Ranai, 2026)](https://koran-jakarta.com/2026-04-19/kantor-sar-natuna-uji-repeater-di-puncak-gunung-ranai),
[ESDM geology journal (Ranai granite)](https://ejournal.mgi.esdm.go.id/index.php/jgk/article/download/185/175).

## Findings

- **Terrain.** Six kabupaten/kota are *Dataran rendah*; Kepulauan Anambas is *Perbukitan*. Kecamatan: 56 Dataran
  rendah, 18 Perbukitan, 4 Campuran. Bintan's highest point (395 m) is on the Tambelan islands at 107.55°E.
- **Low islands.** Under 10 m: Kota Tanjung Pinang 51,9%, Kota Batam 43,8%, Bintan 40,1%, Karimun 39,5%.
- **Land cover.** Kota Batam is 10,4% and Kota Tanjung Pinang 14,9% built-up; Kepulauan Anambas is 94,0% tree cover.
- **Night lights.** Kota Tanjung Pinang 64,8% → 81,0% lit and Bintan 13,9% → 20,1%; Kota Batam is flat at 47–50% (it
  is the largest lit area, 488 km² in 2018). The outer kabupaten (Natuna, Lingga, Anambas) stay around 1–2% lit.

| Kode | Nama | Kelas medan | Rata-rata (m) | Maks (m) | <10 m | Tutupan pohon | Lahan terbangun | Bercahaya 2018 → 2024 |
|---|---|---|---|---|---|---|---|---|
| 2101 | Bintan | Dataran rendah | 21 | 395 | 40,1% | 62,7% | 1,2% | 13,9% → 20,1% |
| 2102 | Karimun | Dataran rendah | 23 | 438 | 39,5% | 69,8% | 2,4% | 13,5% → 15,6% |
| 2103 | Natuna | Dataran rendah | 43 | 1.001 | 19,7% | 83,1% | 0,4% | 1,0% → 2,1% |
| 2104 | Lingga | Dataran rendah | 54 | 1.113 | 23,4% | 82,0% | 0,4% | 0,6% → 1,1% |
| 2105 | Kepulauan Anambas | Perbukitan | 115 | 561 | 9,1% | 94,0% | 0,3% | 1,0% → 1,6% |
| 2171 | Kota Batam | Dataran rendah | 18 | 209 | 43,8% | 48,7% | 10,4% | 47,2% → 49,7% |
| 2172 | Kota Tanjung Pinang | Dataran rendah | 13 | 82 | 51,9% | 37,6% | 14,9% | 64,8% → 81,0% |
