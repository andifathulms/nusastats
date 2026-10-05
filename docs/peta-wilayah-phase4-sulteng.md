# Peta Wilayah Phase 4: Sulawesi Tengah (kabupaten/kota and kecamatan)

Runs: 2026-10-05, kabupaten 06:36–07:32 UTC and kecamatan 07:32–07:52 UTC
(`uv run python -m all --level kabupaten|kecamatan --prov 72`). Logs: `batch-20261005T063606Z.jsonl` and
`batch-20261005T073220Z.jsonl` (local).

## Outcome

- **13 kabupaten/kota and 175 kecamatan, both layers: 376 jobs computed, 0 failed checks, 0 errors, 0 skipped
  names.**
- 22 new tiles, with hashes in `sources.json`.
- Stats JSON committed; map images stay local.
- Backend export: 1,282 areas (99 kabupaten, 1,183 kecamatan), loaded with `load_peta`.

## Validation

| Check | Result |
|---|---|
| UTM vs geodesic / pixel vs UTM area | max 0.20% / 0.06% |
| Nodata (DEM / land cover) | 0% / 0% |
| Land cover shares sum; palette | 99,98–100,01%; exact |
| Kabupaten sum to the province polygon | within 0.000% |
| Kabupaten max/min = highest/lowest kecamatan max/min | exact in 13 of 13 |
| Kecamatan areas sum to the kabupaten; land cover weighted | within 0.028%; within 0.013 points |
| **Katopasa / Kandela massif** (Tojo Una-Una) | max **2,892 m** at 121.543°E 1.299°S. Katopasa is published as 2,825 m (Bakosurtanal map: 2,865 m). Its neighbour Kandela reaches ≥2,870 m in SRTM ([gunungbagging.com](https://www.gunungbagging.com/katopasa/)). Consistent with that massif; 25–65 m high, typical for a forested surface model. |
| Donggala–Parigi Moutong border high point | 2,808 / 2,876 m at about 120.20°E 0.57°N, the Gunung Sojol area. No reliable published height found, so not used as a reference. |

## Summary

Poso and Sigi are *Pegunungan* (mean above 1.000 m); the other 11 are *Perbukitan*. Among kecamatan: 127 Perbukitan,
33 Pegunungan, 8 Campuran, 7 Dataran rendah. Kota Palu has the most built-up land (14%) and the least tree cover (64%).

| Kode | Nama | Kelas medan | Rata-rata (m) | Maks (m) | Tutupan pohon | Lahan pertanian | Lahan terbangun |
|---|---|---|---|---|---|---|---|
| 7201 | Banggai | Perbukitan | 493 | 2.548 | 90,1% | 2,6% | 0,6% |
| 7202 | Poso | Pegunungan | 1.035 | 2.555 | 85,1% | 1,6% | 0,4% |
| 7203 | Donggala | Perbukitan | 464 | 2.808 | 93,9% | 1,4% | 0,6% |
| 7204 | Toli Toli | Perbukitan | 447 | 2.392 | 92,0% | 1,8% | 0,6% |
| 7205 | Buol | Perbukitan | 460 | 2.406 | 95,9% | 0,7% | 0,3% |
| 7206 | Morowali | Perbukitan | 468 | 1.430 | 91,9% | 1,1% | 0,5% |
| 7207 | Banggai Kepulauan | Perbukitan | 307 | 1.042 | 92,4% | 0,1% | 0,4% |
| 7208 | Parigi Moutong | Perbukitan | 498 | 2.876 | 86,2% | 4,6% | 0,9% |
| 7209 | Tojo Una Una | Perbukitan | 691 | 2.892 | 88,8% | 0,2% | 0,3% |
| 7210 | Sigi | Pegunungan | 1.043 | 2.533 | 90,6% | 1,5% | 0,5% |
| 7211 | Banggai Laut | Perbukitan | 111 | 668 | 87,5% | 0,0% | 0,8% |
| 7212 | Morowali Utara | Perbukitan | 654 | 2.582 | 89,2% | 0,6% | 0,2% |
| 7271 | Kota Palu | Perbukitan | 414 | 1.887 | 63,5% | 0,4% | 14,2% |
