# Cakupan — BPS Data Coverage Explorer

Cakupan crawls the BPS WebAPI, confirms (via real HTTP responses, never
inference) which indicators actually return data at national, provincial,
and kabupaten/kota level, and exposes the result as a queryable coverage
catalog for downstream projects such as NusaStats.

See [`PRD.md`](PRD.md) for the product spec and [`CLAUDE.md`](CLAUDE.md) for
the non-negotiable architecture rules and build order this repo follows.

## Status

Following the build order in `CLAUDE.md`. Frontend work does not start until
Phase 5 (a real crawl report against the live BPS API) is complete and
reviewed — see `CLAUDE.md` for why.

## Stack

- Backend: Django 5 + DRF (`backend/`)
- Async/scheduled crawling: Celery + Redis
- DB: PostgreSQL
- Frontend (Phase 8+): Next.js 14 + Tailwind
- Deployment: Docker Compose

## Local setup

```bash
cp backend/.env.example backend/.env   # fill in your own BPS_API_KEY
docker compose up --build
docker compose exec web python manage.py migrate
```
