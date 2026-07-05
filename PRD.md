# PRD: Cakupan — BPS Data Coverage Explorer

## 1. Problem

BPS WebAPI exposes thousands of indicators (variables) across multiple data
sources (Dynamic Data, SIMDASI, SDGs, SDDS, Static Table, Foreign Trade), but
there is no reliable way to know, in advance, whether a given indicator is
actually available at national, provincial, or kabupaten/kota level — or for
which years — without querying the live API and inspecting the response.

This blocks downstream projects (NusaStats, Falak-adjacent regional work,
economic dashboards, TikTok content research) because every new indicator
requires manual trial-and-error against the API before anyone can trust it
will render real data instead of an empty table.

## 2. Goal

Build a standalone tool, **Cakupan** ("coverage" / "scope"), that:

1. Systematically crawls the BPS WebAPI's metadata and data endpoints.
2. Determines, for every indicator it finds, which administrative levels
   (nasional / provinsi / kabupaten-kota) actually return data, and for
   which years.
3. Stores this as a queryable, versioned **coverage catalog** — not the
   statistical data itself, just the metadata about what's fetchable.
4. Exposes the catalog via a browsable dashboard and a JSON/API export that
   other projects (e.g. NusaStats) can consume directly instead of
   re-discovering coverage themselves.

Cakupan is a **meta-tool**. It does not visualize GDP or poverty rates. It
answers: *"If I want indicator X for kabupaten Y in year Z, does BPS
actually have that, and via which endpoint?"*

## 3. Non-Goals

- No statistical analysis, charting, or interpretation of the underlying
  data values.
- No ML/AI anywhere in the discovery or classification pipeline — coverage
  is either confirmed by a real API response or it isn't.
- No attempt to "fill in" or estimate missing coverage. Absence is recorded
  as absence, not imputed.
- Not a general-purpose BPS data downloader for end users — it's an
  internal/developer-facing catalog service.

## 4. Users

- Primarily: you, as the input layer for other projects (NusaStats,
  economic dashboards, TikTok data research).
- Secondarily: anyone building on BPS data who wants to skip the manual
  discovery phase.

## 5. Core Requirements

### 5.1 Domain Crawling
- Fetch and cache the full domain list: nasional (`0000`), all 34/38
  provinsi, and all kabupaten/kota via `type=kabbyprov` per province.
- Store `domain_id`, `domain_name`, `domain_url`, `admin_level`
  (national/province/regency), and `parent_province_id` where applicable.

### 5.2 Subject & Variable Discovery
- Walk Subject Categories → Subjects → Variables for the national domain
  (variables are shared across the dynamic-table system; regions are a
  parameter, not a separate variable set).
- For each variable, fetch its Vertical Variable (`vervar`) list to
  determine which regions the *indicator itself* claims to cover
  (label-level claim, not yet confirmed by real data).

### 5.3 Coverage Confirmation (the actual point of this tool)
- For each variable, issue real `data` model calls at a **sample** of
  domains per level (national always; a fixed sample of provinces; a fixed
  sample of kabupaten/kota per sampled province — not all ~514, to respect
  rate limits) and record:
  - Whether `data-availability` was `available` or `not-available`
  - Which years (`th`) actually returned non-null `datacontent`
  - Timestamp of the check and the exact endpoint/URL used
- A variable is marked `confirmed_national` / `confirmed_provinsi` /
  `confirmed_kabupaten` only when at least one real, successful, non-empty
  response was observed at that level. No level is marked confirmed by
  inference from another level.
- Re-crawls are idempotent: re-checking a variable updates its coverage
  record rather than duplicating it, and keeps a history of when coverage
  changed (BPS does add/remove data over time).

### 5.4 SIMDASI Track (separate, because it's a separate system)
- Crawl SIMDASI subjects and master tables per 7-digit MFD region code.
- Because SIMDASI is inherently region-scoped (you query *for* a region,
  rather than a national variable that may or may not have regional
  breakdowns), record per-table: which kabupaten/kota codes were checked
  and which years (`ketersediaan_tahun`) were present in the response.

### 5.5 Coverage Report (mandatory deliverable, not just a UI feature)
- A generated, human-readable report (Markdown + JSON) summarizing:
  - Total variables discovered, and how many confirmed at each admin level
  - Per-subject-category breakdown of coverage
  - Known gaps (indicators that exist nationally/provincially but never
    confirmed at kabupaten level after sampling)
  - SIMDASI table coverage per sampled kabupaten
- This report must be generated from a real crawl run against the live API
  before any dashboard UI work begins (see CLAUDE.md validation gate).

### 5.6 Dashboard (secondary, after catalog is proven correct)
- Browse subjects → variables, see a coverage badge per admin level
  (confirmed / not confirmed / unchecked) with last-checked timestamp.
- Filter by: admin level confirmed, subject category, keyword.
- Detail view per variable: which vervar/domains were tested, which years
  responded, direct link to construct the real API call.
- Export button: download the catalog (or a filtered slice) as JSON for
  use in another project's ingestion pipeline.

### 5.7 API for Other Projects
- A DRF read-only API (`/api/coverage/variables/`,
  `/api/coverage/variables/{id}/`, `/api/coverage/simdasi/`) so NusaStats
  or similar can query "give me all confirmed-kabupaten variables in
  subject X" programmatically instead of parsing the exported JSON.

## 6. Architecture Principles (non-negotiable)

- **Deterministic, no ML/AI in the pipeline.** Coverage is a fact recorded
  from an HTTP response, not a prediction.
- **Full auditability.** Every coverage record stores the exact endpoint
  URL, HTTP status, timestamp, and a hash of the raw response body it was
  derived from. If asked "why do you think this is confirmed", the answer
  is always traceable to one stored response.
- **Idempotent crawling.** Running the crawler twice never creates
  duplicate records; it updates `last_checked_at` and flags any change in
  coverage status.
- **Rate-limit respecting.** BPS API has no publicly documented hard rate
  limit, but the crawler must throttle (configurable delay between calls,
  default conservative) and back off on 429/5xx.
- **Sampling, not exhaustive crawling, for kabupaten level.** ~514
  kabupaten/kota × thousands of variables is not feasible or polite to
  crawl exhaustively. Sampling strategy and sample size must be explicit
  and documented in the report, not silently partial.

## 7. Tech Stack (matches existing pattern)

- Backend: Django 5 + DRF
- Async/scheduled crawling: Celery + Redis (Redis also used as response
  cache to avoid re-hitting BPS during dev/debug)
- DB: PostgreSQL (stores catalog, coverage records, raw response hashes;
  raw response bodies themselves can go to flat files or JSONB depending
  on volume — decide during build)
- Frontend: Next.js 14 + Tailwind, Recharts/D3 for simple coverage-summary
  visualizations (bar of confirmed-per-level counts, not statistical data)
- Deployment: Docker Compose

## 8. Success Criteria

- A completed first crawl produces a coverage report with real, timestamped
  evidence for every claim (X out of Y variables confirmed at kabupaten
  level, etc.) — not a hardcoded or assumed summary.
- NusaStats (or a similar future project) can query Cakupan's API and get
  a straight answer to "does indicator X exist at kabupaten level" without
  ever calling BPS directly for discovery purposes.
- The report explicitly states its sampling methodology so results aren't
  mistaken for exhaustive ground truth.
