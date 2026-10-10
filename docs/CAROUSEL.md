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
`pack.json`, `provenance.json`) and gives the exact `npm run carousel` command for the PNGs. The
form lives in the URL. "Buat carousel" links on BPS variable pages, `/dukcapil` and `/keuangan`
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

This writes `pack.json`, `provenance.json`, `map.json`, `deck.txt`, `README.md` and the map PNGs
to `exports/carousels/{id}/` (gitignored), plus `carousel-press.url`, which opens the deck in Carousel
Press (`#deck=<base64url>`; the base URL comes from `CAROUSEL_PRESS_URL`). Then open it, or paste
`deck.txt` there, unzip its
PNGs into the same folder, and upload everything in name order: `{id}_01.png`, `{id}_01a_peta.png`,
`{id}_02.png`, `{id}_02a_6409.png`, … and, after the #1 reveal, `{id}_NNb_top10.png`, a bar chart
of the top (or bottom) 10. Cards carry the "Nusantara Mapper" tag, and the caption says "Diolah oleh
Nusantara Mapper" (`BRAND` in `AngkaCard.tsx` and `carousel_deck.py`).

| Option | Meaning |
|---|---|
| `--source` | `bps` (BPS var id), `dukcapil` (field or derived key), `djpk` (akun or ratio key) |
| `--level` | `provinsi`, `kabupaten`, `kecamatan` (Dukcapil only) |
| `--period` | year (BPS, DJPK); Dukcapil defaults to the latest snapshot |
| `--prov` | Kemendagri province code: rank one province's regions ("Daerahmu" posts) |
| `--recipe` | `top` (countdown to #1), `terendah` (countdown to the lowest), `gap` (highest vs lowest) |
| `--bg` | Peta Wilayah layer behind each region's map: `terrain`, `landcover`, `none` |
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

## Kabupaten profile cards (`npm run card`)

Besides rankings, one kabupaten can be posted as a set of maps:

```bash
cd frontend
npm run card -- --template profil --kode 6409     # all seven, numbered in posting order
npm run card -- --template wilayah --kode 3201    # one template
```

| Template | Shows | Needs |
|---|---|---|
| `wilayah` | kecamatan map with their names (small ones numbered, with a legend), counts, population, area | boundaries + Dukcapil |
| `kepadatan` | population density per desa on fixed classes (< 10 … ≥ 5.000 jiwa/km²), "half the residents live in X% of the area" | boundaries + Dukcapil + BIG area |
| `cahaya` | registered residents per desa next to night lights: "X% penduduk tinggal di desa yang terang malam hari" (a desa is lit when ≥ 50% of its area is) | `desa.json` + Peta night lights |
| `kecamatan` | one Dukcapil ratio per kecamatan, named on the map (`--indicator`: `median_age` default, `pct_elderly`, `pct_productive`, `sex_ratio`, `pct_sarjana`, `dependency_ratio`) | boundaries + Dukcapil |
| `rendah` | the lowland layer, desa mostly under 10 m outlined, and "N penduduk tinggal di desa yang sebagian besar wilayahnya di bawah 10 m" (a lower bound: surface model) | `desa.json` + Peta lowland |
| `terrain`, `lowland`, `relief`, `landcover`, `nightlights` | the Peta Wilayah layers | Peta outputs for that kode |

Output goes to `exports/cards/profil/{kode}/{NN}_{template}.png`. The first two work everywhere,
Papua included, and the Peta layers wherever the pipeline has run.
