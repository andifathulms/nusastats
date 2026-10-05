# Peta Wilayah: BPS → Kemendagri crosswalk report (before Phase 4)

Date: 2026-10-05. The spec (§5.4) requires this report before Phase 4. Peta Wilayah outputs are keyed by
Kemendagri code, and BPS-keyed pages reach them through the existing regency crosswalk
(`/api/dukcapil/regency-crosswalk/`, which matches on name plus Kota/Kab status, never on code).

Inputs: 514 BPS regency domains (`catalog.Domain`, admin_level=regency), the live crosswalk endpoint, and the 520
Kemendagri regencies in `frontend/public/dukcapil-regencies.geojson`.

## Result

| Check | Result |
|---|---|
| BPS regencies without a crosswalk match | **0** of 514 |
| Crosswalk rows with an empty Kemendagri code | 0 |
| Kemendagri codes matched by more than one BPS regency | 0 |
| Matched Kemendagri codes missing from the boundaries | 0 |
| BPS and Kemendagri codes differ (resolved by name) | 199 of 514 |
| Kemendagri boundary regencies with no BPS match | **6** (below) |
| Kalimantan (provinsi 61–65) | 56 of 56 matched; 23 with different codes |

**No crosswalk match failures, so Phase 4 can proceed.**

## The 6 Kemendagri features without a BPS match: stale BIG codes

The features are `9201, 9204, 9205, 9209, 9210, 9271`. They have no name, and the Dukcapil API does not know them
("Unknown region code"). They are the six regencies that moved from Papua Barat (92) to Papua Barat Daya (96) in
2022, still filed under their **pre-2022 codes** in BIG's province-92 desa archive (`big-villages-92.geojson`). Each
one has the same footprint as its new code:

| Old (BIG) | New (Kemendagri/Dukcapil) | Name |
|---|---|---|
| 9201 | 9601 | Sorong |
| 9204 | 9602 | Sorong Selatan |
| 9205 | 9603 | Raja Ampat |
| 9209 | 9604 | Tambrauw |
| 9210 | 9605 | Maybrat |
| 9271 | 9671 | Kota Sorong |

Consequences:

- **They are not crosswalk failures.** The 96xx regencies are matched; the 92xx features are duplicates under
  obsolete codes.
- **Provinsi 96 is not really missing from BIG.** Its full-detail desa are in the province-92 file under the old codes.
  Today the pipeline skips 96 as "no BIG archive". It could instead derive 96 from these features with an explicit
  old→new remap table. Desa-level codes would need the same remap, and that needs checking first. This is
  **deferred** until Papua is batched, and the skip stays logged until then.
- **Batching provinsi 92 will produce outputs for these six stale codes** unless they are excluded. The batch runner
  skips any outline code without a Kemendagri name, and logs it. The six stale codes have no name, so they are
  skipped.
- **Display side effect:** `dukcapil-regencies.geojson` draws these six areas twice, once under each code.
  This change leaves it alone.

## Kalimantan regencies whose BPS and Kemendagri codes differ

| BPS | BPS name | Kemendagri | Kemendagri name |
|---|---|---|---|
| 6102 | Bengkayang | 6107 | Bengkayang |
| 6103 | Landak | 6108 | Landak |
| 6104 | Mempawah | 6102 | Mempawah |
| 6105 | Sanggau | 6103 | Sanggau |
| 6106 | Ketapang | 6104 | Ketapang |
| 6107 | Sintang | 6105 | Sintang |
| 6108 | Kapuas Hulu | 6106 | Kapuas Hulu |
| 6206 | Sukamara | 6208 | Sukamara |
| 6207 | Lamandau | 6209 | Lamandau |
| 6208 | Seruyan | 6207 | Seruyan |
| 6209 | Katingan | 6206 | Katingan |
| 6210 | Pulang Pisau | 6211 | Pulang Pisau |
| 6211 | Gunung Mas | 6210 | Gunung Mas |
| 6212 | Barito Timur | 6213 | Barito Timur |
| 6213 | Murung Raya | 6212 | Murung Raya |
| 6402 | Kutai Barat | 6407 | Kutai Barat |
| 6403 | Kutai Kartanegara | 6402 | Kutai Kartanegara |
| 6404 | Kutai Timur | 6408 | Kutai Timur |
| 6405 | Berau | 6403 | Berau |
| 6501 | Malinau | 6502 | Malinau |
| 6502 | Bulungan | 6501 | Bulungan |
| 6503 | Tana Tidung | 6504 | Tana Tidung |
| 6504 | Nunukan | 6503 | Nunukan |
