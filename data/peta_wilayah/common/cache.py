"""Idempotent, hash-verified downloads into the git-ignored cache.

A cached file is reused only when its sha256 matches the hash recorded in
`sources.json`. A fresh download is recorded on first use; if a re-download
yields a *different* hash than recorded, we stop: upstream changed and every
derived number would silently shift. Polite: one request at a time, a pause
between downloads, exponential backoff, hard stop after a few failures.
"""
import hashlib
import shutil
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

from . import manifest

UA = {"User-Agent": "nusastats-peta-wilayah/0.1 (local research pipeline)"}
PAUSE_S = 0.5
TRIES = 4


# Never let a download push the disk below this; stop the run instead.
MIN_FREE_BYTES = 1_500_000_000


class SourceChanged(RuntimeError):
    pass


class DiskLow(RuntimeError):
    pass


def ensure_free(path: Path, need: int = 0) -> None:
    path.mkdir(parents=True, exist_ok=True)
    free = shutil.disk_usage(path).free
    if free - need < MIN_FREE_BYTES:
        raise DiskLow(f"only {free / 1e9:.2f} GB free on the cache disk "
                      f"(keeping {MIN_FREE_BYTES / 1e9:.1f} GB in reserve); stopping before download")


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def _download(url: str, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    part = dest.with_suffix(dest.suffix + ".part")
    last = None
    for i in range(TRIES):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=300) as r, open(part, "wb") as f:
                while chunk := r.read(1 << 20):
                    f.write(chunk)
            part.replace(dest)
            time.sleep(PAUSE_S)
            return
        except urllib.error.HTTPError as e:
            if e.code == 404:
                raise  # not retryable; caller decides what a missing file means
            last = e
        except Exception as e:  # noqa: BLE001 — network errors of every flavour
            last = e
        wait = 2 ** i
        sys.stderr.write(f"  retry {i + 1}/{TRIES} in {wait}s: {last}\n")
        time.sleep(wait)
    raise RuntimeError(f"download failed after {TRIES} tries: {url}: {last}")


def fetch(dataset: str, key: str, url: str, dest: Path, data: dict) -> dict:
    """Ensure `dest` holds the verified bytes for (dataset, key). Returns its record."""
    files = data["files"][dataset]
    rec = files.get(key)
    if dest.exists() and rec and sha256(dest) == rec["sha256"]:
        return rec
    ensure_free(dest.parent, rec["bytes"] if rec else 0)
    sys.stderr.write(f"  downloading {url}\n")
    _download(url, dest)
    digest = sha256(dest)
    if rec and rec["sha256"] != digest:
        raise SourceChanged(
            f"{dataset}/{key}: downloaded sha256 {digest} != recorded {rec['sha256']}. "
            "Upstream changed; review and clear the record in sources.json to accept it.")
    rec = {"url": url, "sha256": digest, "bytes": dest.stat().st_size,
           "downloaded_at": manifest.now_iso()}
    files[key] = rec
    manifest.save(data)
    return rec
