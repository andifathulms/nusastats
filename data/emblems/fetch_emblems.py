#!/usr/bin/env python3
"""Download the official emblem (lambang) of every kabupaten/kota in a province,
for the ranking cards (frontend/components/cards/AngkaCard.tsx).

Which file is a regency's emblem is read, never guessed: the region list comes
from the NusaStats API (Kemendagri codes and names, Dukcapil), each region's
Indonesian Wikipedia article is fetched by its exact title ("Kabupaten X" /
"Kota X"), and the file named in the infobox's `lambang` (or `logo`) field is
downloaded as a 256 px PNG thumbnail. A region whose article or infobox field is
missing is logged and reported (`skipped`) and gets no emblem.

Every download is traceable in frontend/public/emblems/manifest.json: article
title and revision, file page, licence as Wikimedia states it, thumbnail URL,
HTTP status, fetch time, the SHA-256 of the downloaded bytes and of the saved
file (they differ only when an opaque white backdrop was cleared, see
clear_corners; the manifest says so). Re-running replaces
files and manifest entries in place.

Regional emblems (lambang daerah) carry no copyright in Indonesia (UU 28/2014
Pasal 42); the licence Wikimedia records is kept anyway.

Polite: one request per second, exponential backoff on 429/5xx (honouring
Retry-After), hard stop after 5 consecutive failures.

Usage: python3 fetch_emblems.py 73 [--api http://localhost:8011]
"""
import argparse
import datetime
import hashlib
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "..", "frontend", "public", "emblems")
WIKI = "https://id.wikipedia.org/w/api.php"
UA = {"User-Agent": "NusaStats-emblems/1.0 (regional statistics explorer; one request per second)"}
WIDTH = 256
MAX_FAILS = 5
FIELDS = ("lambang", "logo", "image_seal", "seal", "image_shield", "shield")

_fails = 0
_last = 0.0


def get(url, raw=False):
    """GET with a 1 s spacing, backoff on 429/5xx, and a hard stop after MAX_FAILS in a row."""
    global _fails, _last
    delay = 2.0
    while True:
        time.sleep(max(0.0, 1.0 - (time.time() - _last)))
        _last = time.time()
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30) as r:
                body = r.read()
                _fails = 0
                return r.status, (body if raw else json.loads(body))
        except urllib.error.HTTPError as e:
            if e.code not in (429, 500, 502, 503, 504):
                raise
            _fails += 1
            if _fails >= MAX_FAILS:
                sys.exit(f"stopping: {MAX_FAILS} failures in a row (last HTTP {e.code} on {url})")
            wait = float(e.headers.get("Retry-After") or delay)
            print(f"  HTTP {e.code}, retrying in {wait:.0f}s", file=sys.stderr)
            time.sleep(wait)
            delay *= 2


def wiki(**params):
    return get(WIKI + "?" + urllib.parse.urlencode({"format": "json", "formatversion": 2, **params}))[1]


def emblem_file(wikitext):
    """The infobox's emblem file name, or None. Accepts `X.png` and `[[Berkas:X.png|...]]`."""
    head = wikitext[:8000]
    for field in FIELDS:
        m = re.search(rf"^\s*\|\s*{field}\s*=\s*(.+)$", head, re.I | re.M)
        if not m:
            continue
        v = re.sub(r"^\[\[\s*(Berkas|File|Gambar|Image)\s*:", "", m.group(1).strip(), flags=re.I)
        v = v.split("|")[0].split("]]")[0].strip()
        if re.search(r"\.(png|svg|jpe?g|gif|webp)$", v, re.I):
            return v
    return None


def clear_corners(path):
    """A file with an opaque near-white backdrop (Sidenreng Rappang's) would
    show as a white square on a dark card: flood-fill that backdrop from the
    four corners to transparent. Only the backdrop connected to a corner
    changes. Returns True when anything changed."""
    im = Image.open(path).convert("RGBA")
    w, h = im.size
    corners = [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]
    if not any(im.getpixel(c)[3] == 255 and min(im.getpixel(c)[:3]) >= 235 for c in corners):
        return False
    for c in corners:
        px = im.getpixel(c)
        if px[3] == 255 and min(px[:3]) >= 235:
            ImageDraw.floodfill(im, c, (255, 255, 255, 0), thresh=40)
    im.save(path)
    return True


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("prov", help="Kemendagri province code, e.g. 73")
    ap.add_argument("--api", default="http://localhost:8010", help="NusaStats API base")
    a = ap.parse_args()

    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, "manifest.json")
    manifest = json.load(open(path)) if os.path.exists(path) else {"emblems": {}, "skipped": {}}

    _, regions = get(f"{a.api}/api/dukcapil/regions/?level=regency&prov={a.prov}")
    print(f"{len(regions)} kabupaten/kota in {a.prov}")
    for r in regions:
        code = r["code"]
        title = ("Kota " if r["status"] == "Kota" else "Kabupaten ") + r["name"]
        page = wiki(action="parse", page=title, prop="wikitext|revid", redirects=1)
        if "error" in page:
            manifest["skipped"][code] = {"title": title, "reason": f"artikel: {page['error'].get('info')}"}
            manifest["emblems"].pop(code, None)
            print(f"{code} {title}: no article")
            continue
        fname = emblem_file(page["parse"]["wikitext"])
        if not fname:
            manifest["skipped"][code] = {"title": page["parse"]["title"], "reason": "infobox tanpa lambang/logo"}
            manifest["emblems"].pop(code, None)
            print(f"{code} {title}: no emblem in infobox")
            continue
        info = wiki(action="query", titles=f"File:{fname}", prop="imageinfo",
                    iiprop="url|sha1|mime|extmetadata", iiurlwidth=WIDTH)
        pg = info["query"]["pages"][0]
        if "imageinfo" not in pg:
            manifest["skipped"][code] = {"title": page["parse"]["title"], "reason": f"berkas tidak ada: {fname}"}
            manifest["emblems"].pop(code, None)
            print(f"{code} {title}: file {fname} missing")
            continue
        ii = pg["imageinfo"][0]
        src = ii.get("thumburl") or ii["url"]
        status, body = get(src, raw=True)
        ext = os.path.splitext(urllib.parse.urlparse(src).path)[1].lower()
        ext = ".png" if ext == ".svg" else ext  # SVG thumbnails are PNG renders
        out = f"{code}{ext}"
        with open(os.path.join(OUT, out), "wb") as f:
            f.write(body)
        cleared = clear_corners(os.path.join(OUT, out))
        saved = open(os.path.join(OUT, out), "rb").read()
        meta = ii.get("extmetadata", {})
        manifest["skipped"].pop(code, None)
        manifest["emblems"][code] = {
            "name": r["name"],
            "status": r["status"],
            "file": out,
            "article": page["parse"]["title"],
            "article_revid": page["parse"]["revid"],
            "source_file": pg["title"],
            "source_page": ii["descriptionurl"],
            "licence": meta.get("LicenseShortName", {}).get("value"),
            "url": src,
            "http_status": status,
            "fetched_at": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
            "sha256_download": hashlib.sha256(body).hexdigest(),
            "processing": "latar putih di sudut dibuat transparan" if cleared else None,
            "sha256": hashlib.sha256(saved).hexdigest(),
            "bytes": len(saved),
        }
        print(f"{code} {title}: {pg['title']} ({len(body) // 1024} KB)")

    with open(path, "w") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=1, sort_keys=True)
    n = sum(1 for c in manifest["emblems"] if c.startswith(a.prov))
    print(f"done: {n} emblems, {len(manifest['skipped'])} skipped -> {os.path.relpath(path)}")


if __name__ == "__main__":
    main()
