# Peta Wilayah Phase 4: Sulawesi Utara (all three layers)

Runs: 2026-10-06, 02:47–03:41 UTC (`uv run python -m all --level kabupaten|kecamatan [--layer nightlights] --prov 71`).
With this province, **all of Sulawesi and all of Kalimantan are done.**

## Outcome

- **15 kabupaten/kota and 171 kecamatan, all three layers: no failed checks, no errors, no skipped names or
  night-lights years.**
- The island kecamatan pass every limit. The smallest are Sario (2,0 km², Manado), **Miangas** (2,1 km², the
  northernmost border island) and Kepulauan Marore (3,3 km²).
- Backend export: 1,789 areas (137 kabupaten, 1,652 kecamatan), loaded with `load_peta`.

## Validation

| Check | Result |
|---|---|
| UTM vs geodesic / pixel vs UTM area | max 0.14% / 0.41% (Sario, 2 km²) |
| Nodata: DEM / land cover / night lights | 0% / 0% / no year over the limit |
| Land cover shares sum; palette | 99,98–100,02%; exact |
| Kabupaten sum to the province polygon | within 0.002% |
| Kabupaten max/min = highest/lowest kecamatan max/min | exact in 15 of 15 |
| Kecamatan areas sum to the kabupaten; land cover weighted | within 0.092%; within 0.034 point |

**Peaks.** Volcano heights change, and published figures disagree:

| Peak | Published | Our maximum | Reading |
|---|---|---|---|
| **Klabat** (Minahasa Utara) | 2.022 m (some sources ~1.995 m) | **1.990 m** at 125.031°E 1.453°N | −5 to −32 m, like other sharp summits (Rantemario −45 m). Plausible. |
| **Soputan** (Minahasa / Minahasa Selatan / Minahasa Tenggara meet here) | 1.784 m | **1.906–1.914 m** at 124.737°E 1.115°N | **+125 m, unresolved.** A bare, active summit has no canopy to explain it. Soputan grew lava domes in 2015–2018 and the published figure is long-standing, so the summit may genuinely be higher, but that is not verified. |
| **Karangetang** (Siau) | 1.784 m in the same summary that gives Soputan 1.784 m (likely a copy error) | **1.823 m** at 125.406°E 2.776°N | **Not verified.** Plausible for an active dome-building volcano. |

Sources: [Tirto (Klabat)](https://tirto.id/6-wisata-alam-di-minahasa-gunung-klabat-hingga-pulau-lihaga-eFJ9),
[Stekom ensiklopedia (Soputan)](https://p2k.stekom.ac.id/ensiklopedia/Gunung_soputan),
[ESDM (Karangetang)](https://esdm.go.id/id/media-center/arsip-berita/status-g-karangetang-ditingkatkan-menjadi-siaga-level-iii).

## Findings

- All 11 kabupaten and three of the four cities are *Perbukitan*; Kota Manado is *Dataran rendah*. Among kecamatan:
  139 Perbukitan, 12 Dataran rendah, 11 Pegunungan, 9 Campuran.
- **Kep. Siau Tagulandang Biaro is 55,3% *bergunung*** by local relief (volcanic islands rising from the sea).
  Bolaang Mongondow Selatan is 44,3%.
- **Night lights.** Kota Manado 79,2% lit in 2024, Kota Kotamobagu 44,1%, Kota Tomohon 39,1% (from 24,6% in 2018).
  Minahasa Utara grew from 142 to 218 km² lit. The far islands remain dark: Talaud 0,9%, Sangihe 2,5%.

| Kode | Nama | Kelas medan | Rata-rata (m) | Maks (m) | Bergunung | Lahan terbangun | Bercahaya 2018 → 2024 |
|---|---|---|---|---|---|---|---|
| 7101 | Bolaang Mongondow | Perbukitan | 545 | 1.779 | 36,8% | 0,7% | 1,6% → 3,1% |
| 7102 | Minahasa | Perbukitan | 517 | 1.906 | 6,8% | 3,1% | 11,9% → 15,4% |
| 7103 | Kepulauan Sangihe | Perbukitan | 231 | 1.345 | 25,2% | 1,1% | 1,2% → 2,5% |
| 7104 | Kepulauan Talaud | Perbukitan | 114 | 673 | 6,5% | 0,9% | 0,4% → 0,9% |
| 7105 | Minahasa Selatan | Perbukitan | 440 | 1.879 | 14,3% | 1,3% | 3,0% → 3,7% |
| 7106 | Minahasa Utara | Perbukitan | 219 | 1.990 | 5,5% | 2,5% | 14,3% → 21,9% |
| 7107 | Minahasa Tenggara | Perbukitan | 402 | 1.914 | 8,9% | 1,4% | 5,6% → 8,3% |
| 7108 | Bolaang Mongondow Utara | Perbukitan | 398 | 1.905 | 30,9% | 0,5% | 1,2% → 2,7% |
| 7109 | Kep. Siau Tagulandang Biaro | Perbukitan | 292 | 1.823 | 55,3% | 1,7% | 1,4% → 2,4% |
| 7110 | Bolaang Mongondow Timur | Perbukitan | 564 | 1.785 | 35,6% | 0,8% | 2,6% → 4,1% |
| 7111 | Bolaang Mongondow Selatan | Perbukitan | 586 | 1.959 | 44,3% | 0,3% | 0,5% → 1,3% |
| 7171 | Kota Manado | Dataran rendah | 76 | 806 | 8,0% | 22,8% | 70,1% → 79,2% |
| 7172 | Kota Bitung | Perbukitan | 286 | 1.870 | 14,0% | 5,8% | 19,4% → 25,3% |
| 7173 | Kota Tomohon | Perbukitan | 786 | 1.573 | 12,4% | 5,6% | 24,6% → 39,1% |
| 7174 | Kota Kotamobagu | Perbukitan | 363 | 1.000 | 12,4% | 10,6% | 36,3% → 44,1% |
