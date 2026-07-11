"""Single source of truth for the surfaced Dukcapil indicators.

Each entry: (field, label_id, group, unit, is_string). `field` is the JSON
key in the raw ArcGIS attribute record. Ordering here defines `sort`.

Deliberately excluded: `field1..field20` (empty string placeholders in the
source), the key/label columns (`objectid`, `no_*`, `nama_*`,
`kode_desa_spatial`), and geometry (`shape`, `st_area(shape)`,
`st_length(shape)`).

`luas_wilayah` and `kepadatan_penduduk` come back as formatted strings
(is_string=True) — parsed by `dukcapil.values.to_number` at read time; the
stored raw record is never mutated.
"""

# fmt: off
INDICATORS = [
    # field, label_id, group, unit, is_string
    ("jumlah_penduduk",     "Jumlah Penduduk",            "Kependudukan", "jiwa", False),
    ("jumlah_kk",           "Jumlah Kepala Keluarga",     "Kependudukan", "KK",   False),
    ("pria",                "Laki-laki",                  "Kependudukan", "jiwa", False),
    ("wanita",              "Perempuan",                  "Kependudukan", "jiwa", False),
    ("luas_wilayah",        "Luas Wilayah",               "Kependudukan", "km²",  True),
    ("kepadatan_penduduk",  "Kepadatan Penduduk",         "Kependudukan", "jiwa/km²", True),
    # Not a raw ArcGIS key: backed by the DukcapilRegion.luas_big column (BIG
    # polygon area), since Dukcapil's own luas_wilayah is the kabupaten total
    # copied onto every desa. Read via the column, not attributes.
    ("luas_big",            "Luas Wilayah (BIG)",         "Kependudukan", "km²",  False),

    ("jml_lahir",           "Jumlah Lahir",               "Peristiwa Vital", "jiwa", False),
    ("jml_meninggal",       "Jumlah Meninggal",           "Peristiwa Vital", "jiwa", False),
    ("perpindahan_pddk",    "Perpindahan Penduduk",       "Peristiwa Vital", "jiwa", False),
    ("perubahan_data",      "Perubahan Data",             "Peristiwa Vital", "",     False),

    ("jml_wktp",            "Wajib KTP",                  "Adminduk", "jiwa", False),
    ("jml_rekam_wktp",      "Sudah Rekam KTP-el",         "Adminduk", "jiwa", False),

    ("islam",               "Islam",                      "Agama", "jiwa", False),
    ("kristen",             "Kristen",                    "Agama", "jiwa", False),
    ("katholik",            "Katholik",                   "Agama", "jiwa", False),
    ("hindu",               "Hindu",                      "Agama", "jiwa", False),
    ("budha",               "Budha",                      "Agama", "jiwa", False),
    ("konghucu",            "Konghucu",                   "Agama", "jiwa", False),
    ("kepercayaan",         "Kepercayaan",                "Agama", "jiwa", False),

    ("belum_kawin",         "Belum Kawin",                "Status Perkawinan", "jiwa", False),
    ("kawin",               "Kawin",                      "Status Perkawinan", "jiwa", False),
    ("cerai_hidup",         "Cerai Hidup",                "Status Perkawinan", "jiwa", False),
    ("cerai_mati",          "Cerai Mati",                 "Status Perkawinan", "jiwa", False),

    ("u0",                  "Usia 0-4",                   "Kelompok Umur", "jiwa", False),
    ("u5",                  "Usia 5-9",                   "Kelompok Umur", "jiwa", False),
    ("u10",                 "Usia 10-14",                 "Kelompok Umur", "jiwa", False),
    ("u15",                 "Usia 15-19",                 "Kelompok Umur", "jiwa", False),
    ("u20",                 "Usia 20-24",                 "Kelompok Umur", "jiwa", False),
    ("u25",                 "Usia 25-29",                 "Kelompok Umur", "jiwa", False),
    ("u30",                 "Usia 30-34",                 "Kelompok Umur", "jiwa", False),
    ("u35",                 "Usia 35-39",                 "Kelompok Umur", "jiwa", False),
    ("u40",                 "Usia 40-44",                 "Kelompok Umur", "jiwa", False),
    ("u45",                 "Usia 45-49",                 "Kelompok Umur", "jiwa", False),
    ("u50",                 "Usia 50-54",                 "Kelompok Umur", "jiwa", False),
    ("u55",                 "Usia 55-59",                 "Kelompok Umur", "jiwa", False),
    ("u60",                 "Usia 60-64",                 "Kelompok Umur", "jiwa", False),
    ("u65",                 "Usia 65-69",                 "Kelompok Umur", "jiwa", False),
    ("u70",                 "Usia 70-74",                 "Kelompok Umur", "jiwa", False),
    ("u75",                 "Usia 75+",                   "Kelompok Umur", "jiwa", False),

    ("pendidikan3_4",       "Pendidikan Usia 3-4",        "Pendidikan (Partisipasi)", "jiwa", False),
    ("pendidikan5",         "Pendidikan Usia 5",          "Pendidikan (Partisipasi)", "jiwa", False),
    ("pendidikan6_11",      "Pendidikan Usia 6-11",       "Pendidikan (Partisipasi)", "jiwa", False),
    ("pendidikan12_14",     "Pendidikan Usia 12-14",      "Pendidikan (Partisipasi)", "jiwa", False),
    ("pendidikan15_17",     "Pendidikan Usia 15-17",      "Pendidikan (Partisipasi)", "jiwa", False),
    ("pendidikan18_22",     "Pendidikan Usia 18-22",      "Pendidikan (Partisipasi)", "jiwa", False),

    ("tidak_blm_sekolah",   "Tidak/Belum Sekolah",        "Pendidikan (Tamat)", "jiwa", False),
    ("belum_tamat_sd",      "Belum Tamat SD/Sederajat",   "Pendidikan (Tamat)", "jiwa", False),
    ("tamat_sd",            "Tamat SD/Sederajat",         "Pendidikan (Tamat)", "jiwa", False),
    ("sltp",                "SLTP/Sederajat",             "Pendidikan (Tamat)", "jiwa", False),
    ("slta",                "SLTA/Sederajat",             "Pendidikan (Tamat)", "jiwa", False),
    ("d1_dan_d2",           "Diploma I/II",               "Pendidikan (Tamat)", "jiwa", False),
    ("d3",                  "Diploma III",                "Pendidikan (Tamat)", "jiwa", False),
    ("s1",                  "Diploma IV/Strata I",        "Pendidikan (Tamat)", "jiwa", False),
    ("s2",                  "Strata II",                  "Pendidikan (Tamat)", "jiwa", False),
    ("s3",                  "Strata III",                 "Pendidikan (Tamat)", "jiwa", False),

    ("a",                   "Golongan Darah A",           "Golongan Darah", "jiwa", False),
    ("a_",                  "Golongan Darah A+",          "Golongan Darah", "jiwa", False),
    ("a1",                  "Golongan Darah A-",          "Golongan Darah", "jiwa", False),
    ("b",                   "Golongan Darah B",           "Golongan Darah", "jiwa", False),
    ("b_",                  "Golongan Darah B-",          "Golongan Darah", "jiwa", False),
    ("b1",                  "Golongan Darah B+",          "Golongan Darah", "jiwa", False),
    ("ab",                  "Golongan Darah AB",          "Golongan Darah", "jiwa", False),
    ("ab_",                 "Golongan Darah AB-",         "Golongan Darah", "jiwa", False),
    ("ab1",                 "Golongan Darah AB+",         "Golongan Darah", "jiwa", False),
    ("o",                   "Golongan Darah O",           "Golongan Darah", "jiwa", False),
    ("o_",                  "Golongan Darah O+",          "Golongan Darah", "jiwa", False),
    ("o1",                  "Golongan Darah O-",          "Golongan Darah", "jiwa", False),
    ("tidak_tahu",          "Golongan Darah Tidak Tahu",  "Golongan Darah", "jiwa", False),

    ("belum_tidak_bekerja", "Belum/Tidak Bekerja",        "Pekerjaan", "jiwa", False),
    ("pelajar_mahasiswa",   "Pelajar/Mahasiswa",          "Pekerjaan", "jiwa", False),
    ("mengurus_rumah_tangga", "Mengurus Rumah Tangga",    "Pekerjaan", "jiwa", False),
    ("pensiunan",           "Pensiunan",                  "Pekerjaan", "jiwa", False),
    ("wiraswasta",          "Wiraswasta",                 "Pekerjaan", "jiwa", False),
    ("perdagangan",         "Perdagangan",                "Pekerjaan", "jiwa", False),
    ("nelayan",             "Nelayan",                    "Pekerjaan", "jiwa", False),
    ("guru",                "Guru",                       "Pekerjaan", "jiwa", False),
    ("perawat",             "Perawat",                    "Pekerjaan", "jiwa", False),
    ("pengacara",           "Pengacara",                  "Pekerjaan", "jiwa", False),
    ("lainnya",             "Pekerjaan Lainnya",          "Pekerjaan", "jiwa", False),

    ("lhr_2020",            "Lahir 2020",                 "Kelahiran per Tahun", "jiwa", False),
    ("lhr_2021",            "Lahir 2021",                 "Kelahiran per Tahun", "jiwa", False),
    ("lhr_2022",            "Lahir 2022",                 "Kelahiran per Tahun", "jiwa", False),
    ("lhr_2023",            "Lahir 2023",                 "Kelahiran per Tahun", "jiwa", False),
    ("lhr_2024",            "Lahir 2024",                 "Kelahiran per Tahun", "jiwa", False),

    ("pertumbuhan_2020",    "Pertumbuhan 2020",           "Pertumbuhan Penduduk", "jiwa", False),
    ("pertumbuhan_2021",    "Pertumbuhan 2021",           "Pertumbuhan Penduduk", "jiwa", False),
    ("pertumbuhan_2022",    "Pertumbuhan 2022",           "Pertumbuhan Penduduk", "jiwa", False),
    ("pertumbuhan_2023",    "Pertumbuhan 2023",           "Pertumbuhan Penduduk", "jiwa", False),
    ("pertumbuhan_2024",    "Pertumbuhan 2024",           "Pertumbuhan Penduduk", "jiwa", False),
]
# fmt: on

# Group display order for the frontend picker.
GROUP_ORDER = [
    "Kependudukan",
    "Peristiwa Vital",
    "Adminduk",
    "Agama",
    "Status Perkawinan",
    "Kelompok Umur",
    "Pendidikan (Partisipasi)",
    "Pendidikan (Tamat)",
    "Golongan Darah",
    "Pekerjaan",
    "Kelahiran per Tahun",
    "Pertumbuhan Penduduk",
]

# Fields that are formatted strings in the source (need numeric parsing).
STRING_FIELDS = {field for field, _, _, _, is_string in INDICATORS if is_string}
