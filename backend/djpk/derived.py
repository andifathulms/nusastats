"""Derived APBD ratios — the standard Indonesian regional-finance analysis
metrics, computed on the fly from the stored account lines, never stored.

Each spec declares the account keys it needs (`requires`) and a function mapping
a {akun_key: value} dict to a single number (or None when undefined, e.g.
divide-by-zero or a missing input). They are ratios (%), so they are always read
on one basis (realisasi by default) — the measure toggle doesn't apply.

Mirrors `dukcapil.derived`: the picker lists these alongside the raw accounts,
each flagged `derived` so the UI can badge them and read them as percentages.
"""


def _mk(akun_key, label_id, unit, num, den, desc):
    def fn(v, num=num, den=den):
        n, d = v.get(num), v.get(den)
        if n is None or not d:
            return None
        return round(n / d * 100, 2)

    return {
        "akun_key": akun_key,
        "label_id": label_id,
        "group": "rasio",
        "unit": unit,
        "requires": (num, den),
        "fn": fn,
        "desc": desc,
        "derived": True,
    }


DERIVED = [
    _mk(
        "rasio_kemandirian",
        "Kemandirian Fiskal (PAD ÷ Pendapatan)",
        "%",
        "pad",
        "pendapatan_daerah",
        "Bagian pendapatan daerah yang berasal dari sumber sendiri (PAD). Makin "
        "tinggi = makin mandiri, makin sedikit bergantung pada transfer pusat.",
    ),
    _mk(
        "rasio_ketergantungan",
        "Ketergantungan Transfer (TKDD ÷ Pendapatan)",
        "%",
        "tkdd",
        "pendapatan_daerah",
        "Bagian pendapatan dari transfer pemerintah pusat (TKDD). Makin tinggi = "
        "makin bergantung pada dana pusat — kebalikan dari kemandirian fiskal.",
    ),
    _mk(
        "rasio_belanja_pegawai",
        "Rasio Belanja Pegawai (÷ Belanja)",
        "%",
        "belanja_pegawai",
        "belanja_daerah",
        "Bagian belanja daerah yang habis untuk gaji/tunjangan ASN. Makin tinggi = "
        "makin sedikit ruang untuk pelayanan & pembangunan (sering >50% dianggap boros).",
    ),
    _mk(
        "rasio_belanja_modal",
        "Rasio Belanja Modal (÷ Belanja)",
        "%",
        "belanja_modal",
        "belanja_daerah",
        "Bagian belanja untuk aset/investasi jangka panjang (infrastruktur dll). "
        "Makin tinggi = makin berorientasi pembangunan.",
    ),
]

DERIVED_BY_KEY = {d["akun_key"]: d for d in DERIVED}


def meta(spec):
    """Serializable catalog entry for a derived ratio (no `fn`)."""
    return {
        "akun_key": spec["akun_key"],
        "label_id": spec["label_id"],
        "group": spec["group"],
        "parent_key": "",
        "unit": spec["unit"],
        "desc": spec["desc"],
        "derived": True,
    }
