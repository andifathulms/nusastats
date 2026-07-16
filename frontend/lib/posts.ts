// Curated "Sorotan" posts — hand-picked BPS analyses with a purpose-built
// visualization + narrative. Config-driven (authored here in code); each post
// declares a `kind` that maps to a viz component in app/sorotan/[slug].
//
// `composition`: one variable whose `turvar` breakdown are the parts of a whole
// (e.g. PDRB by 17 lapangan-usaha categories). Reuses the existing BPS API —
// `ranking` (turvar=total) for the region list, `series` for one region's parts.

export type PostKind = "composition" | "poverty" | "expenditure" | "hdi" | "demography" | "gender" | "prosperity" | "fiscal" | "diversity" | "inequality" | "spending" | "labor" | "crossdev";

export type CompositionConfig = {
  variableId: string;
  totalTurvarId: string; // the turvar that is the grand total (excluded from the parts)
  unit: string;
  adminLevel: "province" | "regency";
  year?: string;
  note: string;
  // Optional short display names per turvar_id (else the raw label is cleaned).
  shortLabels?: Record<string, string>;
  // Optional higher-level grouping of the turvars (e.g. Primer/Sekunder/Tersier)
  // for a coarse structural breakdown of the selected region.
  groups?: { label: string; color: string; ids: string[] }[];
  // Optional annual time series (a different variable) for the selected region:
  // trend line + ranking movement. `totalTurvarId` selects the grand-total row.
  trend?: { variableId: string; totalTurvarId: string; unit: string; label: string };
  // Optional PROVINCE-level sector history (var keyed by province in `vervar`),
  // for a Total/Komponen-over-time toggle. `partialLastYear` marks the latest
  // period as year-to-date (BPS reports it as a single quarter).
  history?: { variableId: string; totalTurvarId: string; unit: string; label: string; partialLastYear?: boolean };
};

// `poverty`: several BPS variables measured over the same regions/years that
// together form one profile (not parts of a whole). Here the FGT poverty
// triplet — headcount (P0), depth (P1), severity (P2) — plus the absolute
// number of poor. Each region carries all four; the story is how they diverge
// (many-but-shallow vs few-but-deep). Rates (P0/P1/P2) can't be summed across
// regions, so province and regency levels are fetched natively from BPS rather
// than aggregated client-side.
export type PovertyMetric = {
  // `garis` is the poverty LINE itself (rupiah/kapita/month), not an outcome:
  // it is the threshold each region's P0/P1/P2 is measured against, and BPS
  // sets it per region from local prices. It varies 3,6x across kab/kota and is
  // uncorrelated with P0 (r=-0.08), so the headline ranking is comparing
  // regions against different yardsticks — worth showing, not hiding.
  key: "count" | "p0" | "p1" | "p2" | "garis";
  variableId: string;
  label: string; // full name (headline / axis)
  short: string; // chip / column label
  unit: string; // "%", "ribu jiwa", or "" (dimensionless index)
  decimals: number;
  desc: string; // one-line plain-language meaning
};

export type PovertyConfig = {
  metrics: PovertyMetric[]; // order: count, p0, p1, p2
  primaryKey: "count" | "p0" | "p1" | "p2"; // default ranked/mapped metric
  countKey: "count"; // the summable absolute metric (for the scatter x / national total)
  latestYear: number;
  firstYear: number;
  // BPS's own national series, so the headline is a published figure rather
  // than one re-derived from the province rows (summing counts and dividing by
  // a population back-computed from count/P0 drifts by ~0.5pp). Both are
  // national-level with a Kota/Desa/Kota+Desa `vervar`.
  national: {
    rateVariableId: string; // 184, P0 % — 1996..2025
    countVariableId: string; // 183, Juta Jiwa — 1996..2025
    totalVervarId: string; // "3" = Kota+Desa
    urbanVervarId: string; // "1" = Kota
    ruralVervarId: string; // "2" = Desa
  };
  note: string;
};

// `expenditure`: PDRB decomposed by USE (pengeluaran) — Konsumsi RT / LNPRT /
// Pemerintah, PMTB + Inventori (investasi), and Net Ekspor. Unlike the 17
// lapangan-usaha sectors this is full-year at kabupaten level (2010–2025), so it
// gets real kab history; and Net Ekspor can be NEGATIVE (net importers), so the
// viz is diverging bars, not a 100% stack.
export type ExpenditureConfig = {
  variableId: string; // konstan, kab, 6 components + total, 2010–2025 (2194)
  totalTurvarId: string; // "1550"
  unit: string;
  year: string; // latest full year for the composition, e.g. "2025"
  components: { id: string; label: string; color: string }[];
  groups: { label: string; color: string; ids: string[] }[];
  note: string;
};

// `hdi`: one published composite index (IPM) plus the dimensions it is built
// from (health/education/living-standard), all measured over the same regions
// & years. Higher = better. Like `poverty` it's a multi-metric profile, but it
// adds an official composite + category classes, and the story is which
// *dimension* drags a region's index down. Reuses ranking/series per admin level.
export type HdiMetric = {
  key: string; // "ipm" (composite) then dimension keys
  variableId: string;
  label: string; // full name
  short: string; // chip / column label
  unit: string; // "", "Tahun", "Ribu Rupiah/Orang/Tahun"
  decimals: number;
  desc: string;
  dimension?: "Kesehatan" | "Pendidikan" | "Pengeluaran"; // absent on the composite
};

// BPS's published *metode baru* goalposts — the fixed bounds each indicator is
// normalized against before the three sub-indices are combined as a geometric
// mean. These are published methodology parameters, not values inferred from the
// data; the component proves it uses them correctly by showing the residual
// against BPS's own stored IPM (reproduces it to <0.005 points on all 488
// kab/kota, i.e. display rounding).
export type HdiFormula = {
  uhhMin: number; // 20 years
  uhhMax: number; // 85 years
  hlsMax: number; // 18 years
  rlsMax: number; // 15 years
  expenditureMin: number; // Rp 1.007.436 / person / year
  expenditureMax: number; // Rp 26.572.352 / person / year
};

export type HdiConfig = {
  compositeKey: string; // which metric is the published composite (e.g. "ipm")
  metrics: HdiMetric[]; // composite first, then the dimensions
  latestYear: number;
  firstYear: number;
  // IPM classes (BPS): Rendah <60, Sedang 60–70, Tinggi 70–80, Sangat Tinggi ≥80.
  categories: { label: string; min: number; color: string }[];
  povertyVariableId?: string; // for the index-vs-poverty scatter (P0)
  formula: HdiFormula;
  note: string;
};

// `demography`: Dukcapil (Kemendagri) administrative population by age band —
// the demographic-dividend / aging story. Not BPS: uses `dukcapilApi` and its
// own region codes/geometry. Each metric is a derived ratio (dependency, %
// productive/elderly/children, median age, sex ratio) plus the 16 age bands
// (hardcoded in DemographyPost) for a per-region age-structure profile.
export type DemographyMetric = {
  field: string; // Dukcapil indicator field (e.g. "dependency_ratio")
  label: string;
  short: string;
  unit: string; // "%", "th", "" (per-100 ratios)
  decimals: number;
  desc: string;
};

export type DemographyConfig = {
  metrics: DemographyMetric[];
  primaryField: string; // default ranked/mapped indicator
  scatterX: string;
  scatterY: string;
  note: string;
  // Show the 16-band age-structure profile in the region detail (true for the
  // age-focused post; false when the metrics aren't about age, e.g. mobility).
  ageProfile?: boolean;
};

// `gender`: one BPS variable broken down by jenis-kelamin turvar (211 male /
// 212 female), for several such variables. The story is the male–female gap per
// region and how it flips across indicators (girls ahead in schooling, men
// ahead in income). Ranking uses diverging gap bars; the signature viz is a
// male-vs-female scatter with a 45° parity line.
export type GenderMetric = {
  key: string;
  variableId: string;
  label: string;
  short: string;
  unit: string; // "Tahun", "Ribu Rupiah/Orang/Tahun"
  decimals: number;
  desc: string;
};

export type GenderConfig = {
  metrics: GenderMetric[];
  primaryKey: string;
  latestYear: number;
  note: string;
};

// `prosperity`: PDRB per capita (PDRB total ÷ population) vs the poverty rate,
// per kabupaten/kota — the "growth ≠ welfare" story. Regency-only (PDRB var 2193
// is regency-level).
//
// The denominator is Dukcapil's registered population, joined via the regency
// crosswalk. It replaced a single-source BPS reconstruction (poor count ÷ P0)
// that was both less accurate — tested against BPS's own published per-capita
// (var 288), median error 3,2% vs 1,7%, up to 56% off for individual kabupaten
// — and circular, since it put P0 on both axes of the scatter. Dukcapil is a
// registry and BPS a survey estimate, so neither is ground truth; the note says
// so, and the two-source caveat is the honest cost of removing the circularity.
export type ProsperityConfig = {
  pdrbVariableId: string; // 2193 (PDRB harga berlaku, pengeluaran, kab)
  pdrbTotalTurvar: string; // "1550" (grand-total PDRB)
  poorCountVariableId: string; // 619 (jumlah penduduk miskin, ribu jiwa)
  povertyRateVariableId: string; // 621 (P0, %)
  populationIndicator: string; // Dukcapil field for the denominator ("jumlah_penduduk")
  latestYear: number;
  note: string;
};

// `fiscal`: DJPK/APBD regional-finance ratios (`djpkApi`, Kemenkeu SIKD — not
// BPS). Fiscal independence (PAD ÷ pendapatan), transfer-dependence, ASN salary
// burden, capital spending, per province & kabupaten/kota, time series. Ratios
// are served by the rank endpoint's `akun=rasio_*` (param is `akun`, NOT
// `account`); absolute rupiah via `akun=pad|pendapatan_daerah|…&measure=realisasi`.
export type FiscalRatio = {
  akun: string; // "rasio_kemandirian" etc.
  label: string;
  short: string;
  desc: string;
  color: string;
};

export type FiscalConfig = {
  ratios: FiscalRatio[];
  primaryAkun: string;
  years: number[]; // for the median trend + selected-region trend
  latestYear: number;
  note: string;
};

// `diversity`: religious composition (Dukcapil counts per faith) as parts of a
// whole, plus a per-region diversity index — the "how plural is each region"
// lens. Composition bars in the ranking, keyed by the diversity index.
export type DiversityConfig = {
  religions: { field: string; label: string; color: string }[];
  diversityField: string; // "religion_diversity" (0–100 index)
  note: string;
};

// `inequality`: BPS Gini ratio (var 98) by province — PROVINCE-ONLY (no
// regency data). Urban/rural/total via turvar; the story is that inequality is
// distinct from poverty, so it plots Gini against poverty (P0) and IPM.
export type InequalityConfig = {
  variableId: string; // "98"
  turvars: { total: string; urban: string; rural: string }; // 191 / 189 / 190
  compare: { key: string; variableId: string; label: string; short: string; unit: string; decimals: number }[];
  latestYear: number;
  note: string;
};

// `spending`: DJPK/APBD belanja decomposed into its economic components as
// parts of a whole (pegawai, barang/jasa, modal, hibah, bansos, transfer, …) —
// "where regional money goes". The 10 components sum exactly to belanja_daerah
// (verified); `belanja_lainnya` is EXCLUDED (it double-counts), and
// `belanja_barang_dan_jasa` is the live nomenclature (barang_jasa is empty).
export type SpendingConfig = {
  totalAkun: string; // "belanja_daerah"
  components: { akun: string; label: string; short: string; color: string }[];
  groups: { label: string; color: string; akuns: string[] }[]; // Operasi / Modal / Transfer / Tak Terduga
  latestYear: number;
  note: string;
};

// `labor`: BPS employment at PROVINCE level — open unemployment (TPT, var 543,
// single value) + labour-force participation (TPAK, var 2200, by jenis-kelamin
// turvar). The counterintuitive angle: unemployment is high in industrial
// provinces yet low in agrarian ones (informal farm work), so TPT correlates
// weakly with poverty. TPT has a long series (COVID spike in 2020).
export type LaborConfig = {
  tptVar: string; // "543"
  tpakVar: string; // "2200"
  tpakMaleT: string; // "211"
  tpakFemaleT: string; // "212"
  povertyVar: string; // "621" (for the scatter)
  // The two measures that carry the post's actual argument. Open unemployment
  // barely moves with poverty (r=-0.18); informality (+0.63) and
  // underemployment (+0.66) do. Without these the "everyone works, informally"
  // thesis is prose with a null-result chart under it.
  informalVar: string; // "2153" — Proporsi Lapangan Kerja Informal, province
  underemployedVar: string; // "1181" — Tingkat Setengah Pengangguran, province
  latestYear: number;
  trendFrom: number; // series start for the TPT trend
  note: string;
};

// `crossdev`: cross-source join — DJPK fiscal independence (kemandirian) vs BPS
// human development (IPM) & poverty (P0), per regency/province. Joined via the
// BPS→Kemendagri regency crosswalk (province by 2-digit prefix). The scatter is
// the centrepiece; corr(kemandirian,IPM)≈+0.64, corr(kemandirian,P0)≈−0.39.
export type CrossDevConfig = {
  djpkAkun: string; // "rasio_kemandirian"
  ipmVar: string; // "413"
  povertyVar: string; // "621"
  latestYear: number;
  note: string;
};

export type Post = {
  slug: string;
  title: string;
  subtitle: string;
  tag: string;
  source: string;
  intro: string[];
  kind: PostKind;
  composition?: CompositionConfig;
  poverty?: PovertyConfig;
  expenditure?: ExpenditureConfig;
  hdi?: HdiConfig;
  demography?: DemographyConfig;
  gender?: GenderConfig;
  prosperity?: ProsperityConfig;
  fiscal?: FiscalConfig;
  diversity?: DiversityConfig;
  inequality?: InequalityConfig;
  spending?: SpendingConfig;
  labor?: LaborConfig;
  crossdev?: CrossDevConfig;
};

export const POSTS: Post[] = [
  {
    slug: "mandiri-lalu-maju",
    title: "Mandiri, Lalu Maju?",
    subtitle: "Daerah yang membiayai dirinya sendiri cenderung lebih maju — tapi 'mandiri' tidak berarti kaya.",
    tag: "Ekonomi",
    source: "DJPK + BPS",
    intro: [
      "Apakah kemandirian fiskal — kemampuan sebuah daerah membiayai dirinya sendiri dari Pendapatan Asli Daerah — berujung pada pembangunan manusia yang lebih baik? Untuk menjawabnya, kita gabungkan dua sumber yang jarang disandingkan: rasio kemandirian fiskal dari DJPK/Kemenkeu dengan Indeks Pembangunan Manusia dan angka kemiskinan dari BPS.",
      "Hasilnya cukup jelas: keduanya berjalan beriringan. Daerah dengan kemandirian tinggi — Badung, kota-kota besar — umumnya juga ber-IPM tinggi dan berkemiskinan rendah (korelasi ~0,66 dengan IPM, −0,41 dengan kemiskinan di tingkat kabupaten/kota).",
      "Tapi hati-hati membaca rasio ini: ia mengukur dari mana uang datang, bukan berapa banyak. Uang tambang sebagian besar mengalir sebagai Dana Bagi Hasil — secara teknis transfer dari pusat — sehingga justru menekan angka kemandirian. Kutai Timur (5,98%), Berau (6,60%), dan Kutai Kartanegara (6,82%) tampak sangat 'bergantung', padahal IPM-nya di atas median nasional (75,5–76,7 vs median 71,8). Yang benar-benar tertinggal adalah Teluk Bintuni: kemandirian 3,72% dan IPM 66,75, meski output ekonominya ratusan juta rupiah per penduduk.",
      "Geser grafik antara IPM dan kemiskinan, dan cari pencilan — daerah yang mandiri secara fiskal tapi tertinggal secara pembangunan (atau sebaliknya).",
    ],
    kind: "crossdev",
    crossdev: {
      djpkAkun: "rasio_kemandirian",
      ipmVar: "413",
      povertyVar: "621",
      latestYear: 2024,
      note: "Gabungan lintas-sumber: rasio kemandirian fiskal (DJPK/Kemenkeu, PAD÷Pendapatan) × IPM (BPS var 413) & kemiskinan P0 (BPS var 621), 2024. Dijoin lewat crosswalk BPS→Kemendagri (provinsi via prefiks 2-digit). Dua sumber & metodologi berbeda — lensa hubungan, bukan angka gabungan.",
    },
  },
  {
    slug: "pengangguran-bukan-selalu-kemiskinan",
    title: "Menganggur di Tanah Kaya",
    subtitle: "Provinsi industri justru punya pengangguran tertinggi — sementara daerah miskin nyaris tanpa pengangguran resmi.",
    tag: "Ekonomi",
    source: "BPS",
    intro: [
      "Secara intuitif, kita menduga pengangguran tertinggi ada di daerah termiskin. Datanya justru sebaliknya. Tingkat Pengangguran Terbuka (TPT) tertinggi ada di provinsi berekonomi padat — Jawa Barat, Banten, tapi juga Kepulauan Riau dan DKI Jakarta — sementara provinsi agraris seperti Sulawesi Barat, NTB, atau NTT punya angka pengangguran resmi yang jauh lebih rendah.",
      "Kuncinya: di daerah agraris, hampir semua orang 'bekerja' — di sawah, kebun, atau usaha informal keluarga — meski dengan produktivitas dan upah rendah. Pengangguran terbuka justru menjadi 'kemewahan' daerah yang lebih maju, tempat orang mampu menunggu pekerjaan formal yang layak.",
      "Dan itu bukan sekadar dugaan: datanya ada. Pengangguran terbuka nyaris tak berhubungan dengan kemiskinan (korelasi −0,18). Tapi begitu kita ganti ukurannya menjadi proporsi kerja informal, hubungannya muncul kuat (+0,63) — dan lebih kuat lagi untuk setengah pengangguran (+0,66). NTT (73% informal), Sulawesi Barat (72%), dan NTB (71%) adalah provinsi paling informal sekaligus paling miskin; Kepulauan Riau (32%) dan DKI (36%) paling formal. Masalahnya bukan 'tidak ada pekerjaan', melainkan pekerjaan yang tidak menghidupi.",
      "Di sini kita telusuri kelima ukuran itu tiap provinsi (TPT 2005–2024, termasuk lonjakan pandemi 2020), lalu menyandingkannya dengan kemiskinan. Perhatikan pula kesenjangan partisipasi kerja antara laki-laki dan perempuan.",
    ],
    kind: "labor",
    labor: {
      tptVar: "543",
      tpakVar: "2200",
      tpakMaleT: "211",
      tpakFemaleT: "212",
      povertyVar: "621",
      informalVar: "2153",
      underemployedVar: "1181",
      latestYear: 2024,
      trendFrom: 2005,
      note: "Tingkat Pengangguran Terbuka/TPT (var 543) dan Tingkat Partisipasi Angkatan Kerja/TPAK menurut jenis kelamin (var 2200), ditambah Proporsi Lapangan Kerja Informal (var 2153) dan Tingkat Setengah Pengangguran (var 1181) — semuanya tingkat provinsi. Dibandingkan dengan kemiskinan P0 (621). TPT hanya tersedia sampai tingkat provinsi. Sumber: BPS.",
    },
  },
  {
    slug: "kemana-uang-daerah-mengalir",
    title: "Ke Mana Uang Daerah Mengalir?",
    subtitle: "Gaji, barang, atau pembangunan? Struktur belanja tiap daerah bercerita banyak.",
    tag: "Ekonomi",
    source: "DJPK / Kemenkeu",
    intro: [
      "Setiap tahun pemerintah daerah membelanjakan ratusan triliun rupiah. Tapi ke mana uang itu sebenarnya mengalir? Belanja daerah terbagi ke dalam beberapa komponen: gaji pegawai, barang & jasa operasional, belanja modal (aset & infrastruktur), hibah, bantuan sosial, hingga transfer ke desa.",
      "Komposisinya sangat bervariasi. Sebagian daerah menghabiskan porsi besar untuk gaji dan operasional, menyisakan sedikit untuk belanja modal — investasi yang membangun jalan, jembatan, dan gedung. Di sini kita bedah struktur belanja tiap provinsi dan kabupaten/kota (realisasi APBD), sehingga terlihat mana yang berorientasi pembangunan dan mana yang tersedot untuk rutinitas.",
      "Pilih sebuah daerah untuk melihat rincian belanjanya secara utuh.",
    ],
    kind: "spending",
    spending: {
      totalAkun: "belanja_daerah",
      latestYear: 2024,
      note: "Komposisi realisasi Belanja Daerah (APBD) dari DJPK/Kemenkeu SIKD, per provinsi & kabupaten/kota, 2024. Sepuluh komponen yang dijumlahkan tepat sama dengan Belanja Daerah (belanja_lainnya sengaja tidak disertakan karena tumpang tindih). Sumber: DJPK.",
      components: [
        { akun: "belanja_pegawai", label: "Belanja Pegawai (gaji ASN)", short: "Pegawai", color: "#D9722C" },
        { akun: "belanja_barang_dan_jasa", label: "Belanja Barang & Jasa", short: "Barang & Jasa", color: "#37A98C" },
        { akun: "belanja_modal", label: "Belanja Modal (aset/infrastruktur)", short: "Modal", color: "#2A5AA0" },
        { akun: "belanja_hibah", label: "Belanja Hibah", short: "Hibah", color: "#9BCB4A" },
        { akun: "belanja_bantuan_sosial", label: "Belanja Bantuan Sosial", short: "Bansos", color: "#D9455E" },
        { akun: "belanja_bantuan_keuangan", label: "Belanja Bantuan Keuangan", short: "Bantuan Keuangan", color: "#6C6FE0" },
        { akun: "belanja_bagi_hasil", label: "Belanja Bagi Hasil", short: "Bagi Hasil", color: "#8E5BD1" },
        { akun: "belanja_subsidi", label: "Belanja Subsidi", short: "Subsidi", color: "#A87F2F" },
        { akun: "belanja_bunga", label: "Belanja Bunga (utang)", short: "Bunga", color: "#C0392B" },
        { akun: "belanja_tidak_terduga", label: "Belanja Tidak Terduga", short: "Tak Terduga", color: "#94A3B8" },
      ],
      groups: [
        { label: "Operasi", color: "#37A98C", akuns: ["belanja_pegawai", "belanja_barang_dan_jasa", "belanja_hibah", "belanja_bantuan_sosial", "belanja_subsidi", "belanja_bunga"] },
        { label: "Modal", color: "#2A5AA0", akuns: ["belanja_modal"] },
        { label: "Transfer", color: "#6C6FE0", akuns: ["belanja_bantuan_keuangan", "belanja_bagi_hasil"] },
        { label: "Tak Terduga", color: "#94A3B8", akuns: ["belanja_tidak_terduga"] },
      ],
    },
  },
  {
    slug: "kemandirian-fiskal-daerah",
    title: "Siapa Membiayai Daerahnya Sendiri?",
    subtitle: "Sebagian besar kabupaten hanya menghasilkan sepersepuluh pendapatannya — sisanya dari Jakarta.",
    tag: "Ekonomi",
    source: "DJPK / Kemenkeu",
    intro: [
      "Otonomi daerah menjanjikan pemerintahan yang mandiri. Kenyataannya, sebagian besar pendapatan daerah tidak berasal dari daerah itu sendiri, melainkan dari transfer pemerintah pusat (dana bagi hasil, DAU, DAK). Ukuran seberapa mandiri sebuah daerah disebut kemandirian fiskal: Pendapatan Asli Daerah (PAD) dibagi total pendapatan.",
      "Angkanya mengejutkan: median kabupaten/kota hanya menghasilkan sekitar 10% pendapatannya dari sumber sendiri — sisanya transfer dari pusat. Hanya segelintir daerah yang benar-benar mandiri: Badung dengan pariwisata Bali (87%), lalu kota-kota besar seperti Surabaya (61%) dan Denpasar (53%). Di sisi lain, gaji ASN menyedot lebih dari sepertiga belanja daerah (median 37%) — dan di 11 kabupaten/kota lebih dari separuhnya, menyisakan sedikit untuk pembangunan.",
      "Di sini kita telusuri empat rasio kunci APBD tiap provinsi dan kabupaten/kota: kemandirian, ketergantungan, belanja pegawai, dan belanja modal. Pilih sebuah daerah untuk membedah struktur keuangannya.",
    ],
    kind: "fiscal",
    fiscal: {
      primaryAkun: "rasio_kemandirian",
      // 2016 is where these ratios begin (2011–2015 return no PAD/pendapatan
      // lines). Starting there captures the sharpest movement in the dataset:
      // median belanja modal 24,1% -> 14,0%.
      years: [2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024],
      latestYear: 2024,
      note: "Rasio APBD (realisasi) dari DJPK/Kemenkeu SIKD: kemandirian (PAD÷Pendapatan), ketergantungan (Transfer÷Pendapatan), belanja pegawai & belanja modal (÷Belanja). Per provinsi & kabupaten/kota, 2016–2024. Grafik median mengikuti rasio yang dipilih. Cakupan berubah sepanjang periode (466–482 kab/kota sampai 2022, 508 sejak 2023 setelah pemekaran Papua) — karena itu yang ditampilkan median, yang tahan terhadap perubahan jumlah wilayah, bukan jumlah total. Kode wilayah DJPK dipetakan ke Kemendagri. Sumber: DJPK.",
      ratios: [
        { akun: "rasio_kemandirian", label: "Kemandirian Fiskal", short: "Kemandirian", desc: "Bagian pendapatan dari sumber sendiri (PAD ÷ total pendapatan). Makin tinggi = makin mandiri, makin sedikit bergantung pada transfer pusat.", color: "#15803D" },
        { akun: "rasio_ketergantungan", label: "Ketergantungan pada Pusat", short: "Ketergantungan", desc: "Bagian pendapatan dari transfer pemerintah pusat (TKDD ÷ pendapatan). Kebalikan dari kemandirian.", color: "#C0392B" },
        { akun: "rasio_belanja_pegawai", label: "Belanja Pegawai", short: "Belanja Pegawai", desc: "Bagian belanja yang habis untuk gaji & tunjangan ASN. Makin tinggi = makin sedikit ruang untuk pembangunan.", color: "#D9722C" },
        { akun: "rasio_belanja_modal", label: "Belanja Modal", short: "Belanja Modal", desc: "Bagian belanja untuk aset/investasi jangka panjang (infrastruktur dll). Makin tinggi = makin berorientasi pembangunan.", color: "#2A5AA0" },
      ],
    },
  },
  {
    slug: "kaya-tapi-miskin",
    title: "Kaya Tapi Miskin",
    subtitle: "Beberapa daerah menghasilkan output ekonomi raksasa — tapi warganya tetap miskin.",
    tag: "Ekonomi",
    source: "BPS",
    intro: [
      "PDRB per kapita — nilai output ekonomi dibagi jumlah penduduk — sering dipakai sebagai ukuran 'kemakmuran' daerah. Tapi output yang dihasilkan di sebuah wilayah tidak selalu dinikmati oleh warganya. Tambang, kilang LNG, atau smelter bisa melambungkan PDRB per kapita sebuah kabupaten ke langit, sementara sebagian besar keuntungannya mengalir ke luar daerah.",
      "Di sini kita sandingkan PDRB per kapita tiap kabupaten/kota dengan tingkat kemiskinannya. Hasilnya mengejutkan: sejumlah daerah dengan output per penduduk tertinggi di Indonesia justru punya angka kemiskinan yang tinggi pula. Morowali — pusat smelter nikel — mencatat output per penduduk tertinggi di Indonesia, sekitar Rp 874 juta per orang per tahun, dengan 11,6% warganya masih miskin. Teluk Bintuni, tetangga kilang LNG-nya, menghasilkan Rp 622 juta per orang dengan kemiskinan 27% — hampir tiga kali lipat rata-rata nasional.",
      "Perhatikan kuadrant kanan-atas pada grafik: di situlah daerah 'kaya tapi timpang' berada.",
      "Satu catatan penting: BPS belum menerbitkan seri ini untuk 26 kabupaten/kota di empat provinsi Papua baru (Papua Tengah, Papua Selatan, Papua Pegunungan, Papua Barat Daya) — termasuk Mimika, rumah tambang Grasberg. Halaman ini memuat 488 dari 514 kabupaten/kota, dan wilayah yang hilang itu justru sebagian dari kasus paling ekstremnya.",
    ],
    kind: "prosperity",
    prosperity: {
      pdrbVariableId: "2193",
      pdrbTotalTurvar: "1550",
      poorCountVariableId: "619",
      povertyRateVariableId: "621",
      populationIndicator: "jumlah_penduduk",
      latestYear: 2024,
      note: "PDRB per kapita = PDRB harga berlaku (BPS var 2193) ÷ jumlah penduduk tercatat (Dukcapil/Kemendagri), dijoin lewat crosswalk BPS→Kemendagri. Bukan angka resmi PDRB per kapita BPS: penyebutnya data registrasi Dukcapil, sedangkan BPS memakai proyeksi penduduk — di tingkat provinsi hasilnya meleset ~1,7% dari PDRB per kapita resmi BPS (var 288). Kemiskinan: P0 (621). Per kabupaten/kota, 2024. Cakupan: 488 dari 514 kabupaten/kota — BPS belum menerbitkan seri ini untuk 26 kab/kota di empat provinsi Papua baru (Papua Tengah, Papua Selatan, Papua Pegunungan, Papua Barat Daya). Sumber: BPS + Dukcapil.",
    },
  },
  {
    slug: "kesenjangan-gender-pendidikan",
    title: "Anak Perempuan, Sekolah, dan Ekonomi",
    subtitle: "Anak perempuan unggul di bangku sekolah — dan justru makin unggul. Kesenjangan ekonominya tidak ikut menutup.",
    tag: "Sosial",
    source: "BPS",
    intro: [
      "Anak perempuan Indonesia bukan baru saja menyusul di bangku sekolah — mereka sudah di depan sejak awal seri ini. Harapan Lama Sekolah perempuan lebih tinggi daripada laki-laki di setiap tahun sejak 2010, tanpa terkecuali. Yang berubah adalah jaraknya: sempat nyaris menutup pada 2014 (+0,03 tahun), lalu melebar terus hingga +0,40 tahun pada 2024 — terlebar sepanjang pencatatan.",
      "Tapi keunggulan di sekolah tidak berpindah ke ekonomi. Di sini kita bandingkan tiga ukuran menurut jenis kelamin di tiap daerah: Harapan Lama Sekolah (yang akan dijalani anak sekarang), Rata-rata Lama Sekolah (yang sudah ditamatkan penduduk dewasa — masih memihak laki-laki, warisan ketimpangan lama), dan Pengeluaran per Kapita. Yang terakhir timpang jauh: hanya 2 dari 488 kabupaten/kota yang angka perempuannya menyamai laki-laki.",
      "Satu catatan penting: Pengeluaran per Kapita menurut jenis kelamin bukan upah terukur. Dalam metodologi IPG/IPM, BPS mengimputasinya dari perkiraan bagian upah perempuan — jadi bacalah sebagai proksi kemampuan ekonomi, bukan bukti selisih gaji. (Upah per jam terukur — BPS var 1174 — menunjukkan selisih yang jauh lebih kecil: perempuan ~88% dari laki-laki pada 2024.)",
      "Pilih indikator dan wilayah untuk melihat di mana kesenjangan gender paling lebar — dan di mana ia justru berbalik.",
    ],
    kind: "gender",
    gender: {
      primaryKey: "hls",
      latestYear: 2025,
      note: "Harapan Lama Sekolah (457), Rata-rata Lama Sekolah (459), dan Pengeluaran per Kapita Disesuaikan (461) menurut jenis kelamin, per kabupaten/kota, 2025. Selisih = nilai perempuan − laki-laki. Cakupan: 488 dari 514 kabupaten/kota — BPS belum menerbitkan seri ini untuk 26 kab/kota di empat provinsi Papua baru (Papua Tengah, Papua Selatan, Papua Pegunungan, Papua Barat Daya). Sumber: BPS.",
      metrics: [
        { key: "hls", variableId: "457", label: "Harapan Lama Sekolah", short: "Harapan Sekolah", unit: "Tahun", decimals: 2, desc: "Perkiraan lama sekolah anak usia 7 tahun ke depan. Secara nasional perempuan sudah unggul — tanda pembalikan akses pendidikan." },
        { key: "rls", variableId: "459", label: "Rata-rata Lama Sekolah", short: "Rata-rata Sekolah", unit: "Tahun", decimals: 2, desc: "Tahun sekolah yang sudah ditamatkan penduduk 25+. Masih menyimpan warisan ketimpangan lama: laki-laki dewasa umumnya lebih tinggi." },
        { key: "income", variableId: "461", label: "Pengeluaran per Kapita", short: "Pengeluaran/Kapita", unit: "Ribu Rupiah/Orang/Tahun", decimals: 0, desc: "Proksi kemampuan ekonomi — bukan upah terukur: BPS mengimputasinya dari perkiraan bagian upah perempuan untuk keperluan IPG/IPM. Di sinilah kesenjangan gender paling lebar dan konsisten memihak laki-laki (hanya 2 dari 488 kab/kota yang perempuannya menyamai)." },
      ],
    },
  },
  {
    slug: "ketimpangan-bukan-kemiskinan",
    title: "Ketimpangan Bukan Kemiskinan",
    subtitle: "Provinsi paling timpang belum tentu paling miskin — dua hal yang sering tertukar.",
    tag: "Sosial",
    source: "BPS",
    intro: [
      "Kemiskinan dan ketimpangan sering dianggap sama, padahal berbeda. Kemiskinan mengukur berapa banyak yang hidup di bawah garis; ketimpangan (Gini Ratio) mengukur seberapa jauh jarak antara yang kaya dan yang miskin. Sebuah daerah bisa punya sedikit orang miskin tapi sangat timpang — banyak orang sangat kaya berdampingan dengan banyak yang pas-pasan.",
      "Gini Ratio bernilai 0 (semua orang persis sama) hingga 1 (satu orang menguasai segalanya). Ketimpangan perkotaan biasanya lebih tinggi daripada perdesaan — pada 2025 berlaku di 28 dari 33 provinsi. Tapi lima pengecualiannya justru yang paling menarik: di Papua, Gini perdesaan (0,479) jauh melampaui perkotaannya (0,318) — dan itu angka ketimpangan tertinggi di seluruh data 2025, di atas DKI Jakarta sekalipun. Hal serupa terjadi di Papua Barat, NTT, Kalimantan Timur, dan Sulawesi Utara.",
      "Perhatikan grafik sebar: hubungan Gini dengan kemiskinan ternyata lemah (r ≈ 0,28). Yogyakarta dan DKI Jakarta termasuk paling timpang justru karena banyak penduduk makmurnya, bukan karena paling miskin.",
    ],
    kind: "inequality",
    inequality: {
      variableId: "98",
      turvars: { total: "191", urban: "189", rural: "190" },
      latestYear: 2025,
      note: "Gini Ratio menurut provinsi & daerah (var 98), 2002–2025. Hanya tersedia di tingkat provinsi (BPS tidak merilis Gini kabupaten/kota). Dibandingkan dengan Persentase Penduduk Miskin/P0 (621) dan IPM provinsi (var 2207, basis UHH Long Form SP2020 — seri yang terbit sampai 2025; angkanya sedikit berbeda dari IPM var 413 yang dipakai di Sorotan IPM dan berhenti di 2024). Sumber: BPS.",
      compare: [
        { key: "p0", variableId: "621", label: "Persentase Penduduk Miskin (P0)", short: "Kemiskinan (P0)", unit: "%", decimals: 2 },
        // var 413 stops at 2024, so at latestYear 2025 it returned zero rows and
        // the scatter rendered empty. 2207 is the province IPM series that BPS
        // still publishes (UHH from the SP2020 long form), so it matches the
        // Gini year rather than silently pairing 2025 Gini with 2024 IPM.
        { key: "ipm", variableId: "2207", label: "Indeks Pembangunan Manusia", short: "IPM", unit: "", decimals: 2 },
      ],
    },
  },
  {
    slug: "identitas-digital-ktp",
    title: "Peta Buta Identitas Digital",
    subtitle: "Hampir semua orang Indonesia punya KTP-el — kecuali di pegunungan Papua.",
    tag: "Sosial",
    source: "Dukcapil (Kemendagri)",
    intro: [
      "KTP elektronik adalah gerbang menuju hampir semua layanan negara: bantuan sosial, BPJS, rekening bank, hak pilih. Secara nasional, cakupan perekaman KTP-el sudah luar biasa tinggi — median kabupaten/kota mencapai 99%.",
      "Tapi rata-rata yang tinggi menyembunyikan sebuah jurang. Di sejumlah kabupaten pegunungan Papua — Yahukimo (8%), Puncak (11%), Nduga (12%), Intan Jaya (13%) — cakupan perekaman hanya 8–14%. Godaannya adalah menjelaskannya dengan medan terjal dan jarak. Datanya tidak mendukung itu: keterpencilan tidak memprediksi cakupan sama sekali (korelasi kepadatan penduduk dengan cakupan KTP-el hanya 0,11) — ini bukan gradien, melainkan tujuh-delapan kabupaten yang sangat spesifik.",
      "Ada petunjuk yang lebih tajam, dan ia datang dari register itu sendiri. Di kabupaten-kabupaten itu, penduduk 17 tahun ke atas tercatat 86–90% dari total penduduk, jauh di atas median nasional 71%; anak 0–4 tahun di Puncak hanya 2.477 jiwa berbanding 20.881 orang berusia 25–29. Struktur seperti itu mustahil secara demografis. Artinya penyebut 'wajib KTP'-nya sendiri menggelembung: kita tidak bisa memisahkan berapa banyak warga yang benar-benar belum terjangkau dari berapa banyak yang sebenarnya tidak ada di sana. Ketidakpastian itulah ceritanya.",
      "Di sini kita petakan cakupan KTP-el tiap daerah, beserta kepadatan penduduk dan struktur demografinya — untuk melihat di mana identitas digital masih menjadi 'peta buta'.",
    ],
    kind: "demography",
    demography: {
      primaryField: "ktp_coverage",
      scatterX: "pop_density",
      scatterY: "ktp_coverage",
      ageProfile: false,
      note: "Cakupan perekaman KTP-elektronik (persentase penduduk wajib KTP yang sudah merekam) menurut provinsi & kabupaten/kota. Sumber: Dukcapil (Ditjen Dukcapil, Kemendagri).",
      metrics: [
        { field: "ktp_coverage", label: "Cakupan Perekaman KTP-el", short: "Cakupan KTP-el", unit: "%", decimals: 1, desc: "Persentase penduduk wajib KTP yang sudah merekam KTP-elektronik — ukuran jangkauan administrasi & identitas digital. Terendah di segelintir kabupaten pegunungan Papua, yang penyebut 'wajib KTP'-nya sendiri diragukan (lihat % anak)." },
        { field: "pop_density", label: "Kepadatan Penduduk", short: "Kepadatan", unit: "jiwa/km²", decimals: 0, desc: "Jumlah penduduk per kilometer persegi. Perhatikan: kepadatan hampir tidak berhubungan dengan cakupan perekaman (r ≈ 0,11) — keterpencilan bukan penjelasnya." },
        { field: "median_age", label: "Usia Median", short: "Usia Median", unit: "th", decimals: 1, desc: "Usia median penduduk — konteks demografi daerah." },
        { field: "avg_household", label: "Rata-rata Jiwa per KK", short: "Jiwa/KK", unit: "", decimals: 2, desc: "Rata-rata anggota per kepala keluarga." },
      ],
    },
  },
  {
    slug: "keberagaman-agama-daerah",
    title: "Seberapa Beragam Daerahmu?",
    subtitle: "Dari Bengkayang yang nyaris seimbang tiga agama, hingga daerah yang hampir seragam.",
    tag: "Sosial",
    source: "Dukcapil (Kemendagri)",
    intro: [
      "Indonesia dikenal majemuk, tapi kemajemukan itu terdistribusi sangat tidak merata. Sebagian kabupaten nyaris homogen — satu agama menaungi hampir seluruh penduduk — sementara sebagian lain begitu berimbang hingga tak ada satu pun agama yang benar-benar mayoritas.",
      "Menggunakan data administrasi kependudukan Dukcapil, kita ukur komposisi agama tiap daerah dan meringkasnya dalam indeks keberagaman (0 = seragam, makin tinggi makin beragam). Yang paling beragam justru bukan kota besar, melainkan daerah seperti Bengkayang (70,0) dan Sintang di Kalimantan Barat, tempat Islam, Kristen, dan Katolik hidup nyaris seimbang. Skalanya perlu dibaca dengan benar: karena hanya ada tujuh kategori agama, nilai maksimum yang mungkin secara matematis adalah 85,7 — bukan 100. Angka 70 milik Bengkayang jauh lebih dekat ke puncak daripada kelihatannya.",
      "Satu hal yang perlu diketahui pembaca: agama di sini berasal dari kolom KTP, yang secara historis hanya menampung enam agama resmi (kolom 'Kepercayaan' baru dimungkinkan setelah putusan Mahkamah Konstitusi 2017). Penganut agama leluhur banyak yang tercatat ke dalam salah satu dari enam itu — sehingga keberagaman justru cenderung tercatat lebih rendah dari kenyataannya, persis di daerah Kalimantan, Papua, dan Mentawai yang menempati puncak peringkat ini.",
      "Pilih sebuah daerah untuk melihat komposisi agamanya secara utuh. Data ini berasal dari pencatatan administrasi, disajikan apa adanya tanpa penilaian.",
    ],
    kind: "diversity",
    diversity: {
      diversityField: "religion_diversity",
      note: "Komposisi agama menurut data administrasi kependudukan Dukcapil (Kemendagri), per provinsi & kabupaten/kota. Indeks keberagaman 0–100 (makin tinggi makin beragam). Disajikan apa adanya dari pencatatan adminduk.",
      religions: [
        { field: "islam", label: "Islam", color: "#15803D" },
        { field: "kristen", label: "Kristen", color: "#3F6FD6" },
        { field: "katholik", label: "Katolik", color: "#2A5AA0" },
        { field: "hindu", label: "Hindu", color: "#D9722C" },
        { field: "budha", label: "Buddha", color: "#A87F2F" },
        { field: "konghucu", label: "Konghucu", color: "#C0392B" },
        { field: "kepercayaan", label: "Kepercayaan", color: "#94A3B8" },
      ],
    },
  },
  {
    slug: "mobilitas-penduduk",
    title: "Ke Mana Penduduk Bergerak?",
    subtitle: "Kawasan nikel dan kabupaten termiskin sama-sama mencatat perpindahan tertinggi — arah tak terbaca dari angkanya.",
    tag: "Sosial",
    source: "Dukcapil (Kemendagri)",
    intro: [
      "Penduduk Indonesia terus bergerak — mencari kerja, mengikuti keluarga, atau menuju pusat-pusat pertumbuhan baru. Data administrasi kependudukan Dukcapil mencatat perpindahan penduduk tiap daerah, yang bisa dijadikan ukuran mobilitas: berapa banyak perpindahan per 1.000 penduduk.",
      "Dua nama teratas menjelaskan mengapa angka ini harus dibaca hati-hati. Halmahera Tengah — kawasan smelter nikel — memuncaki daftar dengan 26 perpindahan per 1.000 penduduk, persis seperti dugaan kita tentang frontier industri. Tapi peringkat kedua adalah Nias Barat (19,5), salah satu kabupaten termiskin di Indonesia dan daerah asal perantau klasik. Keduanya bergerak sama derasnya; yang satu orang berdatangan, yang satu orang pergi.",
      "Itulah batas ukuran ini: 'perpindahan per 1.000' menghitung peristiwa perpindahan yang tercatat (mobilitas/churn), bukan migrasi neto (masuk dikurangi keluar). Ia memberi tahu seberapa deras sebuah daerah bergerak, bukan ke arah mana. Untuk petunjuk arah, lihat rasio jenis kelamin — daerah tujuan kerja cenderung condong ke laki-laki.",
      "Di sini kita telusuri mobilitas, kepadatan, fertilitas (rasio anak per wanita), dan angka kematian kasar untuk memahami dinamika penduduk tiap provinsi dan kabupaten/kota.",
    ],
    kind: "demography",
    demography: {
      primaryField: "net_migration_rate",
      scatterX: "pop_density",
      scatterY: "net_migration_rate",
      ageProfile: false,
      note: "Dinamika penduduk menurut provinsi & kabupaten/kota. 'Perpindahan per 1.000' = peristiwa perpindahan tercatat per 1.000 penduduk (mobilitas, bukan migrasi neto). Sumber: Dukcapil (Ditjen Dukcapil, Kemendagri).",
      metrics: [
        { field: "net_migration_rate", label: "Perpindahan per 1.000", short: "Mobilitas", unit: "", decimals: 1, desc: "Jumlah peristiwa perpindahan penduduk tercatat per 1.000 penduduk — ukuran seberapa 'bergerak' sebuah daerah, bukan ke arah mana. Tertinggi di kawasan nikel Halmahera Tengah (orang datang) sekaligus di Nias Barat (orang pergi)." },
        { field: "sex_ratio", label: "Rasio Jenis Kelamin", short: "Rasio L/P", unit: "", decimals: 1, desc: "Jumlah laki-laki per 100 perempuan (median nasional ~102). Condong ke laki-laki adalah penanda klasik daerah tujuan migrasi kerja — satu-satunya petunjuk arah yang tersedia di sini. Hati-hati di pegunungan Papua: registernya sendiri diragukan." },
        { field: "child_woman_ratio", label: "Rasio Anak per 1.000 Wanita", short: "Fertilitas", unit: "", decimals: 0, desc: "Jumlah anak (0–4) per 1.000 wanita usia subur — proksi tingkat kelahiran." },
        { field: "crude_death_rate", label: "Angka Kematian Kasar", short: "Kematian", unit: "", decimals: 1, desc: "Jumlah kematian tercatat per 1.000 penduduk." },
        { field: "pop_density", label: "Kepadatan Penduduk", short: "Kepadatan", unit: "jiwa/km²", decimals: 0, desc: "Jumlah penduduk per kilometer persegi. Perhatikan: kepadatan praktis tak berhubungan dengan mobilitas (r ≈ −0,02) — daerah padat bukan berarti lebih banyak perpindahan tercatat." },
        { field: "avg_household", label: "Rata-rata Jiwa per KK", short: "Jiwa/KK", unit: "", decimals: 2, desc: "Rata-rata anggota per kepala keluarga — ukuran besar rumah tangga." },
        { field: "median_age", label: "Usia Median", short: "Usia Median", unit: "th", decimals: 1, desc: "Usia median penduduk — konteks: daerah tujuan perpindahan kerja cenderung lebih muda." },
      ],
    },
  },
  {
    slug: "bonus-demografi-penuaan",
    title: "Bonus Demografi & Penuaan",
    subtitle: "Sebagian daerah dipenuhi anak muda; sebagian lain mulai menua. Siapa dapat 'bonus'?",
    tag: "Sosial",
    source: "Dukcapil (Kemendagri)",
    intro: [
      "Struktur usia sebuah daerah menentukan masa depannya. Ketika penduduk usia produktif (15–64) jauh lebih banyak daripada yang harus ditanggung (anak dan lansia), sebuah daerah menikmati 'bonus demografi' — peluang pertumbuhan yang tidak akan berlangsung selamanya.",
      "Tapi Indonesia tidak menua secara merata. Jaraknya lebih dari dua dekade: usia median di Asmat baru 18,8 tahun, sementara Ponorogo sudah 39,9 tahun — disusul Tabanan, Gunungkidul, dan Pacitan yang semuanya mendekati 40. Di tingkat provinsi rentangnya lebih rapat, dengan DI Yogyakarta tertua di 36,9 tahun. Di sini kita telusuri rasio ketergantungan, usia median, dan komposisi umur tiap provinsi dan kabupaten/kota — dari data administrasi kependudukan Dukcapil.",
      "Pilih sebuah wilayah untuk melihat piramida usianya dan di mana ia berada dalam transisi demografi.",
      "Catatan: rasio ketergantungan sangat rendah tidak selalu berarti bonus demografi. Di beberapa kabupaten pegunungan Papua, anak justru nyaris tak tercatat dalam register — sehingga penduduk usia produktif tampak mendominasi. Wilayah seperti itu ditandai pada peringkat, dan dikecualikan dari kartu 'beban tanggungan terendah'.",
    ],
    kind: "demography",
    demography: {
      primaryField: "dependency_ratio",
      scatterX: "median_age",
      scatterY: "dependency_ratio",
      note: "Struktur usia penduduk menurut provinsi & kabupaten/kota. Sumber: Dukcapil (Ditjen Dukcapil, Kemendagri) — data administrasi kependudukan, kode & cakupan wilayah berbeda dari BPS.",
      metrics: [
        { field: "dependency_ratio", label: "Rasio Ketergantungan", short: "Rasio Ketergantungan", unit: "", decimals: 1, desc: "Jumlah penduduk non-produktif (anak + lansia) per 100 penduduk usia produktif. Makin rendah, makin besar 'bonus demografi'." },
        { field: "median_age", label: "Usia Median", short: "Usia Median", unit: "th", decimals: 1, desc: "Usia yang membagi penduduk menjadi dua bagian sama besar — ukuran seberapa muda/tua sebuah daerah." },
        { field: "pct_productive", label: "% Usia Produktif (15–64)", short: "% Produktif", unit: "%", decimals: 1, desc: "Persentase penduduk usia kerja — inti dari bonus demografi." },
        { field: "pct_elderly", label: "% Lansia (65+)", short: "% Lansia", unit: "%", decimals: 1, desc: "Persentase penduduk lanjut usia — penanda daerah yang mulai menua." },
        { field: "pct_children", label: "% Anak (0–14)", short: "% Anak", unit: "%", decimals: 1, desc: "Persentase penduduk anak — tinggi di daerah dengan kelahiran masih tinggi." },
        { field: "dependency_old", label: "Rasio Ketergantungan Lansia", short: "Tanggungan Lansia", unit: "", decimals: 1, desc: "Lansia (65+) per 100 penduduk produktif — beban yang cenderung naik seiring penuaan." },
        { field: "dependency_young", label: "Rasio Ketergantungan Muda", short: "Tanggungan Muda", unit: "", decimals: 1, desc: "Anak (0–14) per 100 penduduk produktif — beban yang menurun saat fertilitas turun." },
        { field: "sex_ratio", label: "Rasio Jenis Kelamin", short: "Rasio L/P", unit: "", decimals: 1, desc: "Jumlah laki-laki per 100 perempuan — tinggi di daerah tujuan migrasi kerja." },
      ],
    },
  },
  {
    slug: "membedah-ipm-daerah",
    title: "Membedah Pembangunan Manusia",
    subtitle: "Satu angka IPM menyembunyikan tiga cerita: umur, sekolah, dan daya beli.",
    tag: "Sosial",
    source: "BPS",
    intro: [
      "Indeks Pembangunan Manusia (IPM) meringkas kemajuan sebuah daerah dalam satu angka 0–100. Tapi angka itu adalah gabungan dari tiga dimensi yang sangat berbeda: umur panjang dan sehat, pengetahuan, dan standar hidup layak. Dua daerah dengan IPM sama bisa tertinggal di dimensi yang berbeda — yang satu di pendidikan, yang lain di daya beli.",
      "BPS menghitung IPM (metode baru) dari empat indikator: Umur Harapan Hidup (kesehatan), Harapan Lama Sekolah dan Rata-rata Lama Sekolah (pendidikan), serta Pengeluaran per Kapita Disesuaikan (standar hidup). Di sini kita bongkar IPM tiap kabupaten/kota menjadi dimensi-dimensinya, 2010–2024.",
      "Pilih sebuah wilayah untuk melihat di dimensi mana ia unggul dan di mana ia tertinggal — dan lihat bagaimana pembangunan manusia berjalan beriringan dengan kemiskinan.",
    ],
    kind: "hdi",
    hdi: {
      compositeKey: "ipm",
      latestYear: 2024,
      firstYear: 2010,
      povertyVariableId: "621",
      formula: {
        uhhMin: 20,
        uhhMax: 85,
        hlsMax: 18,
        rlsMax: 15,
        expenditureMin: 1_007_436,
        expenditureMax: 26_572_352,
      },
      note: "IPM metode baru dan komponennya (Umur Harapan Hidup, Harapan Lama Sekolah, Rata-rata Lama Sekolah, Pengeluaran per Kapita Disesuaikan) menurut kabupaten/kota, 2010–2024. Nilai lebih tinggi = lebih baik. Dekomposisi tiga dimensi Cakupan: 488 dari 514 kabupaten/kota — BPS belum menerbitkan seri ini untuk 26 kab/kota di empat provinsi Papua baru (Papua Tengah, Papua Selatan, Papua Pegunungan, Papua Barat Daya). dihitung ulang dari komponen tersimpan memakai batas (goalpost) metode baru BPS; hasilnya direkonsiliasi dengan IPM terbitan BPS dan selisihnya ditampilkan. Sumber: BPS.",
      categories: [
        { label: "Sangat Tinggi", min: 80, color: "#15803D" },
        { label: "Tinggi", min: 70, color: "#5FBF6A" },
        { label: "Sedang", min: 60, color: "#E0B93B" },
        { label: "Rendah", min: 0, color: "#C0392B" },
      ],
      metrics: [
        { key: "ipm", variableId: "413", label: "Indeks Pembangunan Manusia (IPM)", short: "IPM", unit: "", decimals: 2, desc: "Angka gabungan 0–100 dari tiga dimensi: kesehatan, pendidikan, dan standar hidup." },
        { key: "uhh", variableId: "414", label: "Umur Harapan Hidup (UHH)", short: "Umur Harapan Hidup", unit: "Tahun", decimals: 2, desc: "Rata-rata perkiraan umur bayi yang baru lahir — dimensi kesehatan.", dimension: "Kesehatan" },
        { key: "hls", variableId: "417", label: "Harapan Lama Sekolah (HLS)", short: "Harapan Lama Sekolah", unit: "Tahun", decimals: 2, desc: "Perkiraan lama sekolah yang akan dijalani anak usia 7 tahun ke depan — dimensi pendidikan.", dimension: "Pendidikan" },
        { key: "rls", variableId: "415", label: "Rata-rata Lama Sekolah (RLS)", short: "Rata-rata Lama Sekolah", unit: "Tahun", decimals: 2, desc: "Rata-rata jumlah tahun sekolah yang telah ditamatkan penduduk 25+ — dimensi pendidikan.", dimension: "Pendidikan" },
        { key: "income", variableId: "416", label: "Pengeluaran per Kapita Disesuaikan", short: "Pengeluaran/Kapita", unit: "Ribu Rupiah/Orang/Tahun", decimals: 0, desc: "Kemampuan daya beli riil penduduk — dimensi standar hidup.", dimension: "Pengeluaran" },
      ],
    },
  },
  {
    slug: "struktur-ekonomi-daerah",
    title: "Struktur Ekonomi Daerah",
    subtitle: "Apa yang sebenarnya menggerakkan ekonomi tiap kabupaten/kota?",
    tag: "Ekonomi",
    source: "BPS",
    intro: [
      "Angka PDRB total hanya memberi tahu seberapa besar ekonomi sebuah daerah — bukan dari mana ekonomi itu berasal. Dua kabupaten dengan PDRB serupa bisa memiliki struktur yang sama sekali berbeda: yang satu bertumpu pada pertanian, yang lain pada industri atau pertambangan.",
      "Di sini kita bedah PDRB tiap kabupaten/kota menjadi 17 kategori lapangan usaha (A–U) untuk melihat komposisinya secara utuh. Pilih sebuah wilayah untuk melihat sektor mana yang mendominasi dan seberapa besar kontribusinya.",
    ],
    kind: "composition",
    composition: {
      variableId: "2776",
      totalTurvarId: "2022", // "Produk Domestik Regional Bruto" (grand total)
      unit: "Milyar Rupiah",
      adminLevel: "regency",
      year: "2026",
      note: "Komposisi sektor: PDRB triwulanan harga berlaku menurut 17 kategori lapangan usaha (triwulan terkini). Peringkat & besaran: PDRB tahunan harga konstan (2010=100) tahun penuh terakhir. Cakupan: 488 dari 514 kabupaten/kota — BPS belum menerbitkan seri ini untuk 26 kab/kota di empat provinsi Papua baru (Papua Tengah, Papua Selatan, Papua Pegunungan, Papua Barat Daya). Sumber: BPS.",
      // Total/magnitude + trend + ranking-movement use harga konstan (real
      // growth), full years only. Composition shares come from the (latest-
      // quarter) 17-sector variable above — there is no full-year kab 17-sector.
      trend: { variableId: "2194", totalTurvarId: "1550", unit: "Milyar Rupiah", label: "PDRB tahunan (harga konstan 2010)" },
      history: { variableId: "2267", totalTurvarId: "2022", unit: "Milyar Rupiah", label: "PDRB per lapangan usaha (harga konstan 2010)", partialLastYear: true },
      groups: [
        { label: "Primer", color: "#5FBF6A", ids: ["2005", "2006"] },
        { label: "Sekunder", color: "#EE9A3A", ids: ["2007", "2008", "2009", "2010"] },
        { label: "Tersier", color: "#6C6FE0", ids: ["2011", "2012", "2013", "2014", "2015", "2016", "2017", "2018", "2019", "2020", "2021"] },
      ],
      shortLabels: {
        "2005": "Pertanian", "2006": "Pertambangan", "2007": "Industri", "2008": "Listrik & Gas",
        "2009": "Air & Limbah", "2010": "Konstruksi", "2011": "Perdagangan", "2012": "Transportasi",
        "2013": "Akomodasi & Mamin", "2014": "Infokom", "2015": "Keuangan", "2016": "Real Estate",
        "2017": "Jasa Perusahaan", "2018": "Pemerintahan", "2019": "Pendidikan", "2020": "Kesehatan",
        "2021": "Jasa Lainnya",
      },
    },
  },
  {
    slug: "anatomi-kemiskinan-daerah",
    title: "Anatomi Kemiskinan Daerah",
    subtitle: "Bukan hanya berapa banyak yang miskin — tapi seberapa dalam dan separah apa.",
    tag: "Sosial",
    source: "BPS",
    intro: [
      "Kemiskinan biasanya diringkas dalam satu angka: persentase penduduk miskin. Tapi angka itu hanya menghitung berapa banyak orang yang berada di bawah garis kemiskinan — bukan seberapa jauh mereka tertinggal, atau apakah jurang antar-mereka melebar.",
      "BPS mengukur kemiskinan dalam tiga lapis (kerangka Foster–Greer–Thorbecke): P0 — persentase penduduk miskin (headcount), P1 — Indeks Kedalaman, seberapa jauh rata-rata pengeluaran orang miskin di bawah garis kemiskinan, dan P2 — Indeks Keparahan, yang memberi bobot lebih pada yang paling miskin. Ditambah jumlah absolut penduduk miskin, keempatnya melukiskan gambaran yang jauh lebih jujur.",
      "Di sini kita bedah keempat ukuran itu untuk tiap provinsi dan kabupaten/kota, 2004–2025. Kita akan lihat paradoks klasiknya: daerah dengan jumlah orang miskin terbanyak sering bukan daerah dengan tingkat kemiskinan tertinggi — dan kemiskinan yang paling dalam justru tersembunyi di tempat yang jarang disorot.",
    ],
    kind: "poverty",
    poverty: {
      primaryKey: "p0",
      countKey: "count",
      latestYear: 2025,
      firstYear: 2004,
      national: {
        rateVariableId: "184",
        countVariableId: "183",
        totalVervarId: "3",
        urbanVervarId: "1",
        ruralVervarId: "2",
      },
      note: "Persentase Penduduk Miskin (P0), Indeks Kedalaman (P1), Indeks Keparahan (P2), dan Jumlah Penduduk Miskin menurut provinsi & kabupaten/kota, 2004–2025. Ukuran tingkat (P0/P1/P2) tidak dijumlahkan antar-wilayah — tiap level diambil langsung dari BPS. Cakupan: 488 dari 514 kabupaten/kota — BPS belum menerbitkan seri ini untuk 26 kab/kota di empat provinsi Papua baru (Papua Tengah, Papua Selatan, Papua Pegunungan, Papua Barat Daya). Tren nasional memakai seri nasional BPS (P0 var 184, jumlah var 183; Kota+Desa), 1996–2025 — bukan hasil penjumlahan provinsi. Sumber: BPS.",
      metrics: [
        {
          key: "count",
          variableId: "619",
          label: "Jumlah Penduduk Miskin",
          short: "Jumlah",
          unit: "ribu jiwa",
          decimals: 1,
          desc: "Berapa banyak penduduk yang hidup di bawah garis kemiskinan (jumlah absolut).",
        },
        {
          key: "p0",
          variableId: "621",
          label: "Persentase Penduduk Miskin (P0)",
          short: "P0 · Headcount",
          unit: "%",
          decimals: 2,
          desc: "Berapa persen penduduk yang miskin — ukuran seberapa luas kemiskinan.",
        },
        {
          key: "p1",
          variableId: "622",
          label: "Indeks Kedalaman Kemiskinan (P1)",
          short: "P1 · Kedalaman",
          unit: "",
          decimals: 2,
          desc: "Seberapa jauh rata-rata pengeluaran penduduk miskin di bawah garis kemiskinan — makin tinggi, makin dalam.",
        },
        {
          key: "p2",
          variableId: "623",
          label: "Indeks Keparahan Kemiskinan (P2)",
          short: "P2 · Keparahan",
          unit: "",
          decimals: 2,
          desc: "Seperti P1 tapi memberi bobot lebih besar pada yang paling miskin — ukuran ketimpangan di antara penduduk miskin.",
        },
        {
          key: "garis",
          variableId: "624",
          label: "Garis Kemiskinan",
          short: "Garis Kemiskinan",
          unit: "Rupiah/kapita/bulan",
          decimals: 0,
          desc: "Ambang yang dipakai BPS untuk memutuskan siapa miskin — disusun dari harga lokal, jadi berbeda di tiap daerah. Rentangnya 3,6× (Mamuju Tengah ~Rp344 rb, Jayapura ~Rp1,25 jt per orang per bulan), dan nyaris tak berhubungan dengan angka kemiskinannya sendiri (r≈−0,08). Artinya: 'miskin' di satu daerah bukan 'miskin' yang sama di daerah lain.",
        },
      ],
    },
  },
  {
    slug: "belanja-ekonomi-daerah",
    title: "Untuk Apa Ekonomi Daerah Dibelanjakan?",
    subtitle: "Konsumsi, investasi, atau ekspor — sisi pengeluaran dari PDRB tiap daerah.",
    tag: "Ekonomi",
    source: "BPS",
    intro: [
      "PDRB bisa dibaca dari dua sisi. Sisi lapangan usaha menjawab \"apa yang memproduksi ekonomi\" (pertanian, industri, jasa). Sisi pengeluaran menjawab pertanyaan yang berbeda: \"untuk apa ekonomi itu dipakai\" — dikonsumsi rumah tangga, dibelanjakan pemerintah, diinvestasikan, atau diekspor.",
      "Enam komponennya: Konsumsi Rumah Tangga, Konsumsi LNPRT, Konsumsi Pemerintah, Pembentukan Modal Tetap Bruto (investasi), Perubahan Inventori, dan Net Ekspor. Yang terakhir bisa negatif — banyak daerah kota mengimpor lebih banyak daripada yang diekspor, sehingga Net Ekspor-nya minus.",
      "Data ini tersedia tahunan penuh 2010–2025 di tingkat kabupaten/kota (harga konstan 2010=100), jadi kita bisa melihat komposisi tahun penuh dan perkembangannya dari waktu ke waktu.",
    ],
    kind: "expenditure",
    expenditure: {
      variableId: "2194",
      totalTurvarId: "1550",
      unit: "Milyar Rupiah",
      year: "2025",
      note: "PDRB menurut pengeluaran, atas dasar harga konstan (2010=100), tahun penuh 2010–2025. Net Ekspor dapat bernilai negatif. Cakupan: 488 dari 514 kabupaten/kota — BPS belum menerbitkan seri ini untuk 26 kab/kota di empat provinsi Papua baru (Papua Tengah, Papua Selatan, Papua Pegunungan, Papua Barat Daya). Sumber: BPS.",
      components: [
        { id: "1544", label: "Konsumsi RT", color: "#2E5BDA" },
        { id: "1545", label: "Konsumsi LNPRT", color: "#4E8CF0" },
        { id: "1546", label: "Konsumsi Pemerintah", color: "#37A98C" },
        { id: "1547", label: "PMTB (Investasi)", color: "#E0B93B" },
        { id: "1548", label: "Perubahan Inventori", color: "#EE9A3A" },
        { id: "1549", label: "Net Ekspor", color: "#8E5BD1" },
      ],
      groups: [
        { label: "Konsumsi", color: "#37A98C", ids: ["1544", "1545", "1546"] },
        { label: "Investasi", color: "#E0B93B", ids: ["1547", "1548"] },
        { label: "Net Ekspor", color: "#8E5BD1", ids: ["1549"] },
      ],
    },
  },
];

export function getPost(slug: string): Post | undefined {
  return POSTS.find((p) => p.slug === slug);
}
