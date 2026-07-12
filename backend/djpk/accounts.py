"""Canonical APBD chart-of-accounts catalog — the hierarchy the flat
`csv_apbd` export omits.

The DJPK export lists every account with a single leading space, so parent /
child structure (PAD -> Pajak Daerah, Belanja Daerah -> Belanja Pegawai, ...)
is not carried in the response. This module is the single source of truth for
that structure: fixed government metadata (the Permendagri 90/2019 & DJPK
"050-3708" mapping DJPK publishes against), NOT inferred data — exactly the
role `dukcapil.indicators` plays for the ArcGIS attribute keys.

Each entry: (akun_key, label_id, group, parent_key). `akun_key` is
`djpk.parser.slugify_akun(label)`; ordering here defines `sort`. `parent_key`
is "" for the three top-level accounts. Labels not present here (rare
old-nomenclature duplicates) still store fine as lines — they simply lack a
catalog row until added, and are reported by `seed`/ingest so gaps are visible
rather than silently dropped.

Groups: pendapatan (revenue), belanja (expenditure), pembiayaan (financing).
PAD (Pendapatan Asli Daerah) and its four components live under `pendapatan`.
"""

# fmt: off
# (akun_key, label_id, group, parent_key)
ACCOUNTS = [
    # --- PENDAPATAN --------------------------------------------------------
    ("pendapatan_daerah", "Pendapatan Daerah", "pendapatan", ""),

    ("pad", "Pendapatan Asli Daerah (PAD)", "pendapatan", "pendapatan_daerah"),
    ("pajak_daerah", "Pajak Daerah", "pendapatan", "pad"),
    ("retribusi_daerah", "Retribusi Daerah", "pendapatan", "pad"),
    ("hasil_pengelolaan_kekayaan_daerah_yang_dipisahkan",
     "Hasil Pengelolaan Kekayaan Daerah yang Dipisahkan", "pendapatan", "pad"),
    ("lain_lain_pad_yang_sah", "Lain-Lain PAD yang Sah", "pendapatan", "pad"),

    ("tkdd", "Transfer ke Daerah & Dana Desa (TKDD)", "pendapatan", "pendapatan_daerah"),
    ("pendapatan_transfer_pemerintah_pusat",
     "Pendapatan Transfer Pemerintah Pusat", "pendapatan", "tkdd"),
    ("pendapatan_transfer_antar_daerah",
     "Pendapatan Transfer Antar Daerah", "pendapatan", "tkdd"),

    ("pendapatan_lainnya", "Lain-lain Pendapatan Daerah yang Sah", "pendapatan", "pendapatan_daerah"),
    ("pendapatan_hibah", "Pendapatan Hibah", "pendapatan", "pendapatan_lainnya"),
    ("dana_darurat", "Dana Darurat", "pendapatan", "pendapatan_lainnya"),
    ("lain_lain_pendapatan_sesuai_dengan_ketentuan_peraturan_perundang_undangan",
     "Lain-lain Pendapatan Sesuai Ketentuan Peraturan Perundang-Undangan",
     "pendapatan", "pendapatan_lainnya"),

    # --- BELANJA -----------------------------------------------------------
    ("belanja_daerah", "Belanja Daerah", "belanja", ""),
    ("belanja_pegawai", "Belanja Pegawai", "belanja", "belanja_daerah"),
    ("belanja_barang_jasa", "Belanja Barang & Jasa", "belanja", "belanja_daerah"),
    ("belanja_barang_dan_jasa", "Belanja Barang dan Jasa", "belanja", "belanja_daerah"),
    ("belanja_modal", "Belanja Modal", "belanja", "belanja_daerah"),
    ("belanja_lainnya", "Belanja Lainnya", "belanja", "belanja_daerah"),
    ("belanja_bagi_hasil", "Belanja Bagi Hasil", "belanja", "belanja_lainnya"),
    ("belanja_bantuan_keuangan", "Belanja Bantuan Keuangan", "belanja", "belanja_lainnya"),
    ("belanja_bunga", "Belanja Bunga", "belanja", "belanja_lainnya"),
    ("belanja_subsidi", "Belanja Subsidi", "belanja", "belanja_lainnya"),
    ("belanja_hibah", "Belanja Hibah", "belanja", "belanja_lainnya"),
    ("belanja_bantuan_sosial", "Belanja Bantuan Sosial", "belanja", "belanja_lainnya"),
    ("belanja_tidak_terduga", "Belanja Tidak Terduga", "belanja", "belanja_lainnya"),

    # --- PEMBIAYAAN --------------------------------------------------------
    ("pembiayaan_daerah", "Pembiayaan Daerah", "pembiayaan", ""),

    ("penerimaan_pembiayaan_daerah", "Penerimaan Pembiayaan Daerah", "pembiayaan", "pembiayaan_daerah"),
    ("sisa_lebih_perhitungan_anggaran_tahun_sebelumnya",
     "Sisa Lebih Perhitungan Anggaran Tahun Sebelumnya (SiLPA)",
     "pembiayaan", "penerimaan_pembiayaan_daerah"),
    ("pencairan_dana_cadangan", "Pencairan Dana Cadangan", "pembiayaan", "penerimaan_pembiayaan_daerah"),
    ("penjualan_kekayaan_daerah_yang_dipisahkan",
     "Penjualan Kekayaan Daerah yang Dipisahkan", "pembiayaan", "penerimaan_pembiayaan_daerah"),
    ("penerimaan_pinjaman_daerah", "Penerimaan Pinjaman Daerah", "pembiayaan", "penerimaan_pembiayaan_daerah"),
    ("penerimaan_kembali_pemberian_pinjaman_daerah",
     "Penerimaan Kembali Pemberian Pinjaman Daerah", "pembiayaan", "penerimaan_pembiayaan_daerah"),
    ("penerimaan_pembiayaan_lainnya_sesuai_dengan_ketentuan_peraturan_perundang_undangan",
     "Penerimaan Pembiayaan Lainnya Sesuai Ketentuan Peraturan Perundang-Undangan",
     "pembiayaan", "penerimaan_pembiayaan_daerah"),

    ("pengeluaran_pembiayaan_daerah", "Pengeluaran Pembiayaan Daerah", "pembiayaan", "pembiayaan_daerah"),
    ("pembentukan_dana_cadangan", "Pembentukan Dana Cadangan", "pembiayaan", "pengeluaran_pembiayaan_daerah"),
    ("penyertaan_modal_daerah", "Penyertaan Modal Daerah", "pembiayaan", "pengeluaran_pembiayaan_daerah"),
    ("pembayaran_cicilan_pokok_utang_yang_jatuh_tempo",
     "Pembayaran Cicilan Pokok Utang yang Jatuh Tempo", "pembiayaan", "pengeluaran_pembiayaan_daerah"),
    ("pemberian_pinjaman_daerah", "Pemberian Pinjaman Daerah", "pembiayaan", "pengeluaran_pembiayaan_daerah"),
    ("pengeluaran_pembiayaan_lainnya_sesuai_dengan_ketentuan_peraturan_perundang_undangan",
     "Pengeluaran Pembiayaan Lainnya Sesuai Ketentuan Peraturan Perundang-Undangan",
     "pembiayaan", "pengeluaran_pembiayaan_daerah"),
]
# fmt: on

ACCOUNT_KEYS = {a[0] for a in ACCOUNTS}
