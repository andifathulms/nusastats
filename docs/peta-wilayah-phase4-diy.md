# Peta Wilayah Phase 4: DI Yogyakarta (all three layers)

Runs: 2026-10-08, 00:55–01:36 UTC (`uv run python -m all --level kabupaten|kecamatan [--layer nightlights] --prov 34`).

## Outcome

- **5 kabupaten/kota and 78 kecamatan, all three layers: no failed checks, no errors, no skipped names or
  night-lights years.**
- Backend export: 3,363 areas (242 kabupaten, 3,121 kecamatan), loaded with `load_peta`.

## Validation

| Check | Result |
|---|---|
| Smallest kecamatan (the smallest of any province so far) | Pakualaman 0,6 km², Ngampilan 0,8 km², Gedongtengen 0,9 km² (Kota Yogyakarta). All pass terrain, land cover and night lights. |
| UTM vs geodesic / pixel vs UTM area | max 0.08% / **1.31%** (limit 2%; one 30 m pixel is a large share of a 0.6 km² area) |
| Nodata: DEM / land cover / night lights | 0% / 0% / none skipped |
| Land cover shares sum; palette | 99,99–100,01%; exact |
| Kabupaten sum to the province polygon | within 0.001% |
| Kabupaten max/min = highest/lowest kecamatan max/min | exact in 5 of 5 |
| Kecamatan areas sum to the kabupaten; land cover weighted | within 0.305%; within 0.007 point |
| **Merapi** (published 2.930 m after the 2010 eruption) | Sleman max **2.906 m** at 110.445°E 7.541°S. −24 m. The summit is on the DIY–Jawa Tengah border, so this is DIY's highest point; the true summit may be on the Jawa Tengah side. Plausible; recheck when Jawa Tengah runs. |

Source: [Bisnis (Merapi)](https://kabar24.bisnis.com/read/20231204/15/1720588/perbedaan-gunung-merapi-dan-gunung-marapi-kembar-tapi-beda/2).

## Findings

- **Kota Yogyakarta is 91,1% built-up**, the highest built-up share of any area so far, and 100% lit in both years.
- **Night lights.** Gunungkidul 20,7 → 51,6% lit (×2,5), Kulon Progo 35,0 → 64,1% (×1,8; the new airport area),
  Bantul 84 → 99%.
- **Classification issue (open).** Kota Yogyakarta, Sleman and Kulon Progo come out *Campuran*. Kota Yogyakarta is
  flat, but it sits at about 75–140 m:
  - *Dataran rendah* requires ≥ 60% of the area under 100 m;
  - *Perbukitan* requires steep slopes or ≥ 50% of the area above 200 m;
  - so a flat inland plain falls through to "mixed".

  The rule treats "low" as "under 100 m", which fits coastal plains but mislabels flat inland plains. Changing it
  would reclassify areas already reported, so it is left for a decision.

| Kode | Nama | Kelas medan | Rata-rata (m) | Maks (m) | Tutupan pohon | Lahan pertanian | Lahan terbangun | Bercahaya 2018 → 2024 |
|---|---|---|---|---|---|---|---|---|
| 3401 | Kulon Progo | Campuran | 173 | 967 | 75,5% | 14,8% | 4,9% | 35,0% → 64,1% |
| 3402 | Bantul | Dataran rendah | 87 | 520 | 57,5% | 20,6% | 18,3% | 84,1% → 98,8% |
| 3403 | Gunungkidul | Perbukitan | 233 | 820 | 81,3% | 8,3% | 4,3% | 20,7% → 51,6% |
| 3404 | Sleman | Campuran | 295 | 2.906 | 53,7% | 18,7% | 23,9% | 89,8% → 96,0% |
| 3471 | Kota Yogyakarta | Campuran | 103 | 140 | 7,8% | 0,5% | 91,1% | 100,0% → 100,0% |
