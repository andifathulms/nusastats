# Peta Wilayah: new layers — very low land, local relief, night lights

Date: 2026-10-05/06. Coverage: the 8 provinces done so far (Kalimantan 61–65, Sulawesi Tengah 72, Selatan 73,
Barat 76): 99 kabupaten/kota and 1,183 kecamatan.

## 1. Very low land and local relief (from the existing DEM, no new data)

**Method.**
- **Very low land:** share of the area under 5 m and under 10 m on the 30 m UTM grid.
- **Local relief:** max − min elevation within a 1 km window, with NusaStats classes datar (< 30 m), bergelombang
  (30–100 m), berbukit (100–300 m) and bergunung (≥ 300 m).
- Thresholds live in `config/terrain.yaml`. Relief is shown **alongside** the terrain class; the class rule is
  unchanged.

**Caveat (stated in the UI and the indicator method).** The DEM is a surface model, so the very-low-land shares
are **lower bounds**. The prototype measured median model heights within 3 km of water: rice fields read 1.6–2.4 m,
mangroves 5.8–9.2 m, coastal forest 10.7–23 m and cities 3.6–9.5 m. The UI therefore says
"*setidaknya* X% luas di bawah 10 m". The share also counts all low land, not only the coast.

**Run.**
- All 1,282 areas re-computed, 0 errors. Relief classes sum to 100% and lowland shares are ordered everywhere.
- The wider UTM padding moved existing figures only at the edges: elevation stats by at most 0.1 m and slope shares
  by at most 0.09 point (largest on the 2 km² island kecamatan Pulau Sembilan).
- Hillshade and elevation images are byte-identical to before.

**Findings.**
- **Most land under 10 m:** Kota Banjarmasin 99,7% (93,0% under 5 m), Barito Kuala 99,1%, Kota Pontianak 98,1%,
  Hulu Sungai Utara 94,7%, Kota Makassar 81,8%.
- **Relief catches what the class misses.** Eight kabupaten are classed *Perbukitan* yet have ≥ 40% *bergunung*
  relief: Mamuju 51%, Majene 51%, Enrekang 50%, Kota Palopo 49%, Luwu 46%, Parigi Moutong 46%, Mamuju Tengah 45%,
  Toli-Toli 41%. Their land is steep and deeply cut, though mostly below 1.000 m.

## 2. Night lights 2018–2024 (World Bank Light Every Night, VIIRS)

**Source.**
- Monthly VIIRS DNB composites (stray-light corrected `ecm-slcorr`, `ops` processing) on AWS.
- The files are 3–4 GB cloud-optimised GeoTIFFs, so only each province's window is read over HTTP.
- Licence: CC BY 4.0 per the AWS Open Data registry entry. The `composites/` folder is not described in the
  README, so attribution credits the World Bank / University of Michigan and NOAA/EOG.

**Method.**
- **Annual value:** per province and year, the per-pixel **median** of the months with at least one cloud-free
  night. Most Indonesian months have 0–2 cloud-free nights, and the median drops short-lived fire and flaring
  spikes.
- **Per area and year:** lit share and lit area (annual median ≥ 1 nW/cm²/sr), sum of lights over lit pixels, mean
  radiance, and growth since 2018.
- **Weighting:** pixels count by geodesic area × the fraction inside the polygon (8×8 supersampled), so ~460 m
  pixels do not distort small kecamatan.
- **Why 2018 onward:** only `ops` months are used. Earlier `rp2` months have a different background (in the
  prototype, Sepaku's total light "fell" 2015 → 2019, which is not plausible).
- **Skipped month:** 2024-10 publishes under another naming (`ecmslcfg`). It is skipped and recorded, not
  substituted, so 2024 uses 11 months.
- **Noise floor:** calibrated radiance has noise just below zero (at most 0.012% of pixels, lowest −0.19 nW). Values
  down to −0.5 nW count as no light. A year whose annual raster goes lower inside an area is left out for that area,
  with the reason, like a cloudy year (first seen in Papua Barat Daya 2024: a pixel in Botain whose only cloud-free
  night of the year read −0.51 nW). The noise share is recorded per year.

**Provenance.** We cannot hash a 4 GB file we only read a window from. Each monthly window is recorded in
`sources.json` with its URL, ETag, Last-Modified, window bounds and the **sha256 of the exact pixels read**. A re-read
with a different hash stops the run. Annual rasters are cached with the list of windows they used and their own
sha256.

**Run.**
- 8 provinces × 7 years of annual rasters.
- 99 of 99 kabupaten and **1,181 of 1,183 kecamatan**.
- Two kecamatan correctly fail their checks and have no output:
  - **Kepulauan Sangkarrang (737115):** 0.86 km² of islets. The covered-pixel area is 3.5% off, over the 3% limit,
    because ~460 m pixels cannot resolve them.
  - **732408:** 2.3% of the area had no cloud-free night in 2024, over the 1% limit.
- Every `bounds.json` lists exactly the layers it has images for (both batches ran in parallel; checked, 0 repairs
  needed).

**Operational lessons.**
- A run hung for ~3.5 h when the Mac slept mid-request. Remote reads now have hard timeouts, and long runs use
  `caffeinate`, which cannot stop sleep when the lid is closed.
- `sources.json` is written atomically, and `bounds.json` merges take a file lock.
- Annual rasters are keyed on the `annual` config section only, so stats/render edits do not discard remote reads.

**Findings** (lights show settlement and activity, **not** population or income):

| | 2018 | 2024 | |
|---|---|---|---|
| Sepaku (IKN), lit share | 0,4% | 11,7% | jump in 2023–2024 |
| PPU, lit area | 91 km² | 313 km² | ×3,4 |
| Luwu Utara, lit area | 4 km² | 60 km² | ×14,7 (low base) |
| Morowali Utara, lit area | 6 km² | 78 km² | ×13,6 (low base; Sulawesi's nickel belt) |
| Mamuju Tengah, lit area | 2 km² | 18 km² | ×10,4 (low base) |

- **Highest lit share 2024:** Kota Pontianak 99,9%, Kota Makassar 99,7%, Kota Banjarmasin 98,4%, Kota Samarinda
  77,9%.
- **Largest lit area among kecamatan:** Bengalon and Sangatta Utara (Kutai Timur, coal mining), then Tenggarong
  Seberang and Loa Janan. Mine lighting and flaring count as "lit", which is why the caveat matters.
- **Only falling kabupaten:** Kota Bontang, lit area −11% (123 → 110 km²). It is an LNG and fertiliser industry town,
  so a change in industrial lighting or flaring is plausible, but the data alone does not say why.
- Growth from a very low base is real light, but it may come from industry, electrification or new settlement;
  the data cannot tell which.

## Open items

- **One bad year rejects a whole area.** 732408 has no output because of 2024 alone. Dropping that one year from the
  series would keep the other six; this needs deciding.
- **Islets below the night-lights resolution** (e.g. Kepulauan Sangkarrang) have no night-lights output. The UI
  shows the layer as unavailable.
- **Export:** 5.1 MB for 1,282 areas (night-lights provenance is stored once per province). It would grow to about
  30 MB for all of Indonesia.
