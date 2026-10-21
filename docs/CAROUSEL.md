# Carousel export (Peta Angka / Carousel Press)

Turns one NusaStats ranking into a TikTok photo carousel: a `carousel-data/1` pack, a deck for
[Carousel Press](https://github.com/andifathulms/carousel-press), and 1080×1920 map cards that sit
between the deck's slides. Background and the data checks behind it: `docs/RECON_CAROUSEL.md`.

```
api/carousel.py        build_pack()   one source, one metric -> pack + provenance + map values
api/carousel_deck.py   deck_bundle()  pack -> deck text + the map cards to render
/card/angka/{scope}    AngkaCard      overview choropleth, or ?focus= one region on its Peta layer
scripts/card/carousel.mjs             all of the above into exports/carousels/{id}/
```

## In the app

`/carousel` builds the same bundle in the browser: pick a source, indicator, level, period and
province. It previews the map cards, shows the deck text (copy, or download `deck.txt`,
`pack.json`, `provenance.json`), a ready-to-paste TikTok title (≤ 90 characters) and description,
**Unduh semua (ZIP)** (every map card as PNG, named to sit between the deck slides, plus
`deck.txt`, `tiktok.txt`, `README.md`, `pack.json`, `provenance.json` and `carousel-press.url`;
or **PNG** under one card), and the `npm run carousel` command as the no-service alternative.
The downloads come from the `cards` service (`GET :3012/deck-zip?<deck query>`,
`/shot?path=/card/…`). The
form lives in the URL. **Pilih cepat** above the form holds one-click rankings (penduduk, usia &
keluarga, pendidikan & kesejahteraan, pekerjaan & budaya, keuangan daerah), each checked against
the live packs; a click fills the form and builds. Switch the level there (kabupaten/kota,
provinsi, kecamatan) and pick a province for a one-province "Daerahmu" version. Kecamatan presets
are Dukcapil only and need a province: across Indonesia 39 of 7.285 kecamatan have no values, so a
national kecamatan list may not be called the highest. A preset that a province can't fill
completely (e.g. kecamatan density in 5 provinces) is refused with the reason
(`PRESETS` in `app/carousel/page.tsx`). "Buat carousel" links on BPS variable pages, `/dukcapil` and `/keuangan`
prefill it.

## One command

The stack must be running (`docker compose up`). The first time only, set up the exporter:
`cd frontend/scripts/card && npm ci && npx playwright install chromium`.

```bash
cd frontend
npm run carousel -- --source bps --metric 415 --level kabupaten --period 2025
npm run carousel -- --source dukcapil --metric sex_ratio --level kabupaten --prov 64 --recipe gap --bg landcover
npm run carousel -- --source djpk --metric rasio_kemandirian --level kabupaten --period 2024
```

This writes `pack.json`, `provenance.json`, `map.json`, `deck.txt`, `README.md`, `tiktok.txt` (title
and description to paste when posting) and the map PNGs
to `exports/carousels/{id}/` (gitignored), plus `carousel-press.url`, which opens the deck in Carousel
Press (`#deck=<base64url>`; the base URL comes from `CAROUSEL_PRESS_URL`). Then open it, or paste
`deck.txt` there, unzip its
PNGs into the same folder, and upload everything in name order: `{id}_01.png`, `{id}_01a_peta.png`,
`{id}_02.png`, `{id}_02a_6409.png`, … and, after the #1 reveal, `{id}_NNb_top10.png`, a bar chart
of the top (or bottom) 10 (or 20/50, see `--table`). The overview map names no regions: it ends with "Siapa nomor 1? Geser untuk lihat peringkatnya", so the ranking stays the payoff. Cards carry the "Nusantara Mapper" tag, and the caption says "Diolah oleh
Nusantara Mapper" (`BRAND` in `AngkaCard.tsx` and `carousel_deck.py`).

| Option | Meaning |
|---|---|
| `--source` | `bps` (BPS var id), `dukcapil` (field or derived key), `djpk` (akun or ratio key) |
| `--level` | `provinsi`, `kabupaten`, `kecamatan` (Dukcapil only) |
| `--period` | year (BPS, DJPK); Dukcapil defaults to the latest snapshot |
| `--prov` | Kemendagri province code: rank one province's regions ("Daerahmu" posts) |
| `--recipe` | `top` (countdown to #1), `terendah` (countdown to the lowest), `gap` (highest vs lowest) |
| `--bg` | Peta Wilayah layer behind each region's map: `terrain`, `landcover`, `none` |
| `--table` | rows in the ranking table: `10` (default), `20`, `50`; one table card per 10 rows (`/card/angka/…&view=top10&start=11`) |
| `--maps` | `0` = table only: no countdown slides or focus maps; the table cards count down (#41–50 first, #1–10 last) |
| `--turvar`, `--th`, `--unit`, `--label-metric`, `--allow-partial` | see refusals below |

Without the frontend, `manage.py export_carousel_pack … --out-dir exports/carousels` writes the
same files except the PNGs. `GET /api/carousel/pack/` and `/api/carousel/deck/` serve the same
builder.

## Refusals and warnings

The builder refuses (HTTP 422 / non-zero exit, with the reason) rather than produce a misleading
pack:

- **Incomplete coverage** (fewer regions with a value than exist): pass `--allow-partial`, and the
  notes then say "n = X dari Y".
- **A BPS variable with several breakdowns or periods in a year**: pass `--turvar` / `--th` (the
  message lists them).
- **No BPS unit** ("Tidak Ada Satuan"): pass `--unit`, e.g. `indeks`.
- **Two rows on one Kemendagri region**: data needs fixing first.

Warnings are printed but don't stop the export. They cover the channel's fairness rules (headlining
a lowest ranking; a bottom that is mostly Papua), a cover headline at risk of breaking mid-word, a
metric name too long for the headline, and regions without a Peta layer (those cards show the
region's outline). Every number on a slide and a card is the pack's value, formatted once by the
backend (`fmt_value`). Edit only the cover hook.

## Kabupaten profile cards

In the app: `/carousel` → **Profil kabupaten** (`/carousel?mode=profil&kode=7311`). Pick a
kabupaten to preview its cards, then **Unduh semua (ZIP)** or one **PNG**. Cards whose data isn't
there yet say why instead of showing. The PNGs come from the `cards` service in docker-compose
(`frontend/scripts/card/serve.mjs`, the same Playwright as `npm run card`; `GET :3012/zip?kode=7311`,
`/png?template=terrain&kode=7311`). If it isn't running, the page says so:
`docker compose up -d cards`.

Below the cards, **Judul & deskripsi TikTok** gives a title (the hook, ≤ 90 characters) and a
description with one line per slide, each quoting the numbers that slide shows, then the
question, the sources and hashtags. The ZIP holds the same text as `00_judul-dan-deskripsi.txt`,
numbered for the slides actually in it. The numbers come from `components/cards/facts.ts`, the
same functions the cards call, and a slide that fails its guardrails gets no line
(`components/cards/caption.ts`; as text: `/card/caption/{kode}?cards=…`).

From the terminal (`npm run card`):

Besides rankings, one kabupaten can be posted as a set of maps:

```bash
cd frontend
npm run card -- --template profil --kode 6409     # the 11-slide profile, numbered in posting order
npm run card -- --template wilayah --kode 3201    # one template
```

| Template | Shows | Needs |
|---|---|---|
| `wilayah` | kecamatan map, one colour each, with their names (small ones numbered, with a legend); the neighbouring kabupaten as full-bleed land with their names; callouts with dotted leaders for the kecamatan with the highest/lowest population, density and area, placed in free space around the map (`placement.ts`); kecamatan, desa/kelurahan, population, area and density | boundaries + Dukcapil + BIG area |
| `kepadatan` | population density per desa on fixed classes (< 10 … ≥ 5.000 jiwa/km²), "half the residents live in X% of the area" | boundaries + Dukcapil + BIG area |
| `cahaya` | registered residents per desa next to night lights: "X% penduduk tinggal di desa yang terang malam hari" (a desa is lit when ≥ 50% of its area is) | `desa.json` + Peta night lights |
| `kecamatan` | one Dukcapil ratio per kecamatan, named on the map (`--indicator`: `median_age` default, `pct_elderly`, `pct_productive`, `sex_ratio`, `pct_sarjana`, `dependency_ratio`) | boundaries + Dukcapil |
| `rendah` | the lowland layer, desa mostly under 10 m outlined, and "N penduduk tinggal di desa yang sebagian besar wilayahnya di bawah 10 m" (a lower bound: surface model) | `desa.json` + Peta lowland |
| `terrain`, `lowland`, `relief`, `landcover`, `nightlights` | the Peta Wilayah layers | Peta outputs for that kode |

Output goes to `exports/cards/profil/{kode}/{NN}_{template}.png`, in this posting order:
`kepadatan` (the hook: "Separuh warga X tinggal di Y% wilayahnya"), `wilayah`, `terrain`, `relief`,
`lowland`, `rendah`, `landcover`, `nightlights`, `cahaya`, `kecamatan`, `penutup` (the province with
the kabupaten ringed, "Kabupaten mana berikutnya?"). Each raster layer comes right before the card
that weighs it by population (lowland → rendah, nightlights → cahaya).

Layout (`components/cards/layout.tsx`): text stays in x 64–920, y 160–1500, clear of TikTok's
top bar, icon column and caption; the map may run to x 1016. Each card puts the facts below the
map (wide kabupaten) or beside it on the left (tall ones, e.g. Barru), whichever gives the bigger
map, and the 22 px source line sits at y 1514. `?debug=1` on any /card URL draws the zones and a
mock of TikTok's carousel UI on top.

**Tema kartu** (next to the mode tabs on `/carousel`, remembered in the browser) picks the
palette for every card, preview and download: **Malam** (ink, the default), **Laut** (deep
navy), **Kertas** (warm paper) and **Putih** (white). Cards and the `cards` service take
`?tema=malam|laut|kertas|putih` (`TEMAS` in `components/cards/brand.ts`). Every map colour is a CSS
variable from that palette; on the light palettes the data ramps flip (more = darker) so the top
class doesn't vanish into the paper. The night-light satellite image stays dark in every palette.

The cards have their own look, "Atlas Malam" (proposal: "Arah Visual Nusantara Mapper"):
Archivo, an ink background, one theme colour per subject (`components/cards/brand.ts`, the
`.nm-card` layer in `globals.css`) and a palette per kind of number (`geo.PALETTES`: magma for
amounts, viridis for ratios, diverging around 100 for sex ratio). The first two work everywhere,
Papua included, and the Peta layers wherever the pipeline has run.
