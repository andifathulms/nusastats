import os
import sys
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")

SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY", "insecure-dev-key-change-me")
# Off unless explicitly enabled: with DEBUG on, Django also records every SQL
# statement per request in memory. Local dev opts in via DJANGO_DEBUG=true.
DEBUG = os.environ.get("DJANGO_DEBUG", "false").lower() == "true"
ALLOWED_HOSTS = os.environ.get("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1").split(",")

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "django_filters",
    "corsheaders",
    "django_celery_beat",
    "catalog",
    "bps_client",
    "crawler",
    "api",
    "stats",
    "dukcapil",
    "djpk",
]

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    # JSON compresses 6-22x here (a 2.08 MB series -> 93 KB). The API sets no
    # secrets in response bodies, so BREACH-style concerns don't apply. In
    # production a reverse proxy may do this instead; both together are fine.
    "django.middleware.gzip.GZipMiddleware",
    # ETag + 304 Not Modified on GETs. Sits below GZip so the ETag is taken
    # over the uncompressed body (GZip then marks it weak).
    "django.middleware.http.ConditionalGetMiddleware",
    "api.middleware.SlowRequestLogMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "cakupan.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "cakupan.wsgi.application"

if "pytest" in sys.modules:
    # Test runs use sqlite so `pytest` works without a live Postgres
    # container; docker-compose / production always use the block below.
    DATABASES = {"default": {"ENGINE": "django.db.backends.sqlite3", "NAME": ":memory:"}}
else:
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.postgresql",
            "NAME": os.environ.get("POSTGRES_DB", "cakupan"),
            "USER": os.environ.get("POSTGRES_USER", "cakupan"),
            "PASSWORD": os.environ.get("POSTGRES_PASSWORD", "cakupan"),
            "HOST": os.environ.get("POSTGRES_HOST", "db"),
            "PORT": os.environ.get("POSTGRES_PORT", "5432"),
            # Reuse connections across requests instead of a fresh Postgres
            # handshake per request; health checks drop dead ones safely.
            "CONN_MAX_AGE": int(os.environ.get("DB_CONN_MAX_AGE", 60)),
            "CONN_HEALTH_CHECKS": True,
        }
    }

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "en-us"
TIME_ZONE = "Asia/Jakarta"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

REST_FRAMEWORK = {
    "DEFAULT_FILTER_BACKENDS": ["django_filters.rest_framework.DjangoFilterBackend"],
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.PageNumberPagination",
    "PAGE_SIZE": 50,
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.AllowAny"],
    # A public read API: generous per-IP limits (one page can fire 10-20
    # calls, and many users share a NAT), tighter on the multi-MB export.
    "DEFAULT_THROTTLE_CLASSES": [
        "rest_framework.throttling.AnonRateThrottle",
        "rest_framework.throttling.ScopedRateThrottle",
    ],
    "DEFAULT_THROTTLE_RATES": {
        "anon": os.environ.get("API_THROTTLE_ANON", "1200/min"),
        "export": os.environ.get("API_THROTTLE_EXPORT", "60/hour"),
    },
}

# Requests slower than this are logged by api.middleware.SlowRequestLogMiddleware.
API_SLOW_REQUEST_MS = int(os.environ.get("API_SLOW_REQUEST_MS", 500))

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {"console": {"class": "logging.StreamHandler"}},
    "loggers": {"api.slow": {"handlers": ["console"], "level": "WARNING", "propagate": False}},
}

CORS_ALLOWED_ORIGINS = os.environ.get(
    "CORS_ALLOWED_ORIGINS", "http://localhost:3000"
).split(",")

# --- Read-API response cache (api.caching) ---
# Keys embed a per-source data version that each ingest bumps, so entries
# never go stale; the timeout only bounds memory. Uses its own Redis DB so it
# can be flushed without touching Celery's broker/results. Not the same thing
# as the crawler's BPS response cache below, and not an audit trail.
API_CACHE_TIMEOUT = int(os.environ.get("API_CACHE_TIMEOUT", 60 * 60 * 24))
if "pytest" in sys.modules:
    CACHES = {"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}}
else:
    CACHES = {
        "default": {
            "BACKEND": "django.core.cache.backends.redis.RedisCache",
            "LOCATION": os.environ.get("API_CACHE_REDIS_URL", "redis://redis:6379/2"),
            "KEY_PREFIX": "nusastats",
        }
    }

# --- Celery ---
CELERY_BROKER_URL = os.environ.get("REDIS_URL", "redis://redis:6379/0")
CELERY_RESULT_BACKEND = os.environ.get("REDIS_URL", "redis://redis:6379/0")
CELERY_BEAT_SCHEDULER = "django_celery_beat.schedulers:DatabaseScheduler"
CELERY_TIMEZONE = TIME_ZONE

# --- Redis response cache (dev-run dedupe only; Postgres CoverageCheckLog is
# the permanent audit trail, per CLAUDE.md Phase 6 note) ---
BPS_RESPONSE_CACHE_URL = os.environ.get("REDIS_URL", "redis://redis:6379/0")
BPS_RESPONSE_CACHE_TTL_SECONDS = int(os.environ.get("BPS_RESPONSE_CACHE_TTL_SECONDS", 3600))

# --- BPS WebAPI client config (CLAUDE.md rules 5 & 6) ---
BPS_API_BASE_URL = os.environ.get("BPS_API_BASE_URL", "https://webapi.bps.go.id/v1/api")
BPS_API_KEY = os.environ.get("BPS_API_KEY", "")
BPS_RATE_LIMIT_INTERVAL_SECONDS = float(os.environ.get("BPS_RATE_LIMIT_INTERVAL_SECONDS", 0.75))
BPS_MAX_RETRIES = int(os.environ.get("BPS_MAX_RETRIES", 5))
BPS_MAX_CONSECUTIVE_FAILURES = int(os.environ.get("BPS_MAX_CONSECUTIVE_FAILURES", 10))

# --- Coverage sampling config (CLAUDE.md rule 4 / PRD 5.3) ---
COVERAGE_SAMPLE_PROVINCE_COUNT = int(os.environ.get("COVERAGE_SAMPLE_PROVINCE_COUNT", 5))
COVERAGE_SAMPLE_KABUPATEN_PER_PROVINCE = int(
    os.environ.get("COVERAGE_SAMPLE_KABUPATEN_PER_PROVINCE", 3)
)

# --- SIMDASI (PRD §5.4 — a separate system, queried per MFD region code
# rather than per national variable). Calling convention here mirrors the
# Dynamic Data client for architectural consistency; the exact model/param
# names must be validated against real SIMDASI docs before the Phase 5
# live crawl, since SIMDASI lives on its own host with its own API shape.
SIMDASI_API_BASE_URL = os.environ.get("SIMDASI_API_BASE_URL", "https://simdasi.bps.go.id/v1/api")
# Explicit, documented sample of 7-digit MFD region codes to check per
# table (CLAUDE.md rule 4 — never a silent/implicit sample).
SIMDASI_SAMPLE_MFD_CODES = [
    c.strip() for c in os.environ.get("SIMDASI_SAMPLE_MFD_CODES", "").split(",") if c.strip()
]
