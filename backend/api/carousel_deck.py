"""Peta Angka deck text from a carousel-data/1 pack (api.carousel), following
the channel's recipes (Carousel Press docs/channels.md §5): cover, countdown or
gap cards, a "Catatan" card carrying the pack's caveats, and the end card.

Deterministic: the same pack gives the same text. Every number on a slide is
the pack's value formatted by api.carousel.fmt_value, so a deck can't drift
from its data. The cover hook is a plain default meant to be rewritten by hand;
numbers are not.

Alongside the text it plans the map cards (/card/angka/...) and names their PNG
files so they sort into place next to Carousel Press' `{slug}_{NN}.png` export:
`{slug}_01a_peta.png` is the overview map after the cover, `{slug}_03a_6409.png`
is a region's map right after its slide.
"""

import base64
import os
import re
from urllib.parse import urlencode

from .carousel import LEVEL_NOUN, fmt_num, fmt_value, short_metric

RECIPES = ("top", "terendah", "gap")
MAP_BACKGROUNDS = ("terrain", "landcover", "none")
_PAPUA_KEMENDAGRI = {"91", "92", "93", "94", "95", "96"}
# "Kabupaten/Kota" can't wrap at the slash, so cover headlines spell it out.
_HEAD_NOUN = {"provinsi": "Provinsi", "kabupaten": "Kabupaten dan Kota", "kecamatan": "Kecamatan"}
MAX_COUNTDOWN = 5
MAX_NOTE_CHARS = 240
MAX_HEAD_METRIC = 40  # longer metric names stay out of the cover headline
MAX_HEAD_WORD = 13  # at cover size a longer word may be broken mid-word
MAX_SERIES_CHARS = 100


def _text(s):
    """Safe for a deck line: `|` is a line break and `*`/backticks are markup."""
    return str(s).replace("*", "").replace("`", "").replace("|", "\\|").strip()


def _attr(s):
    return str(s).replace('"', '\\"')


def _series(name):
    """Subtitle form: the full series name without the '[...]' prefix or a
    trailing 'menurut ...' (the slide already says which level)."""
    s = re.sub(r"^\[[^\]]*\]\s*", "", name)
    return re.sub(r"\s+menurut\s+[^(]*$", "", s, flags=re.I).strip()


def _difference(diff, unit):
    ul = (unit or "").strip().lower()
    if ul in ("%", "persen"):
        return f"{fmt_num(diff)} poin persen"
    if ul.startswith("indeks") or not ul:
        return f"{fmt_num(diff)} poin"
    return fmt_value(diff, unit)


def _note_cards(notes):
    """The pack notes as plain sentences, packed into cards of at most
    MAX_NOTE_CHARS. The sentence about region-code schemes is left out: no code
    appears on a slide."""
    sentences = [s for s in re.split(r"(?<=[.;])\s+(?=[A-Z0-9])", notes) if s and not s.startswith("Kode wilayah")]
    cards, cur = [], ""
    for s in sentences:
        if cur and len(cur) + 1 + len(s) > MAX_NOTE_CHARS:
            cards.append(cur)
            cur = s
        else:
            cur = f"{cur} {s}".strip()
    if cur:
        cards.append(cur)
    return cards


# Carousel Press opens a deck passed in the URL fragment (never sent to a
# server): #deck=<base64url of the UTF-8 text, no padding>.
CAROUSEL_PRESS_URL = os.environ.get("CAROUSEL_PRESS_URL", "https://andifathulms.github.io/carousel-press/")


def carousel_press_link(deck, base=None):
    data = base64.urlsafe_b64encode(deck.encode("utf-8")).decode("ascii").rstrip("=")
    return f"{base or CAROUSEL_PRESS_URL}#deck={data}"


def _hashtags(prov_name):
    tags = ["#datadaerah", "#indonesia", "#statistik"]
    if prov_name:
        tags.append("#" + re.sub(r"[^a-z0-9]", "", prov_name.lower()))
    return " ".join(tags)


def deck_bundle(result, spec, recipe="top", map_bg="terrain", template="editorial/midnight"):
    """`result` is build_pack()'s output, `spec` the query that built it (for
    the map card URLs). Returns {deck, readme, cards, warnings}."""
    if recipe not in RECIPES:
        raise ValueError(f"recipe must be one of {RECIPES}")
    if map_bg not in MAP_BACKGROUNDS:
        raise ValueError(f"map_bg must be one of {MAP_BACKGROUNDS}")
    pack, m, prov = result["pack"], result["map"], result["provenance"]
    slug, unit, level, n = pack["id"], pack["unit"], pack["level"], m["n"]
    noun = LEVEL_NOUN[level]
    where = f" di {m['prov_name']}" if m["prov_name"] else ""
    geo_of = {v["code"]: v["geo"] for v in m["values"]}
    rows = pack["rows"]
    short = short_metric(pack["metric"])
    kicker = m["kicker"]
    series = _series(pack["metric"])
    subtitle = f"{series}, {m['period_label']}{where}."
    series_note = None
    if len(series) > MAX_SERIES_CHARS:
        # Too long for a cover subtitle: name the level there and the series on a Catatan card.
        subtitle = f"{LEVEL_NOUN[level].capitalize()}{where}, {m['period_label']}. Nama seri lengkap di Catatan."
        series_note = f"Seri: {series}."
    warnings = []
    query = urlencode({k: v for k, v in spec.items() if v not in (None, "", False)})

    slides, cards = [], []

    def focus(code, order="desc"):
        geo = geo_of.get(code)
        if not geo:
            warnings.append(f"No map card for {code}: no Kemendagri code (unmatched in the crosswalk).")
            return
        nn = len(slides)  # the slide just added, 1-based
        extra = {"focus": geo, "bg": map_bg}
        if order == "asc":
            extra["order"] = "asc"
        cards.append({"file": f"{slug}_{nn:02d}a_{geo}.png",
                      "path": f"/card/angka/{m['prov'] or '00'}?{query}&{urlencode(extra)}"})

    if recipe in ("top", "terendah"):
        k = min(MAX_COUNTDOWN, len(rows), n)
        picked = rows[:k] if recipe == "top" else rows[len(rows) - k:][::-1]
        word = "Tertinggi" if recipe == "top" else "Terendah"
        # "{metric} | 5 Tertinggi" fits Carousel Press' cover best (tested on every
        # kabupaten indicator); a metric name too long for it is left to the subtitle.
        headline = (f"{_text(short)} | {k} {word}" if len(short) <= MAX_HEAD_METRIC
                    else f"{k} {_HEAD_NOUN[level]} | {word}")
        slides.append(f'[cover kicker="{_attr(kicker)}"]\n{headline}\n{_text(subtitle)}')
        if level != "kecamatan" or m["prov"]:
            order = "&order=asc" if recipe == "terendah" else ""
            cards.append({"file": f"{slug}_01a_peta.png", "path": f"/card/angka/{m['prov'] or '00'}?{query}{order}"})
        else:
            warnings.append("No overview map: kecamatan level needs a province scope (prov=).")
        # Countdown: the reveal (#1) is the last card.
        for i, row in enumerate(reversed(picked)):
            place = k - i
            icon = "star" if place == 1 else "map-pin"
            body = f"*{fmt_value(row['value'], unit)}*"
            if place == 1:
                body += f", {word.lower()} dari {fmt_num(n, 0)} {noun}{where}."
            slides.append(f"[number={place} icon={icon}]\n{_text(row['label'])}\n{body}")
            focus(row["code"], "desc" if recipe == "top" else "asc")
        if recipe == "terendah":
            warnings.append("Fairness: at most 1 in 4 posts may headline a lowest ranking; frame it as a gap, "
                            "not a verdict.")
    else:
        hi, lo = rows[0], rows[-1]
        hi_d, lo_d = fmt_value(hi["value"], unit), fmt_value(lo["value"], unit)
        lead = _text(short) if len(short) <= MAX_HEAD_METRIC else "Tertinggi vs Terendah"
        slides.append(f'[cover kicker="{_attr(kicker)}"]\n{lead} | {_text(hi_d)} vs {_text(lo_d)}\n'
                      f"{_text(subtitle)}")
        cards.append({"file": f"{slug}_01a_peta.png", "path": f"/card/angka/{m['prov'] or '00'}?{query}"})
        slides.append(f"[number=off icon=star]\n{_text(hi['label'])}\n*{hi_d}*, tertinggi dari "
                      f"{fmt_num(n, 0)} {noun}{where}.")
        focus(hi["code"])
        slides.append(f"[number=off icon=map-pin]\n{_text(lo['label'])}\n*{lo_d}*, terendah dari "
                      f"{fmt_num(n, 0)} {noun}{where}.")
        focus(lo["code"])
        diff = hi["value"] - lo["value"]
        body = f"*{_difference(diff, unit)}*"
        if lo["value"] > 0 and hi["value"] / lo["value"] >= 2:
            ratio = hi["value"] / lo["value"]
            body += f", atau *{fmt_num(ratio, 0 if ratio >= 100 else 1)}×* lipat."
        slides.append(f"[number=off icon=book]\nSelisihnya\n{body}")

    if recipe in ("terendah", "gap"):
        bottom = rows[len(rows) - min(MAX_COUNTDOWN, len(rows)):]
        if sum((geo_of.get(r["code"]) or "")[:2] in _PAPUA_KEMENDAGRI for r in bottom) >= 3:
            warnings.append("Fairness: the bottom is mostly Papua; add context (geography, access, cost) "
                            "or don't headline the bottom.")

    cover_head = slides[0].split("\n")[1]
    if len(short) > MAX_HEAD_METRIC:
        warnings.append(f"Metric name is {len(short)} characters, so the cover headline leaves it out; pass "
                        "label_metric= for a short name.")
    long_words = [w for w in re.split(r"[\s|]+", cover_head) if len(w) > MAX_HEAD_WORD]
    if long_words:
        warnings.append(f"Cover word(s) {', '.join(long_words)} may break mid-word at cover size; consider "
                        "label_metric= or edit the hook.")

    if series_note:
        slides.append(f"[icon=book number=off]\nCatatan\n{_text(series_note)}")
    for note in _note_cards(pack["notes"]):
        slides.append(f"[icon=book number=off]\nCatatan\n{_text(note)}")
    slides.append("[end]\nDaerahmu nomor berapa?\nTulis di komen, nanti kami cek datanya.")

    hook = slides[0].split("\n")[1].replace("\\|", "|").replace(" | ", " ").replace("|", " ")
    caption = f"{hook}. Sumber: {pack['source']} · Diolah oleh Peta Angka {_hashtags(m['prov_name'])}"
    header = f"template: {template}\nlang: id\ntitle: {slug}\ncaption: {_text(caption)}"
    deck = "\n---\n".join([header] + slides) + "\n"

    card_lines = "\n".join(f"- `{c['file']}` ← `{c['path']}`" for c in cards) or "- (none)"
    link = carousel_press_link(deck)
    readme = f"""# {slug}

Carousel bundle from NusaStats (`carousel-data/1`, recipe `{recipe}`).

1. Open the deck in Carousel Press ([link]({link})), or paste `deck.txt` there. Edit **only the
   cover hook**. Every number and the "Catatan" text come from `pack.json`; don't change them.
2. Download all (ZIP) and unzip the PNGs into this folder.
3. The map cards below are already here. Their names sort into place next to the deck slides
   (`{slug}_01.png`, `{slug}_01a_peta.png`, `{slug}_02.png`, ...). Upload the PNGs to TikTok in
   name order.
4. The caption is in the deck header (`caption:`).

Map cards:
{card_lines}

Every value traces to a stored response in `provenance.json` (URL with the key redacted, SHA-256,
fetch time).
"""
    return {"deck": deck, "readme": readme, "cards": cards, "warnings": warnings, "carousel_press_url": link}
