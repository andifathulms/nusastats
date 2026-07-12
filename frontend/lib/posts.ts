// Curated "Sorotan" posts — hand-picked BPS analyses with a purpose-built
// visualization + narrative. Config-driven (authored here in code); each post
// declares a `kind` that maps to a viz component in app/sorotan/[slug].
//
// `composition`: one variable whose `turvar` breakdown are the parts of a whole
// (e.g. PDRB by 17 lapangan-usaha categories). Reuses the existing BPS API —
// `ranking` (turvar=total) for the region list, `series` for one region's parts.

export type PostKind = "composition" | "poverty";

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
  key: "count" | "p0" | "p1" | "p2";
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
  fullCoverageYear: number; // first year all 34 provinces report (national sums valid from here)
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
};

export const POSTS: Post[] = [
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
      note: "Komposisi sektor: PDRB triwulanan harga berlaku menurut 17 kategori lapangan usaha (triwulan terkini). Peringkat & besaran: PDRB tahunan harga konstan (2010=100) tahun penuh terakhir. Sumber: BPS.",
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
      fullCoverageYear: 2017,
      note: "Persentase Penduduk Miskin (P0), Indeks Kedalaman (P1), Indeks Keparahan (P2), dan Jumlah Penduduk Miskin menurut provinsi & kabupaten/kota, 2004–2025. Ukuran tingkat (P0/P1/P2) tidak dijumlahkan antar-wilayah — tiap level diambil langsung dari BPS. Sumber: BPS.",
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
      ],
    },
  },
];

export function getPost(slug: string): Post | undefined {
  return POSTS.find((p) => p.slug === slug);
}
