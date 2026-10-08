# Peta Wilayah: terrain class rule change — new class *Dataran* (2026-10-08)

## Why

Flagged in DIY and confirmed in Jawa Tengah: flat inland plains above 100 m were labelled *Campuran* ("mixed").
*Dataran rendah* needs ≥ 60% of the area under 100 m, and *Perbukitan* needs steep slopes or height, so a flat plain
at 100–300 m matched neither. In Jawa Tengah, 102 of 129 *Campuran* areas were ≥ 60% flat (Kota Surakarta 99%,
Klaten 95%).

## Rule (config/terrain_rules.yaml, applied in order, first match wins)

1. Pegunungan — ≥ 40% at ≥ 1.000 m, or ≥ 40% with slope ≥ 25°
2. Perbukitan — ≥ 50% with slope ≥ 8°, or ≥ 50% at ≥ 200 m
3. Dataran rendah — ≥ 60% under 100 m and ≥ 60% with slope < 8°
4. **Dataran (new)** — ≥ 60% with slope < 8°, at any elevation
5. Campuran — anything else

Still a NusaStats classification, not an official one. No elevation, slope or other figure changed.

## How it was applied

`uv run python -m terrain.reclassify` re-applies the rules to each area's stored `metrics_pct`; the class depends
only on those figures. It updates the class, label, reason and rules hash. The batch runner then sees every area as
up to date, so no rasters were recomputed.
- Stored metrics are rounded to 2 decimals. Four areas sat exactly on a threshold (330403, 331801, 350513, 350520)
  and were recomputed in full from unrounded values. All four kept the same class, so the reclassification equals a
  full recompute.
- A changes log is written to `data/peta_wilayah/cache/logs/reclassify-*.json`.

## Result

**3,974 areas checked; 329 changed, all Campuran → Dataran** (27 kabupaten/kota, 302 kecamatan). No other
transition.

By provinsi: 33: 102, 34: 24, 35: 119, 51: 10, 52: 10, 53: 17, 61: 1, 62: 3, 63: 2, 64: 8, 65: 1, 71: 3, 72: 1, 73: 13, 74: 11, 81: 2, 82: 2.

### Kabupaten/kota

| Kode | Nama | Alasan baru |
|---|---|---|
| 3310 | Klaten | Dataran: 95,3% area lereng <8° |
| 3311 | Sukoharjo | Dataran: 92,7% area lereng <8° |
| 3314 | Sragen | Dataran: 90,9% area lereng <8° |
| 3316 | Blora | Dataran: 86,0% area lereng <8° |
| 3324 | Kendal | Dataran: 63,8% area lereng <8° |
| 3327 | Pemalang | Dataran: 66,2% area lereng <8° |
| 3329 | Brebes | Dataran: 66,7% area lereng <8° |
| 3372 | Kota Surakarta | Dataran: 99,0% area lereng <8° |
| 3374 | Kota Semarang | Dataran: 78,6% area lereng <8° |
| 3404 | Sleman | Dataran: 89,6% area lereng <8° |
| 3471 | Kota Yogyakarta | Dataran: 99,1% area lereng <8° |
| 3506 | Kediri | Dataran: 79,9% area lereng <8° |
| 3510 | Banyuwangi | Dataran: 62,8% area lereng <8° |
| 3514 | Pasuruan | Dataran: 67,5% area lereng <8° |
| 3516 | Mojokerto | Dataran: 71,9% area lereng <8° |
| 3518 | Nganjuk | Dataran: 78,1% area lereng <8° |
| 3519 | Madiun | Dataran: 74,7% area lereng <8° |
| 3521 | Ngawi | Dataran: 88,3% area lereng <8° |
| 3528 | Pamekasan | Dataran: 84,5% area lereng <8° |
| 3572 | Kota Blitar | Dataran: 99,1% area lereng <8° |
| 5103 | Badung | Dataran: 79,3% area lereng <8° |
| 5202 | Lombok Tengah | Dataran: 71,3% area lereng <8° |
| 5318 | Sumba Barat Daya | Dataran: 62,7% area lereng <8° |
| 5371 | Kota Kupang | Dataran: 82,8% area lereng <8° |
| 6205 | Barito Utara | Dataran: 62,4% area lereng <8° |
| 6303 | Banjar | Dataran: 62,0% area lereng <8° |
| 7302 | Bulukumba | Dataran: 72,9% area lereng <8° |

### Kecamatan

| Kode | Nama | Alasan baru |
|---|---|---|
| 330227 | Purwokerto Utara | Dataran: 98,5% area lereng <8° |
| 330303 | Kejobong | Dataran: 74,1% area lereng <8° |
| 330315 | Padamara | Dataran: 99,8% area lereng <8° |
| 330403 | Mandiraja | Dataran: 60,0% area lereng <8° |
| 330411 | Rakit | Dataran: 74,7% area lereng <8° |
| 330908 | Sawit | Dataran: 99,7% area lereng <8° |
| 330909 | Banyudono | Dataran: 98,4% area lereng <8° |
| 330910 | Sambi | Dataran: 86,8% area lereng <8° |
| 330911 | Ngemplak | Dataran: 99,2% area lereng <8° |
| 330912 | Nogosari | Dataran: 96,5% area lereng <8° |
| 330913 | Simo | Dataran: 78,1% area lereng <8° |
| 330916 | Andong | Dataran: 87,5% area lereng <8° |
| 330917 | Kemusu | Dataran: 77,7% area lereng <8° |
| 330918 | Wonosegoro | Dataran: 76,4% area lereng <8° |
| 330919 | Juwangi | Dataran: 76,2% area lereng <8° |
| 331001 | Prambanan | Dataran: 99,2% area lereng <8° |
| 331002 | Gantiwarno | Dataran: 98,9% area lereng <8° |
| 331003 | Wedi | Dataran: 98,9% area lereng <8° |
| 331004 | Bayat | Dataran: 80,1% area lereng <8° |
| 331005 | Cawas | Dataran: 99,7% area lereng <8° |
| 331006 | Trucuk | Dataran: 100,0% area lereng <8° |
| 331007 | Kebonarum | Dataran: 100,0% area lereng <8° |
| 331008 | Jogonalan | Dataran: 99,9% area lereng <8° |
| 331011 | Ceper | Dataran: 99,9% area lereng <8° |
| 331012 | Pedan | Dataran: 100,0% area lereng <8° |
| 331014 | Juwiring | Dataran: 99,9% area lereng <8° |
| 331015 | Wonosari | Dataran: 99,9% area lereng <8° |
| 331016 | Delanggu | Dataran: 99,9% area lereng <8° |
| 331017 | Polanharjo | Dataran: 99,9% area lereng <8° |
| 331023 | Kalikotes | Dataran: 98,8% area lereng <8° |
| 331024 | Klaten Utara | Dataran: 100,0% area lereng <8° |
| 331025 | Klaten Tengah | Dataran: 99,9% area lereng <8° |
| 331026 | Klaten Selatan | Dataran: 99,8% area lereng <8° |
| 331101 | Weru | Dataran: 87,2% area lereng <8° |
| 331102 | Bulu | Dataran: 61,1% area lereng <8° |
| 331105 | Nguter | Dataran: 95,6% area lereng <8° |
| 331106 | Bendosari | Dataran: 96,5% area lereng <8° |
| 331107 | Polokarto | Dataran: 93,2% area lereng <8° |
| 331108 | Mojolaban | Dataran: 99,4% area lereng <8° |
| 331110 | Baki | Dataran: 99,8% area lereng <8° |
| 331111 | Gatak | Dataran: 99,9% area lereng <8° |
| 331112 | Kartasura | Dataran: 99,8% area lereng <8° |
| 331207 | Baturetno | Dataran: 91,3% area lereng <8° |
| 331209 | Wuryantoro | Dataran: 78,9% area lereng <8° |
| 331211 | Selogiri | Dataran: 64,5% area lereng <8° |
| 331212 | Wonogiri | Dataran: 72,5% area lereng <8° |
| 331310 | Tasikmadu | Dataran: 98,3% area lereng <8° |
| 331311 | Jaten | Dataran: 99,1% area lereng <8° |
| 331312 | Colomadu | Dataran: 99,8% area lereng <8° |
| 331313 | Gondangrejo | Dataran: 86,8% area lereng <8° |
| 331314 | Kebakkramat | Dataran: 95,8% area lereng <8° |
| 331401 | Kalijambe | Dataran: 91,1% area lereng <8° |
| 331404 | Kedawung | Dataran: 97,5% area lereng <8° |
| 331406 | Gondang | Dataran: 98,2% area lereng <8° |
| 331409 | Karangmalang | Dataran: 99,4% area lereng <8° |
| 331413 | Gemolong | Dataran: 95,8% area lereng <8° |
| 331414 | Miri | Dataran: 84,6% area lereng <8° |
| 331415 | Sumberlawang | Dataran: 85,3% area lereng <8° |
| 331416 | Mondokan | Dataran: 93,1% area lereng <8° |
| 331417 | Sukodono | Dataran: 93,7% area lereng <8° |
| 331418 | Gesi | Dataran: 86,5% area lereng <8° |
| 331419 | Tangen | Dataran: 81,5% area lereng <8° |
| 331420 | Jenar | Dataran: 79,2% area lereng <8° |
| 331508 | Gabus | Dataran: 77,2% area lereng <8° |
| 331601 | Jati | Dataran: 88,3% area lereng <8° |
| 331607 | Jiken | Dataran: 75,0% area lereng <8° |
| 331608 | Jepon | Dataran: 84,5% area lereng <8° |
| 331609 | Blora | Dataran: 91,7% area lereng <8° |
| 331610 | Tunjungan | Dataran: 87,9% area lereng <8° |
| 331611 | Banjarejo | Dataran: 86,3% area lereng <8° |
| 331614 | Todanan | Dataran: 68,6% area lereng <8° |
| 331615 | Bogorejo | Dataran: 70,5% area lereng <8° |
| 331616 | Japah | Dataran: 76,5% area lereng <8° |
| 331702 | Bulu | Dataran: 66,6% area lereng <8° |
| 331703 | Gunem | Dataran: 61,0% area lereng <8° |
| 331704 | Sale | Dataran: 76,5% area lereng <8° |
| 331706 | Sedan | Dataran: 68,3% area lereng <8° |
| 331803 | Tambakromo | Dataran: 75,7% area lereng <8° |
| 331814 | Tlogowungu | Dataran: 67,4% area lereng <8° |
| 332004 | Mayong | Dataran: 69,2% area lereng <8° |
| 332008 | Bangsri | Dataran: 72,6% area lereng <8° |
| 332014 | Kembang | Dataran: 72,9% area lereng <8° |
| 332015 | Pakis Aji | Dataran: 62,9% area lereng <8° |
| 332212 | Bringin | Dataran: 60,8% area lereng <8° |
| 332216 | Bancak | Dataran: 63,0% area lereng <8° |
| 332515 | Banyuputih | Dataran: 62,8% area lereng <8° |
| 332707 | Randudongkal | Dataran: 73,0% area lereng <8° |
| 332806 | Lebaksiu | Dataran: 87,7% area lereng <8° |
| 332903 | Bumiayu | Dataran: 65,7% area lereng <8° |
| 337201 | Laweyan | Dataran: 99,7% area lereng <8° |
| 337204 | Jebres | Dataran: 97,2% area lereng <8° |
| 337205 | Banjarsari | Dataran: 99,8% area lereng <8° |
| 337415 | Ngaliyan | Dataran: 72,5% area lereng <8° |
| 340301 | Wonosari | Dataran: 94,0% area lereng <8° |
| 340303 | Playen | Dataran: 79,5% area lereng <8° |
| 340305 | Paliyan | Dataran: 78,6% area lereng <8° |
| 340308 | Semanu | Dataran: 65,5% area lereng <8° |
| 340309 | Karangmojo | Dataran: 91,3% area lereng <8° |
| 340401 | Gamping | Dataran: 96,1% area lereng <8° |
| 340402 | Godean | Dataran: 95,0% area lereng <8° |
| 340404 | Minggir | Dataran: 93,6% area lereng <8° |
| 340405 | Seyegan | Dataran: 95,3% area lereng <8° |
| 340406 | Mlati | Dataran: 98,6% area lereng <8° |
| 340407 | Depok | Dataran: 98,0% area lereng <8° |
| 340408 | Berbah | Dataran: 96,5% area lereng <8° |
| 340410 | Kalasan | Dataran: 99,2% area lereng <8° |
| 347101 | Tegalrejo | Dataran: 99,4% area lereng <8° |
| 347102 | Jetis | Dataran: 97,5% area lereng <8° |
| 347103 | Gondokusuman | Dataran: 98,0% area lereng <8° |
| 347104 | Danurejan | Dataran: 98,2% area lereng <8° |
| 347105 | Gedongtengen | Dataran: 99,0% area lereng <8° |
| 347106 | Ngampilan | Dataran: 99,2% area lereng <8° |
| 347107 | Wirobrajan | Dataran: 99,5% area lereng <8° |
| 347110 | Gondomanan | Dataran: 99,7% area lereng <8° |
| 347111 | Pakualaman | Dataran: 100,0% area lereng <8° |
| 350208 | Mlarak | Dataran: 91,7% area lereng <8° |
| 350209 | Jetis | Dataran: 97,5% area lereng <8° |
| 350210 | Siman | Dataran: 88,5% area lereng <8° |
| 350211 | Balong | Dataran: 73,8% area lereng <8° |
| 350212 | Kauman | Dataran: 97,4% area lereng <8° |
| 350214 | Sampung | Dataran: 67,1% area lereng <8° |
| 350215 | Sukorejo | Dataran: 98,5% area lereng <8° |
| 350216 | Babadan | Dataran: 99,5% area lereng <8° |
| 350217 | Ponorogo | Dataran: 99,6% area lereng <8° |
| 350220 | Jambon | Dataran: 63,6% area lereng <8° |
| 350306 | Karangan | Dataran: 68,4% area lereng <8° |
| 350312 | Pogalan | Dataran: 61,8% area lereng <8° |
| 350313 | Durenan | Dataran: 61,8% area lereng <8° |
| 350405 | Kauman | Dataran: 78,5% area lereng <8° |
| 350408 | Karangrejo | Dataran: 78,6% area lereng <8° |
| 350409 | Gondang | Dataran: 66,2% area lereng <8° |
| 350411 | Ngunut | Dataran: 99,3% area lereng <8° |
| 350413 | Rejotangan | Dataran: 84,3% area lereng <8° |
| 350417 | Bandung | Dataran: 64,8% area lereng <8° |
| 350501 | Wonodadi | Dataran: 99,0% area lereng <8° |
| 350502 | Udanawu | Dataran: 99,5% area lereng <8° |
| 350503 | Srengat | Dataran: 96,2% area lereng <8° |
| 350507 | Sanankulon | Dataran: 95,7% area lereng <8° |
| 350510 | Kanigoro | Dataran: 95,2% area lereng <8° |
| 350512 | Sutojayan | Dataran: 82,5% area lereng <8° |
| 350522 | Selopuro | Dataran: 92,3% area lereng <8° |
| 350605 | Kandat | Dataran: 99,2% area lereng <8° |
| 350606 | Wates | Dataran: 98,1% area lereng <8° |
| 350610 | Gurah | Dataran: 98,5% area lereng <8° |
| 350613 | Grogol | Dataran: 62,2% area lereng <8° |
| 350617 | Pare | Dataran: 99,0% area lereng <8° |
| 350619 | Kandangan | Dataran: 67,2% area lereng <8° |
| 350620 | Tarokan | Dataran: 74,1% area lereng <8° |
| 350623 | Ringinrejo | Dataran: 99,0% area lereng <8° |
| 350626 | Badas | Dataran: 99,2% area lereng <8° |
| 350804 | Pasirian | Dataran: 76,9% area lereng <8° |
| 350814 | Padang | Dataran: 90,5% area lereng <8° |
| 350816 | Kedungjajang | Dataran: 77,5% area lereng <8° |
| 350818 | Randuagung | Dataran: 88,3% area lereng <8° |
| 350821 | Sumbersuko | Dataran: 98,6% area lereng <8° |
| 350909 | Bangsalsari | Dataran: 70,1% area lereng <8° |
| 350920 | Patrang | Dataran: 74,9% area lereng <8° |
| 350921 | Sumbersari | Dataran: 94,2% area lereng <8° |
| 350923 | Mumbulsari | Dataran: 75,8% area lereng <8° |
| 350924 | Pakusari | Dataran: 88,0% area lereng <8° |
| 351007 | Gambiran | Dataran: 98,3% area lereng <8° |
| 351009 | Genteng | Dataran: 96,9% area lereng <8° |
| 351012 | Singojuruh | Dataran: 95,2% area lereng <8° |
| 351014 | Kabat | Dataran: 87,4% area lereng <8° |
| 351017 | Giri | Dataran: 94,9% area lereng <8° |
| 351022 | Siliragung | Dataran: 63,2% area lereng <8° |
| 351023 | Tegalsari | Dataran: 95,3% area lereng <8° |
| 351116 | Prajekan | Dataran: 75,3% area lereng <8° |
| 351203 | Suboh | Dataran: 66,9% area lereng <8° |
| 351214 | Banyuputih | Dataran: 73,3% area lereng <8° |
| 351306 | Banyuanyar | Dataran: 98,2% area lereng <8° |
| 351320 | Tegalsiwalan | Dataran: 97,5% area lereng <8° |
| 351322 | Wonomerto | Dataran: 96,4% area lereng <8° |
| 351409 | Sukorejo | Dataran: 97,9% area lereng <8° |
| 351411 | Pandaan | Dataran: 96,5% area lereng <8° |
| 351605 | Ngoro | Dataran: 72,8% area lereng <8° |
| 351607 | Kutorejo | Dataran: 97,4% area lereng <8° |
| 351609 | Dlanggu | Dataran: 99,0% area lereng <8° |
| 351704 | Bareng | Dataran: 73,2% area lereng <8° |
| 351715 | Plandaan | Dataran: 72,7% area lereng <8° |
| 351803 | Berbek | Dataran: 87,5% area lereng <8° |
| 351804 | Loceret | Dataran: 60,2% area lereng <8° |
| 351815 | Wilangan | Dataran: 87,6% area lereng <8° |
| 351816 | Rejoso | Dataran: 82,2% area lereng <8° |
| 351818 | Ngluyu | Dataran: 64,0% area lereng <8° |
| 351819 | Lengkong | Dataran: 83,6% area lereng <8° |
| 351902 | Dolopo | Dataran: 87,1% area lereng <8° |
| 351907 | Wungu | Dataran: 80,3% area lereng <8° |
| 351911 | Mejayan | Dataran: 85,6% area lereng <8° |
| 351912 | Saradan | Dataran: 79,8% area lereng <8° |
| 352003 | Lembeyan | Dataran: 92,6% area lereng <8° |
| 352005 | Kawedanan | Dataran: 85,0% area lereng <8° |
| 352010 | Bendo | Dataran: 99,1% area lereng <8° |
| 352014 | Karas | Dataran: 97,5% area lereng <8° |
| 352112 | Widodaren | Dataran: 98,2% area lereng <8° |
| 352115 | Bringin | Dataran: 88,5% area lereng <8° |
| 352117 | Karanganyar | Dataran: 87,6% area lereng <8° |
| 352119 | Kasreman | Dataran: 87,0% area lereng <8° |
| 352202 | Tambakrejo | Dataran: 79,3% area lereng <8° |
| 352203 | Ngambon | Dataran: 63,5% area lereng <8° |
| 352205 | Bubulan | Dataran: 83,1% area lereng <8° |
| 352221 | Temayang | Dataran: 64,5% area lereng <8° |
| 352225 | Kedewan | Dataran: 70,3% area lereng <8° |
| 352301 | Kenduruan | Dataran: 76,3% area lereng <8° |
| 352308 | Kerek | Dataran: 85,7% area lereng <8° |
| 352610 | Kokop | Dataran: 78,7% area lereng <8° |
| 352618 | Galis | Dataran: 85,6% area lereng <8° |
| 352711 | Sokobanah | Dataran: 76,5% area lereng <8° |
| 352712 | Ketapang | Dataran: 80,6% area lereng <8° |
| 352714 | Karangpenang | Dataran: 84,1% area lereng <8° |
| 352807 | Pegantenan | Dataran: 78,0% area lereng <8° |
| 352810 | Waru | Dataran: 62,1% area lereng <8° |
| 352811 | Batumarmar | Dataran: 71,8% area lereng <8° |
| 352812 | Kadur | Dataran: 73,8% area lereng <8° |
| 352813 | Pasean | Dataran: 79,4% area lereng <8° |
| 352905 | Bluto | Dataran: 75,6% area lereng <8° |
| 352909 | Guluk-Guluk | Dataran: 71,6% area lereng <8° |
| 352910 | Ganding | Dataran: 79,2% area lereng <8° |
| 352913 | Pasongsongan | Dataran: 79,3% area lereng <8° |
| 352914 | Dasuk | Dataran: 95,4% area lereng <8° |
| 352915 | Rubaru | Dataran: 82,4% area lereng <8° |
| 352917 | Batuputih | Dataran: 85,8% area lereng <8° |
| 357103 | Pesantren | Dataran: 99,6% area lereng <8° |
| 357202 | Sukorejo | Dataran: 99,7% area lereng <8° |
| 357203 | Sananwetan | Dataran: 99,2% area lereng <8° |
| 510202 | Selemadeg Timur | Dataran: 73,5% area lereng <8° |
| 510204 | Kerambitan | Dataran: 87,6% area lereng <8° |
| 510205 | Tabanan | Dataran: 92,6% area lereng <8° |
| 510302 | Mengwi | Dataran: 97,2% area lereng <8° |
| 510303 | Abiansemal | Dataran: 92,2% area lereng <8° |
| 510403 | Gianyar | Dataran: 87,6% area lereng <8° |
| 510405 | Ubud | Dataran: 90,0% area lereng <8° |
| 510502 | Banjarangkan | Dataran: 78,9% area lereng <8° |
| 510503 | Klungkung | Dataran: 83,2% area lereng <8° |
| 520201 | Praya | Dataran: 96,8% area lereng <8° |
| 520202 | Jonggat | Dataran: 97,7% area lereng <8° |
| 520206 | Praya Timur | Dataran: 96,1% area lereng <8° |
| 520208 | Pringgarata | Dataran: 88,4% area lereng <8° |
| 520210 | Praya Tengah | Dataran: 98,4% area lereng <8° |
| 520307 | Selong | Dataran: 94,8% area lereng <8° |
| 520313 | Suralaga | Dataran: 92,0% area lereng <8° |
| 520318 | Sakra Timur | Dataran: 96,6% area lereng <8° |
| 520319 | Sakra Barat | Dataran: 90,4% area lereng <8° |
| 530125 | Amabi Oefeto | Dataran: 63,3% area lereng <8° |
| 530206 | Amanuban Selatan | Dataran: 62,4% area lereng <8° |
| 530221 | Kualin | Dataran: 67,7% area lereng <8° |
| 531107 | Pandawai | Dataran: 71,4% area lereng <8° |
| 531108 | Umalulu | Dataran: 61,7% area lereng <8° |
| 531109 | Rindi | Dataran: 79,2% area lereng <8° |
| 531110 | Pahunga Lodu | Dataran: 84,8% area lereng <8° |
| 531403 | Lobalain | Dataran: 76,8% area lereng <8° |
| 531404 | Rote Tengah | Dataran: 61,3% area lereng <8° |
| 531806 | Kodi Bangedo | Dataran: 81,7% area lereng <8° |
| 531811 | Kodi Balaghar | Dataran: 89,4% area lereng <8° |
| 532002 | Sabu Tengah | Dataran: 84,5% area lereng <8° |
| 532101 | Malaka Tengah | Dataran: 71,1% area lereng <8° |
| 537101 | Alak | Dataran: 76,2% area lereng <8° |
| 537105 | Kota Raja | Dataran: 92,5% area lereng <8° |
| 610620 | Mentebah | Dataran: 65,1% area lereng <8° |
| 620405 | Gn. Bintang Awai | Dataran: 61,4% area lereng <8° |
| 620506 | Lahei | Dataran: 65,5% area lereng <8° |
| 630603 | Telaga Langsat | Dataran: 60,1% area lereng <8° |
| 640302 | Talisayan | Dataran: 82,0% area lereng <8° |
| 640312 | Batu Putih | Dataran: 81,2% area lereng <8° |
| 640313 | Biatan | Dataran: 65,1% area lereng <8° |
| 640707 | Barong Tongkok | Dataran: 69,6% area lereng <8° |
| 640712 | Bongan | Dataran: 65,3% area lereng <8° |
| 640808 | Kombeng | Dataran: 64,2% area lereng <8° |
| 640811 | Sandaran | Dataran: 61,6% area lereng <8° |
| 640814 | Rantau Pulung | Dataran: 68,4% area lereng <8° |
| 650105 | Tanjung Selor | Dataran: 64,5% area lereng <8° |
| 710409 | Damau | Dataran: 61,3% area lereng <8° |
| 710608 | Kalawat | Dataran: 64,4% area lereng <8° |
| 717205 | Matuari | Dataran: 83,7% area lereng <8° |
| 721014 | Marawola | Dataran: 62,3% area lereng <8° |
| 730103 | Bontomatene | Dataran: 83,8% area lereng <8° |
| 730109 | Pasilambena | Dataran: 68,2% area lereng <8° |
| 730204 | Bonto Tiro | Dataran: 73,5% area lereng <8° |
| 730210 | Rilauale | Dataran: 82,4% area lereng <8° |
| 730301 | Bissappu | Dataran: 63,4% area lereng <8° |
| 730307 | Gantarang Keke | Dataran: 97,7% area lereng <8° |
| 730802 | Kahu | Dataran: 72,2% area lereng <8° |
| 730806 | Libureng | Dataran: 64,2% area lereng <8° |
| 730815 | Palakka | Dataran: 68,1% area lereng <8° |
| 730824 | Amali | Dataran: 80,0% area lereng <8° |
| 730826 | Bengo | Dataran: 62,2% area lereng <8° |
| 731208 | Citta | Dataran: 63,6% area lereng <8° |
| 740108 | Watubangga | Dataran: 71,4% area lereng <8° |
| 740320 | Kontunaga | Dataran: 78,3% area lereng <8° |
| 740327 | Tongkuno | Dataran: 87,0% area lereng <8° |
| 740504 | Palangga | Dataran: 72,0% area lereng <8° |
| 740517 | Buke | Dataran: 78,3% area lereng <8° |
| 740519 | Laeya | Dataran: 60,5% area lereng <8° |
| 741003 | Bonegunu | Dataran: 61,8% area lereng <8° |
| 741303 | Lawa | Dataran: 74,1% area lereng <8° |
| 741401 | Lakudo | Dataran: 81,2% area lereng <8° |
| 741506 | Siompu | Dataran: 69,0% area lereng <8° |
| 747201 | Betoambari | Dataran: 68,4% area lereng <8° |
| 810126 | Saparua Timur | Dataran: 61,3% area lereng <8° |
| 810506 | Tutuk Tolu | Dataran: 63,4% area lereng <8° |
| 820314 | Galela Barat | Dataran: 60,9% area lereng <8° |
| 820419 | Mandioli Selatan | Dataran: 62,8% area lereng <8° |
