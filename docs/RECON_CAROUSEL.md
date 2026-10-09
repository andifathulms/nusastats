# Recon: can NusaStats feed a TikTok data-carousel channel?

_Read-only reconnaissance, 2026-10-04, branch `feat/redesign-laut-kertas` @ `d757ea5`.
All numbers below come from read-only queries (`SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY`)
against the local Postgres (`nusastats-db-1`) or from read-only Django-shell calls to the app's own
helpers. No external API was called and nothing was written, migrated, or committed._

> **Status update, 2026-10-10.** §2.1 and §2.2 are fixed: the four 2022 Papua provinces and their
> 26 kabupaten are BPS domains now (`add_vervar_domains`, then `reingest_from_logs`), old-code twins
> are superseded at ingest, and BPS kab/kota rankings have 514 regions. The DJPK crosswalk also
> matches 1405 "Kab. Pontianak" (Mempawah), so it's 572/572. §5 is built as
> `export_carousel_pack` / `/api/carousel/pack/` (`backend/api/carousel.py`). Numbers below are as
> of the original recon.

## TL;DR

- **Yes, with one blocking fix for BPS.** NusaStats has three independent, audit-trailed sources:
  **BPS** (2.70 M values, 156 indicators at kabupaten/kota), **Dukcapil/Kemendagri** (a population
  snapshot at provinsi → desa, about 120 raw fields plus 25 derived), and **DJPK/Kemenkeu** (APBD
  realisasi 2011–2024). Every value traces to a stored, SHA-256-hashed HTTP response.
- **Blocking BPS defect:** `catalog_domain` still has the pre-2022 **34 provinces**. For most recent
  BPS indicators, BPS returns the four new Papua provinces under **new codes (92xx/95xx/96xx/97xx)**,
  and `stats.ingest` silently drops them. As a result, **26 kabupaten are missing from many
  2024–2025 kabupaten rankings, and they are usually the bottom of welfare rankings.** Example: the
  stored IPM 2024 bottom-1 is Mamberamo Raya (55.00). The real bottom-1, in the *same stored BPS
  response*, is **Nduga (36.30)**, with 11 kabupaten below 55. Any "terendah se-Indonesia" carousel
  built from `stats_datapoint` today would be **wrong**. The raw responses hold the missing values, so
  this is recoverable (§2.1, §5).
- Region codes are **not interchangeable** across sources (BPS ≠ Kemendagri ≠ DJPK). About 178 BPS
  kabupaten codes point to a *different* kabupaten in Kemendagri numbering (e.g. 3171 = Jakarta
  Selatan in BPS but Jakarta Pusat in Kemendagri). Each data pack must carry its source's own codes.
- 25 ranked story candidates with real top-5/bottom-5 are in §4. Two filled data packs are in §5.

---

## 1. Data inventory

### 1.1 Summary table

| # | Dataset (table) | Source / original endpoint | Levels | Code scheme | Periods | Units | Rows | Last fetched | Load method |
|---|---|---|---|---|---|---|---|---|---|
| A | `stats_datapoint` (values) | **BPS** WebAPI `webapi.bps.go.id/v1/api/list/model/data/domain/0000/var/<id>/th/<ids>` (dynamic tables) | national, provinsi (34), kab/kota (514) | BPS `domain_id` (4-digit; prov = `XX00`) | 1955–2035 overall (incl. projections); kab-level 1979–2026 | per variable (`catalog_variable.unit`), e.g. Persen, Tahun, Rupiah/kapita/bulan, Milyar Rupiah, "Tidak Ada Satuan" | 2,704,986 (national 298,496 · prov 498,102 · kab 1,898,893); 1,692 variables (1,612 national / 683 prov / **156 kab**) | 2026-07-13 → 2026-10-04 | API crawl: `crawl_domains` → `crawl_metadata` → `crawl_coverage` → `ingest_confirmed_data` (Celery-scheduled) |
| B | `catalog_coveragechecklog` (raw responses) | BPS (same calls) | — | — | — | — | 67,298 (552 MB, raw JSON bodies kept) | same | written by every crawl call |
| C | `catalog_coveragerecord` | BPS (Cakupan coverage verdicts) | nat/prov/kab | BPS | — | — | 35,721 (confirmed: nat 1,612 · prov 3,128 · kab 1,500) | same | `crawl_coverage` |
| D | `catalog_simdasitable`, `catalog_simdasicoveragerecord` | BPS SIMDASI | — | MFD codes | — | — | **0 / 0** (never crawled) | — | `crawl_simdasi` (not run) |
| E | `dukcapil_dukcapilregion` | **Ditjen Dukcapil, Kemendagri**: public ArcGIS `gis.dukcapil.kemendagri.go.id/arcgis/rest/services/AGR_VISUAL_{PROP,KAB,KEC,KEL}_FIX/MapServer/<n>/query` | provinsi 38, kab/kota 514, kecamatan 7,285, desa/kel 83,457 | Kemendagri wilayah codes (2/4/6/10 digits) | two snapshots, `2026-07` and `2026-10`; **byte-identical** (0 attribute changes). Dukcapil's own reference date/semester: **unknown** (not in the payload; fields `lhr_2020…lhr_2024` show births through 2024) | jiwa, KK, km² (strings for `luas_wilayah`/`kepadatan_penduduk`) | 182,448 (91,224 per snapshot); about 124 raw keys per row in JSONB `attributes` | 2026-07-10, 2026-10-03 | API crawl: `ingest_dukcapil --level all [--period]` + `seed_dukcapil_indicators` |
| F | `dukcapil_dukcapilindicator` | hand-authored catalog (`dukcapil/indicators.py`) | — | — | — | — | 90 (+25 derived in `dukcapil/derived.py`, computed on the fly) | — | seed command |
| G | `DukcapilRegion.luas_big` | **BIG** (Badan Informasi Geospasial) 1:10K desa polygons → `backend/dukcapil/data/big_area.json` | all 4 | Kemendagri (via `KDEPUM`) | boundary vintage **unknown** | km² (geodesic) | column on E | file committed; load date unknown | `data/big_boundaries/compute_area.py` → `load_big_area` |
| H | `djpk_apbdreport` / `djpk_apbdline` | **DJPK, Kemenkeu** portal `djpk.kemenkeu.go.id/portal/csv_apbd?type=realisasi&periode=12&tahun=…` (SpreadsheetML) | provinsi (pemda 00), kab/kota | DJPK own codes (`djpk_prov`+`djpk_pemda`) + `kemendagri_code` crosswalk | **2011–2024**, full-year realisasi only (`periode=12`) | Rupiah (anggaran + realisasi), % (persentase) | 7,208 reports · 232,897 lines · 572 regions (38 prov + 534 kab entries, see §2) · 40 accounts | 2026-07-12 → 2026-07-13 | API crawl: `ingest_apbd --tahun …` (Celery monthly `recrawl-apbd-monthly`) |
| I | `data/dukcapil_extra/*.json` (**staged, not ingested**) | Dukcapil ArcGIS themed layers: IMR, divorce/marriage rates, akta ownership, KIA, IKD, cause of death, migration; historical population Feb 2023 / Jan 2024 | prov, kab (+kec/desa for Jan 2024) | Kemendagri | 2023-02, 2024-01 (from layer names) | mixed | 28 files (largest is the desa file at 180 MB, gitignored) | file mtimes 2026-07-11 | `fetch_extra.py` (not hashed into a fetch log, so **not traceable yet**) |

Per-year DJPK report counts: 2011–2013: 498 · 2014: 513 · 2015–16: 516 · **2017: 498** ·
2018: 515 · 2019–22: 516 · 2023–24: 546.

### 1.2 BPS indicators available at kabupaten/kota (the 156)

Grouped by subject, with stored year range and number of kab/kota with values. `n=488` means the
26 new-Papua kabupaten were dropped (§2.1).

| Subject | Indicators (BPS var id) | Years | Regions |
|---|---|---|---|
| IPM (metode baru) | IPM 413, UHH 414, RLS 415, Pengeluaran/kapita disesuaikan 416, HLS 417, IPM (UHH LF SP2020) 2205, UHH LF SP2020 2206 | 2010–2025 (2205/2206: 2020–2025) | 514 to 2023, **488 for 2024–25** |
| IPM (metode lama) | 3–7 | 1996–2013 | 511 |
| Gender | AHH by sex 455, IPG 463, IDG 468, women in parliament 464, women professionals 466, women's income share 467, IKG 2196, SMA+ by sex 2199, TPAK by sex 2200, etc. | 2010–2025 | 514/488 |
| Poverty | P0 621, P1 622, P2 623, poverty line 624, poor count 619 | 2004–2025 | 488 |
| Consumption (Susenas) | weekly per-capita consumption & spending by food group (2094–2124, 2550–2559), food insufficiency (PoU) 2269 | 2017/2018–2025 | 488 |
| Construction | Indeks Kemahalan Konstruksi 2515 | 2014–2025 | 488 |
| PDRB | PDRB by expenditure/industry, annual & quarterly (2193, 2194, 2533–2537, 2773–2776) | 2010–2026 | 488 |
| SDGs | smoking 15+ 2644, decent housing 2699, stunting 2018 1531, handwashing 1813, poverty in daerah tertinggal 2664 | single years | 488/514 |
| Inflation/CPI | monthly inflation 1, CPI (2012=100 / 2018=100) by group | 1979–2026 | **79–142 cities only** |
| One-off | morbidity 2019, commuters 2018, travel ≥100 km 2016, 50+ share 2020, floor area <8 m² 2019 | single year | 488 |

**Not available at kab level in BPS data:** population, unemployment (TPT), Gini, PDRB per capita,
school/health facilities (see §6).

---

## 2. Data quality

### 2.1 BPS: new-Papua kabupaten silently dropped (severity: **high**)

- `catalog_domain`: 1 national + **34 provinces** + 514 regencies, i.e. the pre-2022 province map.
  The four 2022 provinces (Papua Selatan, Papua Tengah, Papua Pegunungan, Papua Barat Daya) are absent.
- Recent BPS responses use **new vervar codes** for those 26 kabupaten and 4 provinces. Example, from
  stored log `#60400` (`…/var/621/th/113/…`): `9200 PAPUA BARAT DAYA, 9201 Raja Ampat … 9271 Kota Sorong,
  9500 PAPUA SELATAN, 9501 Merauke …, 9600 PAPUA TENGAH …, 9700 PAPUA PEGUNUNGAN … 9708 Pegunungan Bintang`.
- `stats/ingest.py` maps `vervar_val → Domain` and **skips unknown codes** (`if domain is None: continue`).
  The 26 kabupaten disappear, and their old-code domains (9106–9110, 9171, 9401–9436 subset) get
  no rows. That produces `n=488` instead of 514.
- **Effect on rankings:** these kabupaten sit at the extreme of most welfare indicators. For IPM 2024
  (var 413), the stored bottom-5 is Mamberamo Raya 55.00, Pegunungan Arfak 58.73, Sabu Raijua 59.58,
  Teluk Wondama 62.36, Manokwari Selatan 62.45. Decoding the same stored responses gives Nduga 36.30,
  Puncak 45.60, Pegunungan Bintang 49.36, Intan Jaya 50.71, Mamberamo Tengah 50.72. **All five real
  bottom values are missing from `stats_datapoint`.** The same applies to P0, UHH, RLS, HLS, PoU, IKK,
  smoking, housing, and others.
- The values *are* in `catalog_coveragechecklog.raw_body` (hashed, traceable), so they can be
  recovered without new API calls. All §4 BPS rankings use a query that adds them back from the raw
  responses (template in §4.0) and report `n=514`.
- The same issue exists at **province level**: BPS province rankings show 34, not 38, provinces.

### 2.2 BPS: the same kabupaten under two codes with different values (severity: medium)

For "Keterlibatan Perempuan di Parlemen" (var 464), 2025, one BPS response carries **both** old and
new codes for 16 moved kabupaten, **with different values**:

| Kabupaten | old code → value | new code → value |
|---|---|---|
| Merauke | 9401 → 16 | 9501 → 16.67 |
| Yahukimo | 9416 → 5 | 9707 → 0 |
| Sorong | 9107 → 8 | 9202 → 12 |

A pack generator must pick one deterministically. Recommendation: prefer the new code, drop the old
one, and note it.

### 2.3 Code mismatches between sources (severity: high if joined by code)

- **Kabupaten:** of 514 BPS regency codes, 479 also exist as Kemendagri codes, and **180 of those name
  a different region**. About 2 are spelling-only (e.g. 1277 Padangsidimpuan / Padang Sidempuan).
  The rest are real collisions:
  `3171` BPS Jakarta Selatan ↔ Kemendagri Jakarta Pusat · `1102` Aceh Singkil ↔ Aceh Tenggara ·
  `1506`/`1507` Tanjung Jabung Timur/Barat swapped · `7310` Barru ↔ Pangkajene Kepulauan · `9404` Nabire ↔ Mimika.
- **Provinces 91–97:** BPS `91` = Papua Barat, `94` = Papua, new `92` PBD / `95` P. Selatan /
  `96` P. Tengah / `97` P. Pegunungan. Kemendagri `91` = Papua, `92` = Papua Barat, `93` P. Selatan,
  `94` P. Tengah, `95` P. Pegunungan, `96` PBD. **No code in 91–97 means the same province in both.**
- **DJPK** uses a third scheme (e.g. `2201` = Kab. Badung, Kemendagri `5103`). `djpk_apbdregion.kemendagri_code`
  is a name-match crosswalk, and all 572 entries are matched (0 blank).
- The existing BPS↔Dukcapil bridge (`api/dukcapil_views._resolve_dukcapil_regency`) matches on
  name + Kota/Kabupaten status, never on code.

### 2.4 Pemekaran / renamed / duplicate regions

- DJPK has 534 regency entries for 508 autonomous kab/kota. The extra 26 are Papua kabupaten that
  appear under both old (26xx/32xx) and new (35xx–38xx) province codes. Per project notes, old codes
  return HTTP 500 for 2020–2022 and the 2023+ data sits under the new codes. Pick one code per year
  and never sum across them.
- **DJPK 2024 has 508 kab/kota, not 514:** the 6 missing are DKI's Kota/Kab Administrasi (3101,
  3171–3175). They are not autonomous and have no APBD. This is correct, but it needs a caveat.
- **DJPK 2017 is missing all of Papua and Papua Barat** (2 provinces + 15 kab/kota present in 2016 and
  2018), even though every 2017 fetch logged HTTP 200. Cause: **unknown**.
- DJPK 2011–2013 counts are lower because of Daerah Otonom Baru that did not exist yet. That is
  legitimate.
- BPS IPM growth 2010→2024 can only be computed for 462 kabupaten (old/new codes plus kabupaten formed
  after 2010).
- Dukcapil: 32 duplicate desa rows were removed by migration 0011. **78 desa** and **45 kecamatan**
  still carry dirty `<code>-<objectid>` codes. 595 desa and 39 kecamatan have null `jumlah_penduduk`.
  Province and kabupaten levels are clean: the kab sum equals the province total for all 38 provinces
  (284,973,643).

### 2.5 Suspicious outliers

| Where | Value | Why suspicious |
|---|---|---|
| BPS stunting 2018 (var 1531), Kab. Yalimo | **0.0 %** | Prevalence cannot be 0. Probably missing data stored as 0. Don't use. |
| BPS decent housing 2025 (var 2699), Kab. Puncak | 0.0 % (Tolikara 0.57, Lanny Jaya 0.70) | Possible, but verify against the BPS table before publishing. |
| BPS smoking 15+ 2024 (var 2644), Yahukimo 3.64 %, Deiyai 7.26 %, Paniai 8.30 % | very low next to a ~28–30 % typical level | Likely Susenas coverage limits in the highlands. Don't present as "least smokers". |
| Dukcapil, Papua highland kabupaten (Yahukimo, Puncak, Nduga, Tolikara, Puncak Jaya) | % children 0–14: 8–9 %; crude death rate 0.05–0.10 ‰; KTP-el recording 8–12 % | Registration under-coverage. Dukcapil counts **registered** residents, not actual population. Their "oldest / fewest children / lowest death rate" rankings are artifacts. **Exclude or caveat.** |
| Dukcapil Kab. Halmahera Tengah | total 106,500 · L 67,500 · P 39,000 (the only round kabupaten totals out of 514) | Checked: the 10 kecamatan sum exactly to these totals, and Weda alone has 27,711 L / 11,036 P. Consistent with the nickel-industry workforce. Plausible, but name the round numbers in the caveat. |
| Dukcapil `luas_wilayah` at desa | kabupaten total copied to every desa | Known. Use `luas_big` (BIG) instead. |
| Dukcapil blood-type rhesus fields | `a_`→"A+" but `b_`→"B-" in `indicators.py` | Raw keys don't say which is +/−. Mapping is **unverified**. Avoid rhesus stories. |

### 2.6 Unit inconsistencies

- **BPS var 1975 "Jumlah Penduduk Pertengahan Tahun"** (unit "Ribu Jiwa"): 2024 = 281,603.8 and 2025 =
  284,438.8 (thousands), but **2026 = 287,198,383** (persons). The unit changes inside one variable.
- BPS var 619 "Jumlah Penduduk Miskin (Ribu Jiwa)" has `unit = "Tidak Ada Satuan"`, so the unit only
  appears in the name.
- Many BPS indices have `unit = "Tidak Ada Satuan"` (IPM, IKK, P1/P2). The pack needs a human unit
  string ("indeks").
- Consumption variables mix units within one variable: `Satuan Komoditas` means kg, liter, butir, and
  so on per `turvar`.
- Dukcapil `luas_wilayah`/`kepadatan_penduduk` arrive as formatted strings (`is_string=True`, parsed
  by `dukcapil.values.to_number`).
- DJPK amounts are raw Rupiah floats. Some carry fractional cents (e.g. 4,616,874,819,974.5).

### 2.7 BPS vs Dukcapil disagreements on the same metric (not combined, shown for awareness only)

| # | Metric | BPS | Dukcapil (snapshot 2026-10) | Gap |
|---|---|---|---|---|
| 1 | Population, Indonesia | var 1975, mid-2025: **284,438,800** (2026: 287,198,383) | **284,973,643** | +534,843 (+0.19 %) vs BPS 2025; −2,224,740 vs BPS 2026 |
| 2 | Population aged 15+, NTT | var 2397, 2025: **4,091,938** | Σ u15…u75: **4,257,440** | **+4.0 %** |
| 3 | Population aged 15+, Lampung | var 2397, 2025: **7,192,537** | **6,903,643** | **−4.0 %** |

Others with a >3 % gap on 15+ population: Sulawesi Barat −3.8 %, Maluku −3.7 %, Maluku Utara +3.4 %,
Riau +3.2 %. Reasons include de-jure registration vs survey-based estimates and different reference
dates (Dukcapil's is unknown). Hence the rule: one source per carousel.

Query for #2/#3:

```sql
WITH b AS (SELECT left(dm.domain_id,2) code, dm.domain_name n, d.value bps
           FROM stats_datapoint d JOIN catalog_domain dm ON dm.id=d.domain_id
           WHERE d.variable_id=1019 AND d.year=2025 AND d.admin_level='province'),   -- pk 1019 = BPS var 2397
k AS (SELECT code, (SELECT sum((attributes->>f)::bigint) FROM unnest(array['u15','u20','u25','u30','u35','u40',
             'u45','u50','u55','u60','u65','u70','u75']) f) duk
      FROM dukcapil_dukcapilregion WHERE level='province' AND period='2026-10')
SELECT b.code, b.n, b.bps, k.duk, round(((k.duk-b.bps)/b.bps*100)::numeric,1) pct
FROM b JOIN k ON k.code=b.code WHERE b.code::int < 91          -- province codes only align below 91
ORDER BY abs((k.duk-b.bps)/b.bps) DESC;
```

---

## 3. Access: how to query each metric today

### 3.1 ORM / SQL

| Source | Model(s) | Key query pattern |
|---|---|---|
| BPS | `stats.DataPoint` (FK `catalog.Variable`, `catalog.Domain`, `catalog.PeriodData`; `source_check_log` → `catalog.CoverageCheckLog`) | `DataPoint.objects.filter(variable=v, admin_level="regency", year=Y, turvar_id="0")`. Note: `variable_id` in the DB is the **pk**, not the BPS var id (`Variable.variable_id`). |
| BPS raw | `catalog.CoverageCheckLog.raw_body` (JSONB) | datacontent key = `vervar + var_id + turvar + th_id + turtahun` |
| Dukcapil | `dukcapil.DukcapilRegion` (`attributes` JSONB, `luas_big`, `prov_code/kab_code/kec_code`, `period`), `DukcapilIndicator`, `DukcapilFetchLog` | `(attributes->>'jumlah_penduduk')::bigint`; derived metrics via `dukcapil.derived.DERIVED_BY_FIELD[field]["fn"]` |
| DJPK | `djpk.ApbdRegion` → `ApbdReport` → `ApbdLine` (`akun_key`, `anggaran`, `realisasi`, `persentase`); `ApbdAccount`; `DjpkFetchLog` | `ApbdLine.objects.filter(report__tahun=2024, report__report_type="realisasi", report__periode=12, report__region__level="regency", akun_key="pad")`; ratios via `djpk.derived` |

### 3.2 Reusable Python helpers (pure reads, no cache)

- `api/stats_views.py: region_values(variable, admin_level, year, turvar_id=None)` → `{domain_id: (name, value)}`.
  **Note:** it defaults to the *lowest* `turvar_id`, which for by-sex variables may be a sex
  breakdown rather than the total.
- `api/dukcapil_views.py: _extract(qs, fields)`, `_value_map(qs, field)`, `_resolve_period(request)`.
- `api/djpk_views.py: _metric_values(tahun, rtype, periode, level, akun_key, measure, prov=None)` → `(values, unit, meta)`. Handles raw accounts and derived ratios.
- `api/analytics.py: rank_rows(rows, order)`, `distribution(values)`, `growth_rows(...)`.
- `api/dukcapil_views.py: bps_regency_status(domain_id)` gives Kota/Kabupaten for BPS codes. BPS names
  omit it ("Bandung" can be either), and the convention is kab number ≥ 71 = Kota.

### 3.3 HTTP read API (`:8010/api/…`, Redis-cached per ingest version)

| Endpoint | Use |
|---|---|
| `GET /api/stats/variables/{pk}/ranking/?admin_level=regency&year=2024&order=desc&turvar_id=0&prov=XX` | BPS ranking (inherits the 488 bug) |
| `/api/stats/variables/{pk}/series/`, `/trend/`, `/growth/`, `/dimensions/` | BPS time series / breakdowns |
| `/api/stats/regions/{domain_id}/profile/`, `/variables/` | BPS region profile |
| `/api/stats/summary/`, `/api/stats/correlate/` | overview, scatter |
| `GET /api/dukcapil/rank/?indicator=<field|derived>&level=regency&order=desc&period=2026-10&prov=&percent_of=jumlah_penduduk` | Dukcapil ranking (raw or derived) |
| `/api/dukcapil/{summary,indicators,regions,regions/<code>,correlate,regency-crosswalk,regency-bridge/<bps_id>}/` | metadata, profiles, BPS bridge |
| `GET /api/djpk/rank/?akun=<akun_key|ratio>&level=regency&tahun=2024&measure=realisasi` | DJPK ranking (see `_resolve_scope` for exact param names) |
| `/api/djpk/{summary,accounts,regions,regions/<djpk_code>,correlate,growth}/` | DJPK |
| `/api/coverage/variables/`, `/api/coverage/export/` | BPS coverage catalog (JSON) |

### 3.4 CLI commands (`docker compose exec web python manage.py …`)

Writers (do **not** run for carousel work): `crawl_domains`, `crawl_metadata`, `crawl_coverage`,
`crawl_simdasi`, `ingest_confirmed_data`, `refresh_variable_stats`, `ingest_dukcapil`,
`seed_dukcapil_indicators`, `load_big_area`, `ingest_apbd`, `bump_api_cache`,
`setup_periodic_tasks`, `setup_djpk_schedule`.
Read-ish: `generate_report` (writes a coverage report MD+JSON to a directory).

### 3.5 Existing export features

- `/api/coverage/export/`: the BPS **coverage catalog** (which variables exist at which level). It
  has no values.
- `generate_report`: the coverage report (Markdown + JSON), again with no values.
- **No value/ranking export exists** (no CSV/JSON download in the backend or `frontend/`).

---

## 4. Story candidates (25)

### 4.0 Query templates used

**Q-BPS (complete kabupaten ranking).** Combines `stats_datapoint` with the 26 new-Papua rows decoded
from the *same* stored BPS responses. It is single-source (BPS) and fully traceable.
Parameters: `:pk` = `catalog_variable.id`, `:vid` = BPS var id, `:yr`, `:tv` = turvar (default `0`).

```sql
WITH logs AS (                      -- newest stored response covering :yr
  SELECT DISTINCT ON (th->>'val') l.id, l.raw_body b, th->>'val' thv
  FROM catalog_coveragechecklog l, jsonb_array_elements(l.raw_body->'tahun') th
  WHERE l.url LIKE '%/domain/0000/var/:vid/%' AND th->>'label' = ':yr' AND NOT l.is_error
  ORDER BY th->>'val', l.id DESC),
raw AS (                            -- new-Papua kabupaten (92xx/95xx/96xx/97xx) not ingested
  SELECT vv->>'val' code, vv->>'label' label,
         (SELECT value::float FROM jsonb_each_text(b->'datacontent')
          WHERE key = (vv->>'val')||':vid'||':tv'||thv||coalesce(b->'turtahun'->0->>'val','0')) val
  FROM logs, jsonb_array_elements(b->'vervar') vv
  WHERE (vv->>'val')::int/100 IN (92,95,96,97) AND (vv->>'val')::int % 100 <> 0),
dp AS (
  SELECT dm.domain_id code, dm.domain_name label, d.value val
  FROM stats_datapoint d JOIN catalog_domain dm ON dm.id = d.domain_id
  WHERE d.variable_id = :pk AND d.admin_level='regency' AND d.year = :yr AND d.turvar_id = ':tv'),
r AS (SELECT * FROM dp UNION ALL SELECT * FROM raw WHERE val IS NOT NULL)
SELECT * FROM r ORDER BY val DESC;   -- take first/last 5; check count(*) = 514
```

For variables where BPS also returns old codes for moved kabupaten (var 464), drop the old-code
`dp` rows (§2.2).

**Q-DUK (Dukcapil, via app code, read-only Django shell):**

```python
from dukcapil.models import DukcapilRegion
from dukcapil.derived import DERIVED_BY_FIELD
from api.dukcapil_views import _extract, _value_map
qs = DukcapilRegion.objects.filter(level="regency", period="2026-10")
spec = DERIVED_BY_FIELD["sex_ratio"]                       # or _value_map(qs, "jumlah_penduduk")
rows = sorted(((c, n, spec["fn"](v)) for c, (n, v) in _extract(qs, spec["requires"]).items()
               if spec["fn"](v) is not None), key=lambda r: r[2], reverse=True)
```

**Q-DJPK (via app code):**

```python
from api.djpk_views import _metric_values
vals, unit, meta = _metric_values(2024, "realisasi", 12, "regency", "rasio_kemandirian", "realisasi")
rows = sorted(((c, n, v) for c, (n, v, kemen) in vals.items()), key=lambda r: r[2], reverse=True)
```

Scoring: **S**urprising / **E**asy to explain / **V**erifiable, each 1–5. Ranked by total.
Region names carry Kota/Kab. per the source's own status. Codes are **in the source's own scheme**
(BPS codes for BPS, Kemendagri for Dukcapil, DJPK + Kemendagri for DJPK).

---

#### 1. "Satu kecamatan di Jakarta lebih padat penduduk daripada 370 kabupaten/kota" (S5 E5 V5 = 15)
- **Metric:** jumlah penduduk (jiwa) · **Level:** kecamatan · **Period:** Dukcapil snapshot 2026-10
- **Top-5:** Cakung, Jakarta Timur 582,327 · Cengkareng, Jakarta Barat 581,788 · Kalideres, Jakarta Barat 464,076 · Tambun Selatan, Kab. Bekasi 450,469 · Cilincing, Jakarta Utara 445,729
- **Bottom-5:** Distrik Tinggouw, Kab. Tambrauw 319 · Distrik Wilhem Roumbouts, Kab. Tambrauw 356 · Distrik Aifat Timur Selatan, Kab. Maybrat 414 · Distrik Kaisenar, Kab. Keerom 420 · Distrik Syujak, Kab. Tambrauw 432
- **Hook fact:** 370 of 514 kab/kota have fewer residents than Kecamatan Cakung.
- **Query:**
  ```sql
  SELECT code, name, (attributes->>'jumlah_penduduk')::bigint pop FROM dukcapil_dukcapilregion
  WHERE level='district' AND period='2026-10' AND attributes->>'jumlah_penduduk' IS NOT NULL
  ORDER BY pop DESC LIMIT 5;      -- ASC for bottom
  SELECT count(*) FROM dukcapil_dukcapilregion WHERE level='regency' AND period='2026-10'
    AND (attributes->>'jumlah_penduduk')::bigint < 582327;   -- 370
  ```
- **Source:** "Ditjen Dukcapil Kemendagri — Data Kependudukan per Kecamatan (GIS Dukcapil, AGR_VISUAL_KEC_FIX), diakses Okt 2026"
- **Caveat:** registered (de jure) residents. 39 kecamatan have no value. Dukcapil's reference date is unknown. The bottom-5 are Papua/Papua Barat Daya distrik (Tambrauw, Maybrat, Keerom), where under-registration is likely, so headline the top end.

#### 2. "Rata-rata lama sekolah: 13,4 tahun di Banda Aceh, 2,2 tahun di Nduga" (S5 E5 V5 = 15)
- **Metric:** Rata-rata Lama Sekolah (tahun), BPS var 415 · **Level:** kab/kota · **Period:** 2025
- **Top-5:** Kota Banda Aceh 13.37 · Kota Kendari 12.56 · Kota Ambon 12.37 · Kota Yogyakarta 12.13 · Kota Madiun 12.12
- **Bottom-5:** Kab. Nduga 2.19 · Kab. Puncak 2.40 · Kab. Deiyai 3.30 · Kab. Intan Jaya 3.38 · Kab. Pegunungan Bintang 3.59
- **Query:** Q-BPS with `:pk=41, :vid=415, :yr=2025` (n = 514, 26 from raw)
- **Source:** "BPS — Rata-rata Lama Sekolah (Metode Baru) menurut Kabupaten/Kota, 2025"
- **Caveat:** population aged 25+. All bottom-5 are new-Papua kabupaten that are **missing from `stats_datapoint`** (raw-response values).

#### 3. "IPM tertinggi vs terendah: Banda Aceh 89,55 — Nduga 40,35" (S5 E4 V5 = 14)
- **Metric:** IPM (UHH hasil Long Form SP2020), BPS var 2205 · **Level:** kab/kota · **Period:** 2025
- **Top-5:** Kota Banda Aceh 89.55 · Kota Yogyakarta 89.53 · Kota Jakarta Selatan 88.51 · Kota Kendari 86.36 · Kab. Sleman 86.35
- **Bottom-5:** Kab. Nduga 40.35 · Kab. Puncak 45.95 · Kab. Pegunungan Bintang 50.56 · Kab. Intan Jaya 51.56 · Kab. Lanny Jaya 52.47
- **Query:** Q-BPS `:pk=1592, :vid=2205, :yr=2025`
- **Source:** "BPS — Indeks Pembangunan Manusia (UHH hasil Long Form SP2020) menurut Kabupaten/Kota, 2025"
- **Caveat:** BPS has **two IPM series**. Var 413 (2024: Yogyakarta 88.77 … Nduga 36.30) differs from var 2205 by up to 4.5 points for the same kabupaten (Mamberamo Raya 2024: 55.00 vs 59.48). Name the series, and never mix them.

#### 4. "Badung membiayai 87% belanjanya sendiri. Nduga: 0,3%" (S5 E4 V5 = 14)
- **Metric:** rasio kemandirian fiskal = PAD ÷ Pendapatan Daerah (%), realisasi · **Level:** kab/kota · **Period:** 2024
- **Top-5:** Kab. Badung 87.09 · Kota Surabaya 60.93 · Kab. Gianyar 56.68 · Kab. Tangerang 54.28 · Kota Denpasar 53.00
- **Bottom-5:** Kab. Nduga 0.30 · Kab. Manokwari Selatan 0.63 · Kab. Puncak 0.64 · Kab. Lanny Jaya 0.70 · Kab. Mamberamo Tengah 0.71
- **Query:** Q-DJPK `_metric_values(2024,"realisasi",12,"regency","rasio_kemandirian","realisasi")` (n = 508)
- **Source:** "DJPK Kemenkeu — Realisasi APBD Kabupaten/Kota 2024 (Portal Data APBD)"
- **Caveat:** a NusaStats-derived ratio, not a DJPK-published figure. n = 508 (DKI's 6 kota/kab administrasi have no APBD).

#### 5. "23 kabupaten/kota tanpa satu pun perempuan di DPRD" (S5 E5 V4 = 14)
- **Metric:** Keterlibatan Perempuan di Parlemen (%), BPS var 464 · **Level:** kab/kota · **Period:** 2025
- **Top-5:** Kab. Barito Selatan 52.00 · Kota Manado 50.00 · Kab. Minahasa 48.57 · Kab. Siau Tagulandang Biaro 45.00 · Kab. Bintan 40.00
- **Bottom (all 0 %, 23 kab/kota):** Aceh Utara, Padang Lawas, Kepulauan Mentawai, Padang Pariaman, Solok Selatan, Kota Sungai Penuh, PALI, Musi Rawas Utara, Mukomuko, Belitung Timur, Natuna, Lembata, Flores Timur, Ngada, Rote Ndao, Sekadau, Supiori + (new codes) Deiyai, Paniai, Yahukimo, Yalimo, Intan Jaya, Dogiyai
- **Query:** Q-BPS `:pk=138, :vid=464, :yr=2025`, excluding the 16 old-code `dp` rows for moved kabupaten (§2.2), then `WHERE val = 0`
- **Source:** "BPS — Keterlibatan Perempuan di Parlemen menurut Kabupaten/Kota, 2025"
- **Caveat:** old and new codes disagree for 16 moved kabupaten (Yahukimo old = 5 %, new = 0 %). Uses new codes. Verify the 2025 reference (post-2024 election DPRD) on the BPS table page before publishing.

#### 6. "Umur harapan hidup: beda 22,5 tahun antar kabupaten" (S4 E5 V5 = 14)
- **Metric:** UHH saat lahir (tahun), BPS var 414 · **Level:** kab/kota · **Period:** 2024
- **Top-5:** Kota Salatiga 78.26 · Kota Semarang 78.24 · Kab. Sukoharjo 78.01 · Kab. Karanganyar 77.91 · Kota Surakarta 77.90
- **Bottom-5:** Kab. Nduga 55.74 · Kab. Mamberamo Raya 58.71 · Kab. Asmat 59.36 · Kab. Jayawijaya 60.65 · Kab. Seram Bagian Timur 60.80
- **Query:** Q-BPS `:pk=154, :vid=414, :yr=2024`
- **Source:** "BPS — Umur Harapan Hidup Saat Lahir (Metode Baru) menurut Kabupaten/Kota, 2024"
- **Caveat:** a modelled estimate (not death registration). Var 2206 (UHH LF SP2020) is a separate series.

#### 7. "PAD Badung Rp7,5 triliun — 1.900× PAD Nduga" (S4 E5 V5 = 14)
- **Metric:** Pendapatan Asli Daerah, realisasi (Rp) · **Level:** kab/kota · **Period:** 2024
- **Top-5:** Kab. Badung 7,506,995,595,563 · Kota Surabaya 6,114,385,907,599 · Kab. Tangerang 4,616,874,819,975 · Kab. Bogor 4,532,919,146,053 · Kota Bandung 3,091,256,996,423
- **Bottom-5:** Kab. Nduga 3,925,994,310 · Kab. Manokwari Selatan 5,357,419,974 · Kab. Waropen 6,579,595,312 · Kab. Mamberamo Tengah 6,706,160,184 · Kab. Pegunungan Arfak 8,153,223,923
- **Query:** Q-DJPK with `akun_key="pad"`
- **Source:** "DJPK Kemenkeu — Realisasi APBD 2024, akun Pendapatan Asli Daerah"
- **Caveat:** nominal Rupiah, not per capita. Per capita would need a population denominator from another source, which this channel's rule forbids, so present it as absolute.

#### 8. "Halmahera Tengah: 173 laki-laki per 100 perempuan" (S5 E4 V4 = 13)
- **Metric:** rasio jenis kelamin (L per 100 P), derived `sex_ratio` · **Level:** kab/kota · **Period:** Dukcapil 2026-10
- **Top-5:** Kab. Halmahera Tengah 173.08 · Kab. Paniai 121.64 · Kab. Morowali Utara 119.64 · Kab. Lanny Jaya 119.41 · Kab. Yahukimo 118.31
- **Bottom-5:** Kab. Sumenep 93.44 · Kab. Soppeng 93.79 · Kota Gunungsitoli 94.50 · Kab. Sikka 94.73 · Kab. Nias Barat 94.84
- **Query:** Q-DUK `sex_ratio`. Supporting kecamatan detail: `SELECT name, attributes->>'pria', attributes->>'wanita' FROM dukcapil_dukcapilregion WHERE level='district' AND period='2026-10' AND kab_code='8202'` (Weda 27,711 L / 11,036 P)
- **Source:** "Ditjen Dukcapil Kemendagri — Data Kependudukan Kab/Kota (AGR_VISUAL_KAB_FIX), diakses Okt 2026"
- **Caveat:** the kabupaten totals are round (106,500 / 67,500 / 39,000), though they match the kecamatan sums. Don't attribute a cause (e.g. nickel smelters) unless a separate source is cited.

#### 9. "Kecamatan terpadat: Johar Baru, 56.455 jiwa/km²" (S4 E5 V4 = 13)
- **Metric:** kepadatan penduduk (jiwa/km²), derived `pop_density_big` · **Level:** kecamatan · **Period:** Dukcapil 2026-10
- **Top-5:** Johar Baru (Jakarta Pusat) 56,455 · Tambora (Jakarta Barat) 47,463 · Bojongloa Kaler (Kota Bandung) 41,086 · Pabean Cantian (Kota Surabaya) 40,526 · Matraman (Jakarta Timur) 37,506
- **Bottom-5:** Kayan Hilir (Malinau) 0.14 · Pujungan (Malinau) 0.29 · Uut Murung (Murung Raya) 0.30 · Distrik Kontuar (930122) 0.38 · Seribu Riam (Murung Raya) 0.40
- **Query:** Q-DUK `pop_density_big`, `level="district"`
- **Source:** "Penduduk: Ditjen Dukcapil Kemendagri (Okt 2026); Luas: dihitung dari peta batas desa BIG 1:10.000"
- **Caveat:** the area comes from **BIG**, a second source (not BPS). The citation must name both. The boundary vintage is unknown.

#### 10. "Pengeluaran per kapita: Jakarta Selatan 5,5× Nduga" (S4 E4 V5 = 13)
- **Metric:** pengeluaran per kapita disesuaikan (ribu Rp/orang/tahun), BPS var 416 · **Level:** kab/kota · **Period:** 2025
- **Top-5:** Kota Jakarta Selatan 26,387 · Kota Jakarta Barat 22,831 · Kota Denpasar 21,185 · Kota Yogyakarta 21,104 · Kota Surabaya 20,679
- **Bottom-5:** Kab. Nduga 4,773 · Kab. Lanny Jaya 5,102 · Kab. Mamberamo Tengah 5,119 · Kab. Yalimo 5,305 · Kab. Mamberamo Raya 5,568
- **Query:** Q-BPS `:pk=42, :vid=416, :yr=2025`
- **Source:** "BPS — Pengeluaran per Kapita Disesuaikan (Metode Baru) menurut Kabupaten/Kota, 2025"
- **Caveat:** PPP-adjusted (purchasing-power parity), in constant prices. It is not income and not nominal spending.

#### 11. "Garis kemiskinan: Rp1,25 juta di Kota Jayapura, Rp344 ribu di Mamuju Tengah" (S4 E4 V5 = 13)
- **Metric:** Garis Kemiskinan (Rp/kapita/bulan), BPS var 624 · **Level:** kab/kota · **Period:** 2025
- **Top-5:** Kota Jayapura 1,253,343 · Kab. Mimika 1,166,466 · Kab. Pegunungan Bintang 1,132,178 · Kab. Lanny Jaya 1,019,014 · Kota Sorong 985,416
- **Bottom-5:** Kab. Mamuju Tengah 344,125 · Kab. Buton Selatan 356,075 · Kab. Buton Tengah 358,029 · Kab. Kepulauan Sangihe 360,933 · Kab. Bolaang Mongondow Utara 364,581
- **Query:** Q-BPS `:pk=471, :vid=624, :yr=2025`
- **Source:** "BPS — Garis Kemiskinan menurut Kabupaten/Kota, 2025"
- **Caveat:** the reference month (BPS kab poverty is usually March) is **not recorded in the repo**. Check on the BPS page.

#### 12. "Persentase penduduk miskin: Supiori 42,6%, Badung 1,9%" (S3 E5 V5 = 13)
- **Metric:** P0 (%), BPS var 621 · **Level:** kab/kota · **Period:** 2025
- **Top-5:** Kab. Supiori 42.56 · Kab. Intan Jaya 39.21 · Kab. Deiyai 37.29 · Kab. Puncak 36.94 · Kab. Paniai 36.31
- **Bottom-5:** Kab. Badung 1.90 · Kota Balikpapan 1.97 · Kota Denpasar 2.16 · Kota Depok 2.31 · Kota Tangerang Selatan 2.39
- **Query:** Q-BPS `:pk=468, :vid=621, :yr=2025`
- **Source:** "BPS — Persentase Penduduk Miskin (P0) menurut Kabupaten/Kota, 2025"
- **Caveat:** 4 of the top-5 exist only in raw responses (§2.1). The `stats_datapoint`-only top-5 would be wrong.

#### 13. "Kabupaten paling 'tua': Gunungkidul, 15% penduduk berusia 65+" (S3 E5 V5 = 13)
- **Metric:** % lansia 65+, derived `pct_elderly` · **Level:** kab/kota · **Period:** Dukcapil 2026-10
- **Top-5:** Kab. Gunungkidul 15.32 · Kab. Pacitan 14.45 · Kab. Magetan 14.27 · Kab. Ponorogo 14.19 · Kab. Wonogiri 14.03
- **Bottom-5:** Kab. Nduga 0.12 · Kab. Dogiyai 0.34 · Kab. Deiyai 0.44 · Kab. Paniai 0.45 · Kab. Mamberamo Tengah 0.61
- **Query:** Q-DUK `pct_elderly`
- **Source:** "Ditjen Dukcapil Kemendagri — Data Kependudukan menurut Kelompok Umur, Kab/Kota, diakses Okt 2026"
- **Caveat:** use the top end only. The bottom end is Papua highlands, where registration is incomplete (§2.5).

#### 14. "1 dari 2 orang di Mamberamo Raya tak cukup makan" (S4 E4 V5 = 13)
- **Metric:** Prevalensi Ketidakcukupan Konsumsi Pangan / PoU (%), BPS var 2269 · **Level:** kab/kota · **Period:** 2025
- **Top-5:** Kab. Mamberamo Raya 59.17 · Kab. Deiyai 48.28 · Kab. Puncak 48.22 · Kab. Dogiyai 46.40 · Kab. Yahukimo 43.15
- **Bottom-5:** Kab. Gianyar 1.16 · Kab. Badung 1.27 · Kota Denpasar 1.71 · Kota Surabaya 1.90 · Kota Jakarta Selatan 2.03
- **Query:** Q-BPS `:pk=953, :vid=2269, :yr=2025`
- **Source:** "BPS — Prevalensi Ketidakcukupan Konsumsi Pangan menurut Kabupaten/Kota, 2025"
- **Caveat:** PoU is a calorie-intake model on Susenas. Word it as "tidak tercukupi kebutuhan kalori minimum" rather than "kelaparan". The hook "1 dari 2" is rounded from 59 %, so check the wording.

#### 15. "Hunian layak: Ternate 98%, Puncak 0%" (S5 E4 V3 = 12)
- **Metric:** % RT dengan akses hunian layak (SDG 11.1.1.a), BPS var 2699 · **Level:** kab/kota · **Period:** 2025
- **Top-5:** Kota Ternate 98.41 · Kab. Klungkung 96.57 · Kab. Karanganyar 96.17 · Kab. Wonogiri 96.05 · Kota Pontianak 95.85
- **Bottom-5:** Kab. Puncak 0.00 · Kab. Tolikara 0.57 · Kab. Lanny Jaya 0.70 · Kab. Nduga 1.34 · Kab. Mamberamo Tengah 3.68
- **Query:** Q-BPS `:pk=1323, :vid=2699, :yr=2025`
- **Source:** "BPS — Persentase Rumah Tangga yang Memiliki Akses terhadap Hunian Layak menurut Kabupaten/Kota, 2025"
- **Caveat:** a 0.00 value is suspicious (§2.5). "Layak" is a composite definition (water, sanitation, floor area, building material), so explain it on a slide.

#### 16. "Membangun di Puncak 3,6× lebih mahal" (S4 E3 V5 = 12)
- **Metric:** Indeks Kemahalan Konstruksi, BPS var 2515 · **Level:** kab/kota · **Period:** 2025
- **Top-5:** Kab. Puncak 361.36 · Kab. Intan Jaya 342.92 · Kab. Puncak Jaya 340.84 · Kab. Pegunungan Bintang 299.88 · Kab. Tolikara 268.65
- **Bottom-5:** Kab. Belu 76.68 · Kab. Malaka 78.34 · Kab. Timor Tengah Utara 79.83 · Kab. Sigi 80.04 · Kab. Ngada 80.61
- **Query:** Q-BPS `:pk=751, :vid=2515, :yr=2025`
- **Source:** "BPS — Indeks Kemahalan Konstruksi Kabupaten/Kota, 2025"
- **Caveat:** the index base is **not recorded in the repo**. Confirm on the BPS page before saying "3,6× rata-rata". The top-5 are all raw-response values.

#### 17. "Perokok terbanyak: Lanny Jaya 45,7%, Wonosobo 41,4%" (S4 E5 V3 = 12)
- **Metric:** % penduduk 15+ merokok sebulan terakhir, BPS var 2644 · **Level:** kab/kota · **Period:** 2024
- **Top-5:** Kab. Lanny Jaya 45.69 · Kab. Wonosobo 41.40 · Kab. Lebong 40.89 · Kab. Ogan Komering Ulu Selatan 40.69 · Kab. Sorong Selatan 40.24
- **Bottom-5:** Kab. Yahukimo 3.64 · Kab. Deiyai 7.26 · Kab. Paniai 8.30 · Kab. Pegunungan Bintang 12.23 · Kab. Dogiyai 13.06
- **Query:** Q-BPS `:pk=1039, :vid=2644, :yr=2024`
- **Source:** "BPS — Persentase Penduduk Berumur 15 Tahun ke Atas yang Merokok (SDG 3.a.1), 2024"
- **Caveat:** the bottom-5 are implausibly low (§2.5). Use as a top-only story.

#### 18. "Sarjana: 18% warga Kota Yogyakarta, <1% di Tolikara" (S3 E5 V4 = 12)
- **Metric:** % penduduk tamat D4/S1+ (of total population), derived `pct_sarjana` · **Level:** kab/kota · **Period:** Dukcapil 2026-10
- **Top-5:** Kota Yogyakarta 17.95 · Kota Banda Aceh 16.44 · Kota Adm. Jakarta Selatan 15.71 · Kota Malang 14.80 · Kota Tangerang Selatan 14.78
- **Bottom-5:** Kab. Tolikara 0.86 · Kab. Puncak Jaya 1.02 · Kab. Nduga 1.06 · Kab. Intan Jaya 1.10 · Kab. Puncak 1.10
- **Query:** Q-DUK `pct_sarjana`
- **Source:** "Ditjen Dukcapil Kemendagri — Data Kependudukan menurut Pendidikan, diakses Okt 2026"
- **Caveat:** the denominator is **all ages** (including children), so it is not "% of adults". Education is as recorded on KK/KTP.

#### 19. "Kepulauan Seribu: 1 dari 8 warganya nelayan" (S3 E5 V4 = 12)
- **Metric:** % penduduk berpekerjaan nelayan, derived `pct_fisher` · **Level:** kab/kota · **Period:** Dukcapil 2026-10
- **Top-5:** Kab. Adm. Kepulauan Seribu 12.77 · Kab. Lingga 12.13 · Kab. Kepulauan Anambas 11.15 · Kab. Kepulauan Aru 10.17 · Kab. Buton Selatan 9.39
- **Bottom:** many at ~0.00 (e.g. Nduga, Puncak, Toraja Utara, Melawi, Kota Tangerang Selatan). Ties, so don't show a bottom-5.
- **Query:** Q-DUK `pct_fisher`
- **Source:** "Ditjen Dukcapil Kemendagri — Data Kependudukan menurut Pekerjaan, diakses Okt 2026"
- **Caveat:** the occupation as written on the KTP. The denominator is all ages.

#### 20. "Usia median: Ponorogo 40 tahun, Asmat 19 tahun" (S4 E4 V3 = 11)
- **Metric:** usia median (perkiraan, interpolated from 5-year bands), derived `median_age` · **Level:** kab/kota · **Period:** Dukcapil 2026-10
- **Top-5:** Kab. Ponorogo 39.9 · Kab. Tabanan 39.5 · Kab. Gunungkidul 39.4 · Kab. Pacitan 39.4 · Kab. Magetan 39.3
- **Bottom-5:** Kab. Asmat 18.8 · Kab. Mappi 19.8 · Kab. Teluk Wondama 23.1 · Kab. Boven Digoel 23.2 · Kab. Supiori 23.2
- **Query:** Q-DUK `median_age`
- **Source:** "Diolah dari Ditjen Dukcapil Kemendagri — penduduk menurut kelompok umur, Okt 2026"
- **Caveat:** NusaStats' own interpolation, so label it "perkiraan".

#### 21. "IPM naik paling cepat: Sumenep +12 poin sejak 2010" (S3 E4 V4 = 11)
- **Metric:** perubahan IPM 2010→2024 (poin), BPS var 413 · **Level:** kab/kota
- **Top-5:** Kab. Sumenep +11.99 (57.27→69.26) · Kab. Lombok Utara +11.11 · Kab. Nias +10.83 · Kab. Lingga +10.83 · Kab. Nias Selatan +10.48
- **Bottom-5:** Kota Jayapura +4.98 · Kota Banjar Baru +5.02 · Kab. Aceh Besar +5.37 · Kota Bontang +5.45 · Kota Palu +5.49
- **Query:**
  ```sql
  WITH a AS (SELECT domain_id, value FROM stats_datapoint WHERE variable_id=153 AND admin_level='regency' AND year=2010 AND turvar_id='0'),
       b AS (SELECT domain_id, value FROM stats_datapoint WHERE variable_id=153 AND admin_level='regency' AND year=2024 AND turvar_id='0')
  SELECT dm.domain_id, dm.domain_name, a.value, b.value, b.value-a.value delta
  FROM a JOIN b USING (domain_id) JOIN catalog_domain dm ON dm.id=a.domain_id ORDER BY delta DESC;   -- n = 462
  ```
- **Source:** "BPS — IPM (Metode Baru) menurut Kabupaten/Kota, 2010 dan 2024"
- **Caveat:** n = 462. It excludes kabupaten formed after 2010 and the 26 recoded Papua kabupaten. Low starting points rise faster in absolute terms.

#### 22. "Perempuan menyumbang 77% pendapatan di Konawe Kepulauan" (S4 E3 V4 = 11)
- **Metric:** Sumbangan Pendapatan Perempuan (%), BPS var 467 · **Level:** kab/kota · **Period:** 2024
- **Top-5:** Kab. Konawe Kepulauan 76.54 · Kab. Intan Jaya 65.09 · Kab. Manokwari Selatan 64.17 · Kab. Deiyai 56.73 · Kab. Malaka 51.75
- **Bottom-5:** Kab. Pulau Taliabu 13.66 · Kota Bontang 17.80 · Kab. Berau 18.19 · Kab. Kutai Timur 18.71 · Kab. Pasangkayu 19.67
- **Query:** Q-BPS `:pk=140, :vid=467, :yr=2024`
- **Source:** "BPS — Sumbangan Pendapatan Perempuan menurut Kabupaten/Kota, 2024"
- **Caveat:** an IDG component estimated from wage shares, not measured household income. Explain carefully.

#### 23. "Angka cerai hidup tertinggi: Kota Banjar" (S3 E4 V4 = 11)
- **Metric:** % penduduk berstatus cerai hidup, derived `pct_divorced` · **Level:** kab/kota · **Period:** Dukcapil 2026-10
- **Top-5:** Kota Banjar 4.26 · Kab. Blitar 3.55 · Kab. Hulu Sungai Selatan 3.54 · Kota Cirebon 3.44 · Kab. Banyuwangi 3.44
- **Bottom-5:** Kab. Nias Barat 0.04 · Kab. Nias 0.04 · Kab. Manggarai Timur 0.06 · Kab. Nias Utara 0.06 · Kab. Nias Selatan 0.06
- **Query:** Q-DUK `pct_divorced`
- **Source:** "Ditjen Dukcapil Kemendagri — Data Kependudukan menurut Status Perkawinan, diakses Okt 2026"
- **Caveat:** this is a **stock** (current marital status), not a divorce rate. The denominator is all ages. Low values may reflect status not being updated on KK. A sensitive topic, so keep the tone neutral.

#### 24. "Belanja pegawai makan 56% APBD Limapuluh Kota" (S3 E3 V5 = 11)
- **Metric:** Belanja Pegawai ÷ Belanja Daerah (%), realisasi · **Level:** kab/kota · **Period:** 2024
- **Top-5:** Kab. Limapuluh Kota 56.35 · Kota Tanjung Pinang 54.04 · Kab. Muna 52.93 · Kota Binjai 52.61 · Kota Palopo 51.22
- **Bottom-5:** Kab. Mahakam Ulu 11.04 · Kab. Nduga 11.40 · Kab. Kutai Timur 13.47 · Kab. Tanah Bumbu 13.78 · Kab. Teluk Bintuni 14.13
- **Query:** Q-DJPK `rasio_belanja_pegawai`
- **Source:** "DJPK Kemenkeu — Realisasi APBD 2024 (diolah: Belanja Pegawai / Belanja Daerah)"
- **Caveat:** the export repeats some labels (old and new nomenclature), and the helper takes the first line per region. A derived ratio.

#### 25. "Kabupaten paling beragam agamanya: Bengkayang" (S3 E3 V4 = 10)
- **Metric:** Indeks Keragaman Agama (0–100, Simpson), derived `religion_diversity` · **Level:** kab/kota · **Period:** Dukcapil 2026-10
- **Top-5:** Kab. Bengkayang 70.01 · Kab. Sintang 65.91 · Kab. Maluku Tenggara 65.76 · Kab. Keerom 65.42 · Kab. Kepulauan Mentawai 63.43
- **Bottom-5:** Kab. Pidie Jaya 0.02 · Kab. Sampang 0.05 · Kab. Aceh Timur 0.06 · Kab. Tasikmalaya 0.08 · Kab. Pidie 0.08
- **Query:** Q-DUK `religion_diversity`
- **Source:** "Diolah dari Ditjen Dukcapil Kemendagri — penduduk menurut agama, Okt 2026"
- **Caveat:** a NusaStats-defined index, so explain the formula. Religion is a sensitive topic: present diversity only, never "least diverse" as a negative.

**Bench (not ranked; data checked):** HLS 2025 (Banda Aceh 17.95 … Nduga 4.73), IPG 2024
(Tomohon 99.56 … Asmat 58.04), kepadatan kab (Jakarta Pusat 21,963/km² … Mamberamo Raya 1.46),
belanja modal share (Berau 59.7 %), provincial fiscal independence (Banten 72.8 % … Papua
Pegunungan 7.8 %).
**Do not use:** stunting 2018 (Yalimo 0 %, outdated), Dukcapil KTP-el coverage/crude death rate/% children
"bottom" rankings (registration artifacts), blood-type rhesus.

**Privacy:** all candidates are aggregates at kecamatan level or above. Avoid desa-level and
small-cell breakdowns (e.g. religion or occupation counts in a 300-person distrik) even though the
data exists.

---

## 5. Export proposal: `export_carousel_pack`

### 5.1 Shape

A new **read-only** management command, `backend/api/management/commands/export_carousel_pack.py`.
It lives in `api` because that app already imports all three sources' read helpers. It writes JSON to
stdout or `--out` and nothing to the DB or Redis.

```
manage.py export_carousel_pack --source bps|dukcapil|djpk --metric <key> --level provinsi|kabupaten|kecamatan
    --period <year|YYYY-MM> [--turvar 0] [--top 5] [--bottom 5] [--id <slug>] [--label-metric "..."]
    [--unit "..."] [--notes "..."] [--allow-partial] [--out path.json] [--provenance path.json]
```

- `--metric`: BPS `catalog_variable` pk (or `bps:<var_id>`), Dukcapil field or derived key, or DJPK
  `akun_key` / ratio key.
- One `--source` per pack, so mixing sources is impossible by construction.

### 5.2 What it reuses

| Need | Existing code |
|---|---|
| BPS values | `api.stats_views.region_values` (call with an explicit `turvar_id`, never the lowest-id default) |
| BPS new-Papua fix | **new:** decode from `CoverageCheckLog.raw_body` (logic in §4.0 Q-BPS), or better, the permanent fix below |
| Kota/Kabupaten labels for BPS | `api.dukcapil_views.bps_regency_status` |
| Dukcapil values | `api.dukcapil_views._extract`, `_value_map`; `dukcapil.derived.DERIVED_BY_FIELD`; `DukcapilRegion.status` for labels |
| DJPK values | `api.djpk_views._metric_values` (raw accounts and ratios) |
| Ranking | `api.analytics.rank_rows`, `distribution` (n, min, max, mean for `notes`) |
| Units / names | `Variable.name/unit`, `DukcapilIndicator.label_id/unit`, `derived.meta()`, `ApbdAccount.label_id` |
| Provenance | `DataPoint.source_check_log` → `CoverageCheckLog.url/response_hash`; `DukcapilRegion.fetch_log.response_sha256`; `ApbdReport.fetch_log.response_sha256` |

Call these helpers directly, not the DRF views. That avoids `@cached_api`, throttling, and pagination.

### 5.3 Guardrails the command should enforce

1. **Completeness check:** compare `len(rows)` to the expected universe (BPS kab 514 / prov 38;
   Dukcapil kab 514, kec 7,285; DJPK kab 508). Below that, it refuses unless `--allow-partial`, and
   then writes "n = 488 dari 514" into `notes`.
2. **Explicit dimension:** if a BPS variable has more than one `turvar` or more than one period per
   year (inflation, quarterly PDRB), it requires `--turvar` / a period id.
3. **Old/new-code de-dup** for moved Papua kabupaten (prefer new codes, note it).
4. **Codes stay in the source's scheme.** `code` is BPS `domain_id` for BPS, Kemendagri for
   Dukcapil, and Kemendagri (`kemendagri_code`) for DJPK, with `djpk_code` in provenance.
5. **Provenance sidecar** (`--provenance`): for each row, the response hash and URL (BPS key already
   redacted) and the fetch date. Carousel Press can show "sumber terverifikasi" and you can audit
   every slide. The `carousel-data/1` format stays exactly as specified.
6. **Values:** stored as-is (no rounding). Rounding is a rendering concern.

### 5.4 Permanent fix (separate, write-side change, *not* part of this recon)

Add the 4 new BPS provinces (`9200`, `9500`, `9600`, `9700`) and their 26 kabupaten to `catalog_domain`
(`crawl_domains` should already receive them from `type=prov`/`kabbyprov` if re-run), then re-run
`ingest_confirmed_data` with `use_cache` so no new BPS calls are needed. After that, `region_values`
returns 514 rows and the raw-decode workaround can go. Decide the old-code policy (§2.2) at the same
time.

### 5.5 Example pack 1 (BPS, story #3)

Labels add the Kota/Kab. prefix (BPS names omit it). Codes are BPS codes, and the bottom five come
from stored raw responses (`catalog_coveragechecklog` #67223, `…/var/2205/th/125;124;123/…`, fetched
2026-10-04, sha256 `3ca3c5f0…588f6ea0`).

```json
{
  "format": "carousel-data/1",
  "id": "ipm-kabkota-2025-tertinggi-terendah",
  "metric": "Indeks Pembangunan Manusia (IPM)",
  "unit": "indeks (0–100)",
  "period": "2025",
  "level": "kabupaten",
  "source": "BPS — Indeks Pembangunan Manusia (UHH hasil Long Form SP2020) menurut Kabupaten/Kota, 2025",
  "notes": "5 tertinggi dan 5 terendah dari 514 kabupaten/kota. Seri IPM dengan UHH Long Form SP2020 (BPS var 2205); seri lain (var 413) berbeda hingga 4,5 poin. Kode wilayah = kode BPS; 26 kabupaten di 4 provinsi baru Papua memakai kode BPS baru (92xx/95xx/96xx/97xx).",
  "rows": [
    { "label": "Kota Banda Aceh",          "code": "1171", "value": 89.55 },
    { "label": "Kota Yogyakarta",          "code": "3471", "value": 89.53 },
    { "label": "Kota Jakarta Selatan",     "code": "3171", "value": 88.51 },
    { "label": "Kota Kendari",             "code": "7471", "value": 86.36 },
    { "label": "Kab. Sleman",              "code": "3404", "value": 86.35 },
    { "label": "Kab. Lanny Jaya",          "code": "9703", "value": 52.47 },
    { "label": "Kab. Intan Jaya",          "code": "9606", "value": 51.56 },
    { "label": "Kab. Pegunungan Bintang",  "code": "9708", "value": 50.56 },
    { "label": "Kab. Puncak",              "code": "9607", "value": 45.95 },
    { "label": "Kab. Nduga",               "code": "9701", "value": 40.35 }
  ]
}
```

### 5.6 Example pack 2 (Dukcapil, story #1)

```json
{
  "format": "carousel-data/1",
  "id": "kecamatan-penduduk-terbanyak-2026-10",
  "metric": "Jumlah penduduk per kecamatan",
  "unit": "jiwa",
  "period": "2026-10",
  "level": "kecamatan",
  "source": "Ditjen Dukcapil Kemendagri — Data Kependudukan per Kecamatan (GIS Dukcapil, AGR_VISUAL_KEC_FIX), diakses Oktober 2026",
  "notes": "Penduduk terdaftar (administrasi kependudukan), bukan hasil sensus. Tanggal rujukan data Dukcapil tidak tercantum di sumber; diakses 3 Okt 2026. 370 dari 514 kabupaten/kota berpenduduk lebih sedikit dari Kecamatan Cakung. Kode = kode wilayah Kemendagri.",
  "rows": [
    { "label": "Cakung, Kota Adm. Jakarta Timur",     "code": "317506", "value": 582327 },
    { "label": "Cengkareng, Kota Adm. Jakarta Barat", "code": "317301", "value": 581788 },
    { "label": "Kalideres, Kota Adm. Jakarta Barat",  "code": "317306", "value": 464076 },
    { "label": "Tambun Selatan, Kab. Bekasi",         "code": "321606", "value": 450469 },
    { "label": "Cilincing, Kota Adm. Jakarta Utara",  "code": "317204", "value": 445729 }
  ]
}
```

---

## 6. Gaps: strong stories missing from NusaStats, with official sources

| Missing data | Story it unlocks | Official source |
|---|---|---|
| **Unemployment (TPT) by kab/kota** | "Pengangguran tertinggi di kota industri?" | BPS, Sakernas Agustus. Published per kab/kota in BPS dynamic tables under the province/kab domains (not the `0000` domain this crawler queries) |
| **Population by kab/kota (BPS)** and BPS per-capita figures (PDRB per kapita) | per-capita rankings within a single source | BPS: Proyeksi Penduduk Kab/Kota (SP2020-based) and PDRB per kapita tables, published by each BPS province/kab domain |
| **Gini ratio by kab/kota** | inequality map | BPS (Susenas), via province BPS domains |
| **Stunting after 2018** | "Prevalensi stunting tertinggi 2024" | Kemenkes: SSGI 2021/2022, SKI 2023, SSGI 2024 |
| **Infant mortality, divorce/marriage rates, akta & KIA ownership, IKD, causes of death** | many | **Already downloaded**, Dukcapil themed layers in `data/dukcapil_extra/`. They need an ingest with `DukcapilFetchLog` hashing before use (not traceable as-is) |
| **Dukcapil population trend (Feb 2023, Jan 2024 → now)** | "Kabupaten tumbuh tercepat" | Already downloaded (`AGR_VISUAL_*_202302/202401`). Same ingest need |
| **Village facilities (schools, health, internet, roads)** | "Desa tanpa sinyal" (at kecamatan/kab aggregate) | BPS, PODES 2024 |
| **Schools, teachers, student-teacher ratio** | education access | Kemendikdasmen, Dapodik / Data Pokok Pendidikan |
| **Health facilities & doctors per region** | "1 dokter untuk N warga" | Kemenkes, Profil Kesehatan / SISDMK |
| **Crime** | crime-rate rankings | BPS, Statistik Kriminal (Polri data), mostly province level |
| **Election turnout / results** | civic stories | KPU, open results data (Pemilu 2024) |
| **Village development index** | desa maju/tertinggal counts per kab | Kemendes PDT, Indeks Desa Membangun / Indeks Desa 2024 |
| **SIMDASI tables** (table schema exists, 0 rows) | many regional tables | BPS SIMDASI via WebAPI (`crawl_simdasi` never run) |
| **BPS 4 new Papua provinces in `catalog_domain`** | every Papua-inclusive ranking | BPS WebAPI `domain` endpoint (re-run `crawl_domains`) |
| **Dukcapil reference date** | correct citation | Dukcapil's semester publication (e.g. "Data Kependudukan Semester I/II") from Kemendagri. The ArcGIS payload has no date |
