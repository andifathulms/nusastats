# CLAUDE.md — Build Rules for Cakupan

## Non-negotiable architectural rules

1. **No ML/AI anywhere in the coverage-detection path.** Coverage status is
   set only from a real HTTP response to the BPS WebAPI. Never infer,
   guess, or hardcode a coverage value. If you don't have a stored response
   backing a coverage record, that record must not exist.
2. **Every coverage record is traceable.** Each record must store: the
   exact URL called (with params, key redacted in logs/UI), HTTP status,
   response timestamp, and a hash of the raw response body. No exceptions,
   including for "obviously available" national-level data.
3. **Idempotent crawling.** Use `get_or_create` / upsert patterns keyed on
   (variable_id, domain_id, model_type). Re-running a crawl updates
   `last_checked_at` and appends to a history table if status changed; it
   never creates duplicate coverage rows.
4. **Explicit sampling, never silent partial crawls.** Kabupaten-level
   checks use a documented, configurable sample (e.g. N provinces × M
   kabupaten each). This sample list must be logged and included in the
   generated report. Do not crawl "as many as time allows" without
   recording exactly which were checked.
5. **Rate limiting is mandatory, not optional.** Default: max 1 request per
   configurable interval (start conservative, e.g. 500ms-1s between calls),
   exponential backoff on non-200 responses, hard stop after N consecutive
   failures rather than hammering the API.
6. **API key handling.** BPS API key lives in `.env`, never committed,
   never logged in plaintext (mask in any debug output).

## Build order (strict — do not skip ahead)

### Phase 1: Scaffold
- Django 5 project + DRF, PostgreSQL, Redis, Celery wired up via Docker
  Compose.
- Core models: `Domain`, `SubjectCategory`, `Subject`, `Variable`,
  `VerticalVariable`, `PeriodData`, `CoverageRecord`, `CoverageCheckLog`,
  `SimdasiTable`, `SimdasiCoverageRecord`.
- `CoverageRecord` must include: variable/table FK, domain FK, admin_level
  enum (national/province/regency), status enum
  (confirmed/not_confirmed/unchecked/error), years_confirmed (array/JSON),
  last_checked_at, source_response_hash FK/ref to `CoverageCheckLog`.
- `CoverageCheckLog` stores the raw call metadata (url, status, timestamp,
  response hash, optionally the raw body if small enough — decide storage
  approach and note the decision in a comment).

### Phase 2: BPS API Client
- A single wrapper module handling: auth key injection, rate limiting,
  retry/backoff, response parsing, and consistent error handling (BPS
  returns `404 UserNotFound` for various error conditions — don't assume
  it always means "user not found").
- Write this with tests against recorded/fixture responses before hitting
  the live API repeatedly during development, to avoid burning rate limit
  budget on iteration.

### Phase 3: Domain & Metadata Crawler
- Implement domain crawl (`type=all`, `type=prov`, `type=kabbyprov` per
  province) → populate `Domain` table with correct `admin_level`.
- Implement Subject Category → Subject → Variable → Vertical Variable
  crawl for the national domain, populating the metadata tables. This
  phase does NOT yet confirm coverage — it only records what BPS *claims*
  exists.

### Phase 4: Coverage Confirmation Crawler
- For each variable, issue real `data` calls at:
  - National domain (always, exactly once)
  - A fixed, documented sample of provinces
  - A fixed, documented sample of kabupaten/kota within sampled provinces
- Parse `data-availability` and `datacontent` from each response. Only
  write `confirmed_*` status when `datacontent` contains actual non-null
  values, not just when `data-availability: available` is returned
  (metadata can claim availability while content is empty — verify both).
- Do the same for SIMDASI tables using MFD region codes.

### Phase 5: Validation Gate — MANDATORY BEFORE ANY UI WORK

**Do not write a single line of frontend code until this phase produces
real output from a real crawl run.**

- Run the Phase 3+4 crawlers against the live BPS API (using your own API
  key, configured in `.env`).
- Generate the coverage report (Markdown + JSON) as specified in PRD §5.5:
  totals per admin level, per-subject breakdown, explicit list of sampled
  domains, explicit list of confirmed gaps.
- Present this report's summary numbers back to the user before proceeding
  — this is the actual point of the whole project, and it must be backed
  by real data, not scaffold assumptions. If the crawl reveals surprises
  (e.g. far fewer kabupaten-level indicators than expected), report that
  honestly rather than adjusting the report to look more complete.
- Only after the user has seen and accepted this report, proceed to Phase 6.

### Phase 6: Celery Scheduling
- Periodic task (e.g. weekly) to re-run coverage confirmation for
  previously-confirmed variables, to catch BPS silently removing/adding
  data.
- Cache raw BPS responses in Redis with a sane TTL to avoid redundant
  calls during the same crawl run (not as a substitute for the permanent
  audit trail in Postgres).

### Phase 7: DRF Read API
- `/api/coverage/variables/` with filters: `admin_level`, `subject`,
  `status`, `keyword`.
- `/api/coverage/variables/{id}/` full detail including check history.
- `/api/coverage/simdasi/` equivalent for SIMDASI tables.
- `/api/coverage/export/` returns the full or filtered catalog as JSON,
  intended for other projects (e.g. NusaStats) to ingest directly.

### Phase 8: Frontend Dashboard
- Only after Phase 5's report exists and Phase 7's API is live.
- Browse/filter UI as specified in PRD §5.6. Coverage badges must reflect
  real `CoverageRecord.status` values — no placeholder "assume confirmed"
  states in the UI.

## Things to explicitly avoid

- Do not mark a variable "confirmed" at any level without a stored,
  hashed, real response backing it.
- Do not crawl all ~514 kabupaten/kota for all variables — this is neither
  necessary nor polite to BPS's infrastructure. Sample deliberately.
- Do not build the frontend before Phase 5's report exists — the whole
  value of this project is the confirmed-by-evidence catalog, and building
  UI first risks designing around assumed data shapes that the real crawl
  later contradicts.
- Do not silently swallow BPS error responses (`404 UserNotFound`, rate
  limit errors, malformed JSON) — log them into `CoverageCheckLog` with
  status `error` so gaps are distinguishable from genuine unavailability.
