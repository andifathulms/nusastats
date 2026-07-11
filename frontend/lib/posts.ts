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
      variableId: "2775",
      totalTurvarId: "2022", // "Produk Domestik Regional Bruto" (grand total)
      unit: "Milyar Rupiah",
      adminLevel: "regency",
      year: "2026",
      note: "PDRB triwulanan seri 2010 atas dasar harga konstan (2010=100), menurut 17 kategori lapangan usaha. Sumber: BPS.",
    },
  },
];

export function getPost(slug: string): Post | undefined {
  return POSTS.find((p) => p.slug === slug);
}
