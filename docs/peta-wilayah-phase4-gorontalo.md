# Peta Wilayah Phase 4: Gorontalo (all three layers)

Runs: 2026-10-06, 02:13–02:44 UTC (`uv run python -m all --level kabupaten|kecamatan [--layer nightlights] --prov 75`).
Steps chained with `;` so one failure cannot skip later passes.

## Outcome

- **6 kabupaten/kota and 77 kecamatan, all three layers: no failed checks, no errors, no retries, no skipped names
  or night-lights years.**
- Backend export: 1,603 areas (122 kabupaten, 1,481 kecamatan), loaded with `load_peta`.

## Validation

| Check | Result |
|---|---|
| UTM vs geodesic / pixel vs UTM area | max 0.08% / 0.22% |
| Nodata: DEM / land cover / night lights | 0% / 0% / no year over the limit |
| Land cover shares sum; palette | 99,98–100,02%; exact |
| Kabupaten sum to the province polygon | within 0.000% |
| Kabupaten max/min = highest/lowest kecamatan max/min | exact in 6 of 6 |
| Kecamatan areas sum to the kabupaten; land cover weighted | within 0.141%; within 0.024 point |
| **Gunung Boliyohuto** (published 2,065 m) | Kab. Gorontalo / Gorontalo Utara max **2,066 / 2,072 m** at 122.51°E 0.89°N. +1 to +7 m, the closest match so far. |
| **Gunung Tabongo** (published 2,100 m, "highest in the province, in Boalemo") | **Not resolved.** Boalemo's maximum is 1,920 m. The province's highest point is **2,221 m in Pohuwato** (121.777°E 0.938°N). Pohuwato was split from Boalemo in 2003, which may explain older sources naming Boalemo, but a 121 m gap is more than canopy explains. Either the published figure is off or that point is another peak. |

Sources for the peak heights: [Bapppeda Provinsi Gorontalo](https://bapppeda.gorontaloprov.go.id/download/dokumen/18),
[Mamikos](https://mamikos.com/info/gunung-di-pulau-sulawesi-dan-ketinggiannya-pljr/).

## Findings

- All five kabupaten are *Perbukitan*; Kota Gorontalo is *Campuran*. Bone Bolango is 49,6% *bergunung* by local
  relief, and Gorontalo Utara 40,0%.
- Kota Gorontalo: 29,4% built-up and 77,6% lit in 2024. Kab. Gorontalo has the most cropland (9,2%).
- Night lights grew everywhere from real bases: Pohuwato 40 → 111 km² lit, Boalemo 24 → 68 km², Gorontalo Utara
  14 → 45 km², Kab. Gorontalo 118 → 212 km². Kota Gorontalo was already lit (53 → 55 km²).

| Kode | Nama | Kelas medan | Rata-rata (m) | Maks (m) | Bergunung | Tutupan pohon | Lahan pertanian | Bercahaya 2018 → 2024 |
|---|---|---|---|---|---|---|---|---|
| 7501 | Gorontalo | Perbukitan | 281 | 2.066 | 18,8% | 75,4% | 9,2% | 5,4% → 9,8% |
| 7502 | Boalemo | Perbukitan | 284 | 1.920 | 18,2% | 78,8% | 5,0% | 1,3% → 3,7% |
| 7503 | Bone Bolango | Perbukitan | 532 | 1.940 | 49,6% | 94,9% | 1,3% | 3,9% → 6,1% |
| 7504 | Pohuwato | Perbukitan | 466 | 2.221 | 32,8% | 91,1% | 1,4% | 0,9% → 2,5% |
| 7505 | Gorontalo Utara | Perbukitan | 391 | 2.072 | 40,0% | 85,9% | 3,0% | 0,8% → 2,6% |
| 7571 | Kota Gorontalo | Campuran | 101 | 693 | 17,9% | 48,7% | 11,2% | 74,7% → 77,6% |
