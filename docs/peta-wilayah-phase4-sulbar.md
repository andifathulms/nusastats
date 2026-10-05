# Peta Wilayah Phase 4: Sulawesi Barat (kabupaten/kota and kecamatan)

Runs: 2026-10-05, kabupaten 06:21–06:25 UTC and kecamatan 06:25–06:31 UTC
(`uv run python -m all --level kabupaten|kecamatan --prov 76`). Logs: `batch-20261005T062151Z.jsonl` and
`batch-20261005T062527Z.jsonl` (local).

## Outcome

- **6 kabupaten and 69 kecamatan, both layers: 150 jobs computed, 0 failed checks, 0 errors, 0 skipped names.**
- 3 new tiles; the rest came from the Sulsel cache.
- Stats JSON committed; map images stay local.
- Backend export: 1,094 areas (86 kabupaten, 1,008 kecamatan), loaded with `load_peta`.

## Validation

| Check | Result |
|---|---|
| UTM vs geodesic / pixel vs UTM area | max 0.13% / 0.06% |
| Nodata (DEM / land cover) | 0% / 0% |
| Land cover shares sum; palette | 99,98–100,02%; exact |
| Kabupaten sum to the province polygon | within 0.000% |
| Kabupaten max/min = highest/lowest kecamatan max/min | exact in 6 of 6 |
| Kecamatan areas sum to the kabupaten; land cover weighted | within 0.003%; within 0.009 points |
| **Gandang Dewata** (Sulbar's highest peak, Mamasa–Mamuju border) | Mamasa max **3,067 m** at 119.368°E 2.748°S, on the massif (Mamuju 3,049 m beside it). Published heights for this peak vary between sources (about 3,037–3,074 m), so there is no single reference. The location matches and the value is inside the published range. |

## Summary

The steepest province so far: Mamasa is *Pegunungan* (mean 1.321 m) and the other five kabupaten are *Perbukitan*.
Among kecamatan: 27 Perbukitan, 25 Pegunungan, 15 Dataran rendah, 2 Campuran.

| Kode | Nama | Kelas medan | Rata-rata (m) | Maks (m) | Tutupan pohon | Lahan pertanian | Lahan terbangun |
|---|---|---|---|---|---|---|---|
| 7601 | Pasangkayu | Perbukitan | 357 | 2.188 | 91,6% | 0,4% | 0,5% |
| 7602 | Mamuju | Perbukitan | 737 | 3.049 | 90,8% | 1,3% | 0,5% |
| 7603 | Mamasa | Pegunungan | 1.321 | 3.067 | 85,4% | 1,5% | 0,2% |
| 7604 | Polewali Mandar | Perbukitan | 330 | 1.547 | 80,5% | 7,8% | 1,5% |
| 7605 | Majene | Perbukitan | 461 | 1.621 | 85,1% | 0,5% | 1,2% |
| 7606 | Mamuju Tengah | Perbukitan | 555 | 2.743 | 92,0% | 0,8% | 0,4% |
