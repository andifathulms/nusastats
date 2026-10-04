# DESIGN.md — NusaStats frontend design standard ("Laut & Kertas")

This is the design standard for everything under `frontend/`. Read it before
adding or changing any UI. New pages and components must look like they belong
to the existing app, in **both light and dark themes**, on **desktop and phone**.

The direction in one line: **deep sea blue (laut) on warm cream paper (kertas),
with turmeric (kunyit) as the single warm highlight**; an editorial serif for
headlines and reading, a Jakarta-made sans for UI and numbers.

---

## 1. Hard rules (do not break)

1. **Never hard-code a colour in a component.** Use the theme tokens
   (`ink-*`, `coal-*`) so the component works in dark mode. Raw hex is allowed
   only for (a) fixed surfaces that are dark in both themes (`coal-*` bands, map
   tooltips) and (b) categorical chart series that clear 3:1 on both themes.
2. **Every number is formatted the Indonesian way** with the helpers in
   `lib/api.ts`. Never `toLocaleString()` without `"id-ID"`, and never
   `.toFixed()` for anything a user reads.
3. **Never build an in-app URL by hand.** Use `lib/routes.ts`
   (`routes.region(code)`, `routes.post(slug)`, `provinceHref(dukCode)`, …).
4. **Never match BPS and Dukcapil regions by code.** Province: `provinceHref`
   / `dukcapilProvinceCode`. Kab/kota: the regency crosswalk or bridge API.
5. **No placeholder or invented data in the UI.** No fake numbers, no "assume
   confirmed" states, and no map highlight of a region the content doesn't
   name. A gap shows as "tanpa data" in the neutral grey, never as a low value.
6. **Every page has real loading, empty and error states.** Use `Skeleton*` /
   `Loadable`, `EmptyState` and `ErrorState`. Never show a bare "Memuat…".
7. **Respect `prefers-reduced-motion`.** `globals.css` already freezes CSS
   animation. JS motion (count-ups etc.) must check it, as `useCountUp` does.
8. **Check both themes and both widths** before you consider UI work done
   (see §11).

---

## 2. Colour

All semantic colours are CSS variables (RGB channels) defined in
`app/globals.css` for `:root` (light) and `.dark`, and exposed as Tailwind
colours in `tailwind.config.ts`. Opacity modifiers work (`bg-ink-accent/10`).

### Semantic tokens: use these in components

| Token | Light | Dark | Use |
|---|---|---|---|
| `ink-bg` | `#FBF7EE` | `#0B1730` | page background |
| `ink-bg2` | `#F3ECDD` | `#0E1C3A` | sunken fills, fact boxes, segmented-control track |
| `ink-panel` | `#FFFDF8` | `#10213F` | cards / panels |
| `ink-panel2` / `panel3` | `#F5EFE2` / `#EDE5D3` | `#142849` / `#1A3156` | subtle fills, bar tracks, chart grid |
| `ink-border` / `borderStrong` | `#E6DCC6` / `#CDBF9F` | `#22365C` / `#34507F` | hairlines / emphasised outlines |
| `ink-text` | `#12203A` | `#F3ECDD` | primary text |
| `ink-muted` | `#5A6274` | `#A9B6CF` | secondary text (AA on all surfaces) |
| `ink-faint` | `#8A93A6` | `#7686A3` | placeholders, tertiary labels. **Not** for body text |
| `ink-accent` | `#1C4596` | `#8FB0F0` | links, active states, primary marks |
| `ink-onAccent` | `#FFFFFF` | `#0A1A33` | text on a solid `ink-accent` fill |
| `ink-accent2` | `#D69A2D` | `#E9B54A` | kunyit: decorative dots and marks only |
| `ink-warmText` | `#8A5A10` | `#E9B54A` | kunyit dark enough for small text (eyebrows) |
| `ink-gold` | `#E9B54A` | same | kunyit on dark `coal-*` surfaces |
| `ink-good` / `warn` / `bad` | green / amber / red | lighter variants | semantic state only, never decoration |
| `coal-bg`, `coal-bg2`, `coal-text`, `coal-muted`, `coal-border` | deep sea | deep sea | hero bands, map panels, footer: **dark in both themes** |

### Raw scales: fixed steps only

`laut-50 … laut-950` (sea blue, `700` = brand primary, `950` = deepest),
`kertas-50 … kertas-400` (cream), `kunyit` / `kunyit-light` / `kunyit-ink`.
Use them where a colour must **not** flip with the theme (the logo, the active
nav pill in light mode, map tooltips). Anywhere else, use semantic tokens.

### Colour rules

- **Kunyit is the only warm colour and it means "look here"**: an active
  highlight, a rank chip, the reading-progress line, an eyebrow label. Use at
  most one or two kunyit elements per view, and never as a large fill.
- Primary actions use `bg-brand-gradient text-white` (dark blue in both themes).
- **Active/selected pills** (nav, segmented controls, filter chips) use
  `bg-laut-950 text-kertas-200 dark:bg-ink-accent dark:text-ink-onAccent`.
- Charts: use `CHART.*` and `SERIES_COLORS` from `lib/api.ts`. They are CSS
  variable strings, so they follow the theme. Assign series slots in order and
  fold anything past 8 into "Lainnya" (`CHART.neutral`).
- **Choropleths run pale sea to deep sea** in light mode
  (`#E3EBFA → #10264D`) and dark sea to cream in dark mode, so high values
  always read as the "strongest" colour. Pick the ramp with `useIsDark()`
  (`lib/theme.ts`). The deep-sea hero map uses `SEA_RAMP`
  (`components/home/HeroMap.tsx`). "No data" stays a neutral grey
  (`#D6D3CA` / `#2E3442`), off the ramp.

---

## 3. Typography

Loaded with `next/font` in `app/layout.tsx`. Tailwind families:

| Family | Font | Use |
|---|---|---|
| `font-sans` (default) | Plus Jakarta Sans | UI, body text, **all numbers** |
| `font-display` | Newsreader (optical-size axis) | page titles, section headings, card titles, Sorotan reading body |
| `font-mono` | JetBrains Mono | region codes, URLs/hashes, eyebrow labels, legends |

### Scale (keep to it)

| Role | Classes |
|---|---|
| Hero display | `font-display text-[44px] sm:text-6xl lg:text-[66px] font-medium leading-[1.0] tracking-[-0.025em]` |
| Page title (`PageHeader`) | `font-display text-4xl sm:text-5xl font-medium leading-[1.02] tracking-[-0.02em]` |
| Section heading | `font-display text-3xl sm:text-[38px] font-medium tracking-[-0.015em]` |
| Card title | `font-display text-2xl font-medium leading-[1.12]` (lead card `text-[30px]`) |
| Big stat | `text-[26px]–[46px] font-extrabold tracking-[-0.02em] tabular-nums whitespace-nowrap` |
| Body | `text-[15px] leading-relaxed` (lede `text-[17px]`) |
| Eyebrow (`Eyebrow`) | `font-mono text-[11.5px] uppercase tracking-[0.1em] text-ink-warmText` |
| Small caps label | `text-[11px] font-bold uppercase tracking-[0.08em] text-ink-muted` |
| Article body | `.prose-read` (Newsreader ≈19px / 1.68) on a ≤ 680px column |

### Typography rules

- Headings get `text-wrap: balance` globally. Italic display (`<em>`) in
  `text-ink-accent` is allowed once, in a hero headline.
- **Numbers are always Plus Jakarta Sans** with `tabular-nums` where they
  line up in columns. Never set big figures in the serif.
- An eyebrow sits above the heading it labels and says something true (source,
  count, section), not decoration.

---

## 4. Numbers and copy

- `formatNumber(n)` gives `284.973.643` (full integer, id-ID).
- `formatDecimal(n, d)` gives `1,5` (fixed decimals, comma).
- `formatCompact(n)` gives `284,97 juta` / `2,7 juta` / `81,8 rb` (tiles, lists, chart labels).
- `formatRupiah(n)` / `formatByUnit(n, unit)` give `Rp 212,06 T` and percentages for DJPK values.
- Region names: `regionLabel(name, status)` adds "Kota / Kab. / Desa / Kel. …";
  `titleCase()` fixes BPS's "Dki Jakarta".
- UI copy is **Bahasa Indonesia**: plain, active, specific ("Cari wilayah,
  indikator…", "Tidak ada indikator yang cocok"). Errors say what failed and
  what to do.
- Every figure that comes from a source names that source nearby
  ("Sumber: Dukcapil", "Data 2024").

---

## 5. Shape, depth, spacing, motion

- **Radii:** cards and panels `rounded-[20px]`; stat tiles `rounded-[18px]`; hero
  bands and map panels `rounded-[24px]–[28px]`; buttons, inputs, chips, tabs and
  badges `rounded-full`. Don't mix `rounded-lg` buttons into new UI.
- **Shadows** (theme-aware): `shadow-tile` (resting card), `shadow-panel`
  (panel / hover), `shadow-lift` (heroes, popovers, hover-lift cards),
  `shadow-glow` (primary buttons only).
- **Card styling is for objects.** Don't wrap every block in a bordered card;
  section headings and plain text sit on the page.
- **Spacing:** page sections `space-y-16 sm:space-y-20` (home) or `space-y-6`
  to `space-y-10` (inner pages); card padding `p-5 sm:p-6`; hero padding
  `p-6 sm:p-9`; layout gaps `gap-4`–`gap-8`. Lay out siblings with grid/flex
  `gap`, not margins.
- **Container:** the layout already provides `max-w-7xl px-4 sm:px-5 lg:px-8`.
  Don't add another page-level max width except for reading columns.
- **Motion:** hover lift `hover:-translate-y-0.5` / `-1` with `transition-all`;
  arrow nudge `group-hover:translate-x-1`; skeletons shimmer; `animate-fade-up`
  for popovers. Use one count-up per hero at most. No looping decoration.

---

## 6. App shell (already built: reuse, don't fork)

- `Topbar` (`components/Topbar.tsx`): cream blurred bar, `Logo`, pill nav,
  search trigger, `ThemeToggle`, optional sub-nav row for sections with
  children. Add a section by extending `NAV` there.
- `MobileNav`: fixed bottom tab bar below `md`. The footer already pads for it.
  Don't add other fixed-bottom UI on phones.
- `Footer`: sources and provenance promise, plus a theme switch for phones.
- `CommandPalette`: ⌘K / Ctrl+K / "/" global search over `/api/search/`
  (regions, kecamatan/desa, indicators) plus Sorotan posts. Open it from
  anything with `openSearch(initialQuery?)`. Don't build a second search box
  with its own results.
- Sticky offsets: the top bar is `h-16`, so sticky things use `top-16`
  (`StickyTabs`, reading progress) or `top-24`/`top-28` for side columns.

---

## 7. Components: use these before writing new ones

| Need | Use |
|---|---|
| Page title block | `PageHeader` (eyebrow + display title + lede) / `Eyebrow` |
| Card / panel | `Panel` |
| Headline figure | `StatTile` (or the hero `facts` in `RegionHero`) |
| Small label | `Badge` (pill) |
| Loading | `Skeleton`, `SkeletonTile`, `SkeletonRows`, `SkeletonChart`, `Loadable` (keeps the last render dimmed on refetch) |
| Empty / failure | `EmptyState` (illustrated) / `ErrorState` |
| Dark profile header | `RegionHero` (+ `Breadcrumbs`, `StickyTabs`) in `components/explore/RegionHero.tsx` |
| Overview choropleth | `OutlineMap` (pre-projected outlines, quantile classes, hover tooltip, `highlight` / `onHover` for linked lists) |
| Interactive zoomable map | `ChoroplethMap` (full geojson, zoom, kec/desa levels) |
| Story / page cover | `StoryCover` (archipelago with optional named-province highlight) |
| Sorotan card | `PostCard`; article chrome `ReadingProgress`, `ArticleIndex`, `CopyLink` |
| Post viz primitives | `Stat`, `PillToggle`, `PageBtn` in `components/sorotan-ui.tsx` |

### Recurring patterns

- **Hero band** (Dukcapil, Keuangan, region profiles, home map):
  `relative overflow-hidden rounded-[28px] bg-coal-bg text-coal-text shadow-lift ring-1 ring-white/5`
  plus an `absolute inset-0 bg-royal-weave opacity-50` overlay. The eyebrow is
  `text-ink-gold`, text uses `coal-text` / `coal-muted`, and rank chips are
  `bg-kunyit-light text-laut-950 font-mono`.
- **Segmented control:** track `rounded-full border border-ink-border bg-ink-bg2 p-1`;
  options `rounded-full px-3.5 py-1.5 text-[13.5px] font-semibold`; active
  `bg-ink-panel text-ink-text shadow-tile` (or the dark pill from §2).
- **Filter chips with counts:** `rounded-full border` with the count in
  `text-ink-faint`, `aria-pressed`, dark-pill active state.
- **Ranked list row:** `grid grid-cols-[minmax(0,1fr)_96px_76px]`: name, a
  `h-1.5 rounded-full bg-ink-panel2` track with an `bg-ink-accent` fill, then a
  right-aligned `tabular-nums` value.
- **Map + list linked:** share a `hover` code between `OutlineMap highlight` and
  the list rows (see `components/explore/AreaExplorer.tsx`).
- **Breadcrumbs** on every detail page: Indonesia › province › kab/kota › …

---

## 8. Page archetypes

- **Landing / section home:** hero (thesis + action, or a dark band), then
  sections each led by `Eyebrow` + display heading, then content. Lead with the
  most telling visual (a map, a key figure), not a grid of equal tiles.
- **Browse / catalog:** header, then facets in a left sidebar on `lg`
  (collapsed behind a "Saring" button on phones), then results with a sort
  control. **All filter state lives in the URL** (`useSearchParams` + `router.replace`,
  wrapped in `<Suspense>`) so views are shareable. Example: `app/variables/page.tsx`.
- **Detail / profile:** breadcrumbs, then a `RegionHero`-style band with 2–4
  headline facts **with context** (rank chips), then `StickyTabs`, then the body.
- **Article (Sorotan):** index column + 680px reading column + margin note
  (the post config's `note`), full-width interactive viz, a "Dari mana angka
  ini?" provenance block, related posts.

---

## 9. Data honesty in the UI

- Coverage and availability badges reflect real `CoverageRecord.status` / stored
  responses. Never show an optimistic state.
- `StoryCover` highlights (`cover.prov` in `lib/posts.ts`) list only provinces
  the story's text names. Otherwise leave it empty and the whole country shows.
- When BPS has no data at a level (kecamatan/desa), say so explicitly rather
  than showing an empty chart.
- Keep sources separate in presentation: label which source (BPS / Dukcapil /
  DJPK) each block comes from.

---

## 10. Accessibility and responsiveness

- Every form control has an `id` and an accessible name (`aria-label` or a
  `<label>`). Tabs use `role="tablist"` / `role="tab"` / `aria-selected`; toggles use `aria-pressed`;
  the current nav item gets `aria-current="page"`.
- Focus is visible (global `:focus-visible` ring; don't remove outlines).
  Interactive map regions are focusable and work with Enter.
- Body text stays ≥ AA. `ink-faint` is for placeholders and decoration only.
- Phone width (≈390px): no horizontal page scroll; grids collapse to one
  column; wide tables scroll inside their own `overflow-x-auto` container;
  long figures stay on one line (`whitespace-nowrap`) at a smaller size.

---

## 11. Before you call UI work done

1. `docker exec nusastats-frontend-1 sh -c 'cd /app && npx tsc --noEmit -p .'` passes.
2. Look at the page at **1440px light, 1440px dark, and 390px** (Playwright
   screenshots or a browser). Check: no overflow, text readable on every
   surface, no light-only colours leaking into dark mode, loading/empty/error
   states render.
3. No raw hex, no `toFixed` / `toLocaleString()` for display, no hand-built
   routes in the diff.
4. If you add a new map or cover that uses outlines and the boundaries changed,
   regenerate them with `python3 frontend/scripts/build_outline_paths.py frontend/public`.

## Known leftovers

Several Sorotan post components (`components/*Post.tsx`) still format some
figures with `.toFixed()` (English decimal point). Convert them to
`formatDecimal` when you touch those files.
