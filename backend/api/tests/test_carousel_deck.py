"""Peta Angka deck text (api.carousel_deck) and the id-ID value formatting it
shares with the map cards (api.carousel.fmt_value)."""

import pytest
from rest_framework.test import APIClient

from api.carousel import fmt_num, fmt_value
from api.carousel_deck import deck_bundle

from .test_carousel import bps  # noqa: F401  (shared fixture)


@pytest.mark.parametrize(
    "value,unit,expected",
    [
        (89.55, "indeks", "89,55"),
        (13.37, "Tahun", "13,37 tahun"),
        (582327, "jiwa", "582.327 jiwa"),
        (87.09, "%", "87,09%"),
        (2.005, "%", "2,01%"),  # half up, not banker's rounding
        (7506995595563, "Rp", "Rp7,5 triliun"),
        (3925994310, "Rp", "Rp3,9 miliar"),
        (1253343, "Rupiah/kapita/bulan", "Rp1.253.343/kapita/bulan"),
        (115.19, "L per 100 P", "115,19 L per 100 P"),
        (52.0, "indeks", "52"),
        (26387, "Ribu Rupiah/Orang/Tahun", "Rp26,4 juta/orang/tahun"),
        (70.01, "0-100", "70,01"),
    ],
)
def test_fmt_value(value, unit, expected):
    assert fmt_value(value, unit) == expected


def test_fmt_num_thousands_and_decimals():
    assert fmt_num(1912.06, 0) == "1.912"
    assert fmt_num(1234567.891) == "1.234.567,89"


def _result(rows, unit="tahun", n=514, notes="5 tertinggi dan 5 terendah dari 514 kabupaten/kota."):
    return {
        "pack": {"id": "bps-415-kab-2025", "metric": "[Metode Baru] Rata-rata Lama Sekolah", "unit": unit,
                 "period": "2025", "level": "kabupaten", "source": "BPS — RLS, 2025", "notes": notes,
                 "rows": [{"label": lbl, "code": code, "value": v} for lbl, code, v in rows]},
        "provenance": {"source": "bps"},
        "map": {"prov": "", "prov_name": "", "n": n, "kicker": "DATA • BPS 2025", "period_label": "2025",
                "unmatched": [],
                "values": [{"code": code, "geo": geo, "rank": i + 1, "rank_asc": len(rows) - i}
                           for i, (_l, code, _v) in enumerate(rows)
                           for geo in [{"9701": "9508", "1171": "1171"}.get(code, code)]]},
    }


ROWS = [("Kota Banda Aceh", "1171", 13.37), ("Kota Kendari", "7471", 12.56), ("Kota Ambon", "8171", 12.37),
        ("Kota Yogyakarta", "3471", 12.13), ("Kota Madiun", "3577", 12.12), ("Kab. Lanny Jaya", "9703", 3.59),
        ("Kab. Intan Jaya", "9606", 3.38), ("Kab. Deiyai", "9603", 3.3), ("Kab. Puncak", "9607", 2.4),
        ("Kab. Nduga", "9701", 2.19)]
SPEC = {"source": "bps", "metric": "415", "level": "kabupaten", "period": "2025"}


def _slides(deck):
    return deck.split("\n---\n")


def test_top_recipe_counts_down_to_the_highest():
    b = deck_bundle(_result(ROWS), SPEC, recipe="top")
    slides = _slides(b["deck"])
    assert "Diolah oleh Nusantara Mapper" in slides[0]
    assert slides[0].startswith("template: editorial/midnight\nlang: id\ntitle: bps-415-kab-2025\ncounter: off\n"
                                "caption: ")
    assert slides[1] == ('[cover kicker="DATA • BPS 2025"]\nRata-rata Lama Sekolah | 5 Tertinggi\n'
                         "Rata-rata Lama Sekolah, 2025.")
    assert slides[2] == "[number=5 icon=map-pin]\nKota Madiun\n*12,12 tahun*"
    assert slides[6] == ("[number=1 icon=star]\nKota Banda Aceh\n"
                         "*13,37 tahun*, tertinggi dari 514 kabupaten/kota.")
    assert slides[7].startswith("[icon=book number=off]\nCatatan\n5 tertinggi")
    assert slides[-1].startswith("[end]\nDaerahmu nomor berapa?")


def test_map_cards_sort_next_to_their_slides():
    b = deck_bundle(_result(ROWS), SPEC, recipe="top", map_bg="landcover")
    files = [c["file"] for c in b["cards"]]
    # Overview after the cover, then each region's map right after its slide
    # (Madiun is slide 02 ... Banda Aceh slide 06).
    assert files == ["bps-415-kab-2025_01a_peta.png", "bps-415-kab-2025_02a_3577.png",
                     "bps-415-kab-2025_03a_3471.png", "bps-415-kab-2025_04a_8171.png",
                     "bps-415-kab-2025_05a_7471.png", "bps-415-kab-2025_06a_1171.png",
                     "bps-415-kab-2025_06b_top10.png"]
    assert b["cards"][-1]["path"].endswith("&view=top10")
    assert sorted(files + [f"bps-415-kab-2025_{i:02d}.png" for i in range(1, 10)])[:3] == [
        "bps-415-kab-2025_01.png", "bps-415-kab-2025_01a_peta.png", "bps-415-kab-2025_02.png"]
    assert b["cards"][1]["path"] == ("/card/angka/00?source=bps&metric=415&level=kabupaten&period=2025"
                                     "&focus=3577&bg=landcover")


def test_terendah_ranks_ascending_and_warns_on_fairness():
    b = deck_bundle(_result(ROWS), SPEC, recipe="terendah")
    slides = _slides(b["deck"])
    assert "Rata-rata Lama Sekolah | 5 Terendah" in slides[1]
    assert slides[2].startswith("[number=5 icon=map-pin]\nKab. Lanny Jaya\n")
    assert slides[6].startswith("[number=1 icon=star]\nKab. Nduga\n*2,19 tahun*, terendah dari 514")
    assert b["cards"][0]["path"].endswith("&order=asc")
    assert b["cards"][-2]["file"] == "bps-415-kab-2025_06a_9508.png"
    assert "&order=asc" in b["cards"][-2]["path"]
    assert b["cards"][-1]["path"].endswith("&view=top10&order=asc")
    assert any("1 in 4" in w for w in b["warnings"])
    assert any("Papua" in w for w in b["warnings"])


def test_gap_recipe_states_the_difference_and_ratio():
    b = deck_bundle(_result(ROWS), SPEC, recipe="gap")
    slides = _slides(b["deck"])
    assert "Rata-rata Lama Sekolah | 13,37 tahun vs 2,19 tahun" in slides[1]
    assert slides[4] == "[number=off icon=book]\nSelisihnya\n*11,18 tahun*, atau *6,1×* lipat."
    assert [c["file"] for c in b["cards"]] == ["bps-415-kab-2025_01a_peta.png", "bps-415-kab-2025_02a_1171.png",
                                               "bps-415-kab-2025_03a_9508.png"]


def test_gap_in_percent_is_poin_persen():
    rows = [("Kab. Badung", "5103", 87.09), ("Kab. Nduga", "9508", 0.3)]
    b = deck_bundle(_result(rows, unit="%", n=2, notes="Semua 2."), SPEC, recipe="gap")
    assert "*86,79 poin persen*" in b["deck"]


def test_text_is_escaped_and_long_notes_split():
    rows = [("Kab. A | B *x*", "1101", 2.0), ("Kab. C", "1102", 1.0)]
    notes = "Kalimat satu yang cukup panjang. " * 12 + "Kode wilayah = kode BPS; tidak tampil di slide."
    b = deck_bundle(_result(rows, n=2, notes=notes.strip()), SPEC, recipe="top")
    assert "Kab. A \\| B x" in b["deck"]
    catatan = [s for s in _slides(b["deck"]) if "\nCatatan\n" in s]
    assert len(catatan) >= 2 and all(len(s.split("\n", 2)[2]) <= 240 for s in catatan)
    assert "Kode wilayah" not in b["deck"]


@pytest.mark.django_db
def test_deck_endpoint(bps):  # noqa: F811
    resp = APIClient().get("/api/carousel/deck/?source=bps&metric=415&level=kabupaten&period=2025&recipe=gap")
    assert resp.status_code == 200
    assert resp.data["pack"]["id"] == "bps-415-kab-2025"
    assert resp.data["deck"].startswith("template: editorial/midnight")
    assert resp.data["map"]["values"][0]["display"] == "13,37 tahun"
    bad = APIClient().get("/api/carousel/deck/?source=bps&metric=415&level=kabupaten&period=2025&recipe=x")
    assert bad.status_code == 422


@pytest.mark.django_db
def test_command_out_dir_writes_the_bundle(bps, tmp_path):  # noqa: F811
    from django.core.management import call_command

    call_command("export_carousel_pack", "--source", "bps", "--metric", "415", "--level", "kabupaten",
                 "--period", "2025", "--recipe", "gap", "--out-dir", str(tmp_path))
    out = tmp_path / "bps-415-kab-2025"
    assert sorted(p.name for p in out.iterdir()) == ["README.md", "deck.txt", "map.json", "pack.json",
                                                     "provenance.json"]
    assert "Selisihnya" in (out / "deck.txt").read_text()


def test_bps_breakdown_words_stay_out_of_the_headline():
    from api.carousel import short_metric

    assert short_metric("Garis Kemiskinan Menurut Kabupaten/Kota") == "Garis Kemiskinan"
    assert short_metric("[Metode Baru] Indeks Pembangunan Manusia (UHH LF SP2020)") == "Indeks Pembangunan Manusia"
    assert short_metric("10.1.1.(f) Persentase Penduduk Miskin di Daerah Tertinggal") == (
        "Persentase Penduduk Miskin di Daerah Tertinggal")
    assert short_metric("Prevalensi Ketidakcukupan Konsumsi Pangan (Persen) Per Kabupaten/kota") == (
        "Prevalensi Ketidakcukupan Konsumsi Pangan")
    assert short_metric("Indeks Kemahalan Konstruksi Kabupaten/Kota") == "Indeks Kemahalan Konstruksi"
    assert short_metric("3.a.1* Persentase Penduduk yang Merokok") == "Persentase Penduduk yang Merokok"


def test_long_metric_names_leave_the_headline_and_warn():
    long = _result(ROWS)
    long["pack"]["metric"] = ("Proporsi Perempuan Pernah Kawin 15-49 tahun yang Pernah Melahirkan Anak Lahir Hidup "
                              "dalam 2 Tahun Terakhir Tidak di Fasilitas Kesehatan")
    b = deck_bundle(long, SPEC, recipe="top")
    cover = _slides(b["deck"])[1].split("\n")
    assert cover[1] == "5 Kabupaten dan Kota | Tertinggi"
    assert "Nama seri lengkap di Catatan" in cover[2]
    assert "Catatan\nSeri: Proporsi Perempuan" in b["deck"]
    assert any("label_metric" in w for w in b["warnings"])


def test_carousel_press_link_round_trips_unicode():
    import base64

    from api.carousel_deck import carousel_press_link

    deck = deck_bundle(_result(ROWS), SPEC, recipe="gap")["deck"]
    assert "•" in deck and "×" in deck
    link = carousel_press_link(deck, base="https://cp.example/")
    data = link.split("#deck=", 1)[1]
    assert "=" not in data and "+" not in data and "/" not in data
    assert base64.urlsafe_b64decode(data + "=" * (-len(data) % 4)).decode("utf-8") == deck


def test_tied_regions_share_the_rank_and_say_so():
    rows = [("Kota Balikpapan", "6471", 11.04), ("Kota Samarinda", "6472", 11.04), ("Kota Bontang", "6474", 11.03)]
    r = _result(rows, n=3, notes="Semua 3.")
    r["map"]["values"][1]["rank"] = 1  # what build_pack gives a tie
    slides = _slides(deck_bundle(r, SPEC, recipe="top")["deck"])
    assert slides[3] == ("[number=1 icon=star]\nKota Samarinda\n*11,04 tahun*, tertinggi dari 3 "
                         "kabupaten/kota, sama dengan Kota Balikpapan.")
    assert slides[4].startswith("[number=1 icon=star]\nKota Balikpapan\n*11,04 tahun*, tertinggi dari 3")
    assert slides[4].endswith("sama dengan Kota Samarinda.")
    gap = _slides(deck_bundle(r, SPEC, recipe="gap")["deck"])
    assert gap[2].endswith("tertinggi dari 3 kabupaten/kota, sama dengan Kota Samarinda.")


def test_tiktok_text_for_a_countdown():
    t = deck_bundle(_result(ROWS), SPEC, recipe="top")["tiktok"]
    assert t["title"] == "5 kabupaten/kota dengan Rata-rata Lama Sekolah tertinggi (2025)"
    assert len(t["title"]) <= 90
    d = t["description"]
    assert d.startswith("Nomor 1: Kota Banda Aceh, 13,37 tahun.")
    assert "1. Kota Banda Aceh: 13,37 tahun" in d and "5. Kota Madiun: 12,12 tahun" in d
    assert "Sumber: BPS — RLS, 2025. Diolah oleh Nusantara Mapper." in d
    assert d.rstrip().endswith("#nusantaramapper") and len(d) <= 2200


def test_tiktok_text_names_a_tie_at_the_top_and_the_gap():
    rows = [("Kota Balikpapan", "6471", 11.04), ("Kota Samarinda", "6472", 11.04), ("Kota Bontang", "6474", 11.03)]
    r = _result(rows, n=3, notes="Semua 3.")
    r["map"]["values"][1]["rank"] = 1
    d = deck_bundle(r, SPEC, recipe="top")["tiktok"]["description"]
    assert d.startswith("Kota Balikpapan dan Kota Samarinda sama-sama di peringkat 1: 11,04 tahun.")
    assert "1. Kota Samarinda: 11,04 tahun" in d and "1. Kota Balikpapan: 11,04 tahun" in d
    gap = deck_bundle(_result(ROWS), SPEC, recipe="gap")["tiktok"]
    assert gap["title"] == "Rata-rata Lama Sekolah: 13,37 tahun vs 2,19 tahun"
    assert "Selisihnya 11,18 tahun" in gap["description"]


def test_tiktok_title_falls_back_when_too_long():
    long = _result(ROWS)
    long["pack"]["metric"] = "Persentase Rumah Tangga yang Memiliki Akses terhadap Hunian Layak dan Terjangkau di Perkotaan"
    long["map"]["prov_name"] = "Kepulauan Bangka Belitung"
    assert len(deck_bundle(long, SPEC, recipe="top")["tiktok"]["title"]) <= 90
