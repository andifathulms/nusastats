"""Gunicorn settings for the production image (`CMD` in the Dockerfile).
Local docker-compose overrides the command with `runserver` for autoreload,
so this file only governs real deployments."""

import multiprocessing
import os

bind = "0.0.0.0:8000"
# Default sync worker formula; override with WEB_CONCURRENCY on small hosts.
workers = int(os.environ.get("WEB_CONCURRENCY", multiprocessing.cpu_count() * 2 + 1))
# Long enough for the heaviest cold analytics request, short enough that a
# stuck worker is recycled instead of hanging a client indefinitely.
timeout = int(os.environ.get("GUNICORN_TIMEOUT", 30))
# Recycle workers periodically to bound memory growth.
max_requests = 1000
max_requests_jitter = 100
accesslog = "-"
