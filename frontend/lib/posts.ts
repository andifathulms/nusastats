// Curated "Sorotan" posts — hand-picked BPS analyses with a purpose-built
// visualization + narrative. Config-driven (authored here in code); each post
// declares a `kind` that maps to a viz component in app/sorotan/[slug].
//
// `composition`: one variable whose `turvar` breakdown are the parts of a whole
// (e.g. PDRB by 17 lapangan-usaha categories). Reuses the existing BPS API —
// `ranking` (turvar=total) for the region list, `series` for one region's parts.

export type PostKind = "composition";

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

export type Post = {
  slug: string;
  title: string;
  subtitle: string;
  tag: string;
  source: string;
  intro: string[];
  kind: PostKind;
  composition: CompositionConfig;
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
      note: "PDRB triwulanan atas dasar harga berlaku, menurut 17 kategori lapangan usaha. Sumber: BPS.",
      trend: { variableId: "2193", totalTurvarId: "1550", unit: "Milyar Rupiah", label: "PDRB tahunan (harga berlaku)" },
      history: { variableId: "2268", totalTurvarId: "2022", unit: "Milyar Rupiah", label: "PDRB per lapangan usaha (harga berlaku)", partialLastYear: true },
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
];

export function getPost(slug: string): Post | undefined {
  return POSTS.find((p) => p.slug === slug);
}
