// Nusantara Mapper card brand. One theme colour per kind of subject, so each
// slide of a carousel looks different while the layout stays the same, and a
// choice of palettes ("tema") for the whole card. Every colour a card draws
// is a CSS variable set here on the card root (see globals.css .nm-card), so
// SVG maps follow the palette too.
import type { CSSProperties } from "react";

type Subject = "penduduk" | "lahan" | "air" | "cahaya" | "wilayah";
type Palette = {
  label: string;
  /** Light paper: data ramps flip so more = darker (geo.ts setLightRamps). */
  light: boolean;
  bg: string;
  ink: string;
  muted: string;
  line: string;
  /** The one thing to look at: rank chip, hook number. */
  sorot: string;
  subject: Record<Subject, string>;
  /** Map strokes and fills. */
  edge: string; // the kabupaten outline and labels' text
  seam: string; // thin lines between choropleth polygons
  border: string; // kecamatan borders on the admin map
  borderSoft: string; // kecamatan over density, neighbours behind a region
  borderStrong: string; // neighbours' outlines when the region has no own edge
  noData: string;
  prov: string; // other kabupaten on the closing map
  bar: string; // non-featured bars in the top-10 chart
  admin: [string, string, string, string, string]; // kecamatan fills, adjacent ones differ
};

export const TEMAS = {
  malam: {
    label: "Malam",
    light: false,
    bg: "#0F1416", ink: "#F1EDE3", muted: "#A3AEAF", line: "#2A3539", sorot: "#F4B740",
    subject: { penduduk: "#F08A5D", lahan: "#7BC47F", air: "#4FB3E8", cahaya: "#B38CF2", wilayah: "#F1EDE3" },
    edge: "#F3ECDD", seam: "rgba(15,20,22,0.55)", border: "rgba(243,236,221,0.55)", borderSoft: "rgba(243,236,221,0.26)",
    borderStrong: "rgba(243,236,221,0.85)", noData: "#2E3442", prov: "#26333A", bar: "#5B6E74",
    admin: ["#22417A", "#2E5A8F", "#3B4F6B", "#1F5C6E", "#4A4A6A"],
  },
  laut: {
    label: "Laut",
    light: false,
    bg: "#0A1A2F", ink: "#EEF2F4", muted: "#9DB0C4", line: "#1D3553", sorot: "#F4B740",
    subject: { penduduk: "#FF9466", lahan: "#7FD39A", air: "#5EC8F2", cahaya: "#C3A0FF", wilayah: "#EEF2F4" },
    edge: "#EEF2F4", seam: "rgba(10,26,47,0.6)", border: "rgba(238,242,244,0.5)", borderSoft: "rgba(238,242,244,0.24)",
    borderStrong: "rgba(238,242,244,0.85)", noData: "#22344D", prov: "#18304D", bar: "#4C6788",
    admin: ["#1E4E79", "#2C6496", "#345A80", "#1B5E6E", "#3D4F7A"],
  },
  kertas: {
    label: "Kertas",
    light: true,
    bg: "#F2ECE0", ink: "#1C2124", muted: "#5E6669", line: "#D8CFBF", sorot: "#B4690E",
    subject: { penduduk: "#C24E22", lahan: "#2F7D3A", air: "#1C6FA8", cahaya: "#6E45BF", wilayah: "#1C2124" },
    edge: "#1C2124", seam: "rgba(242,236,224,0.75)", border: "rgba(28,33,36,0.45)", borderSoft: "rgba(28,33,36,0.22)",
    borderStrong: "rgba(28,33,36,0.7)", noData: "#D9D2C4", prov: "#DDD5C6", bar: "#A9A194",
    admin: ["#C8D6E6", "#D9CFE6", "#CFE4D8", "#EADBC4", "#D3DAE3"],
  },
  putih: {
    label: "Putih",
    light: true,
    bg: "#FFFFFF", ink: "#111417", muted: "#5B6166", line: "#E3E5E8", sorot: "#D9480F",
    subject: { penduduk: "#D9480F", lahan: "#2B8A3E", air: "#1971C2", cahaya: "#7048E8", wilayah: "#111417" },
    edge: "#111417", seam: "rgba(255,255,255,0.8)", border: "rgba(17,20,23,0.4)", borderSoft: "rgba(17,20,23,0.18)",
    borderStrong: "rgba(17,20,23,0.7)", noData: "#E4E6E9", prov: "#E9EBEE", bar: "#B9BEC4",
    admin: ["#DCE6F5", "#E5DDF2", "#DDEFE6", "#F6E7D2", "#E2E6EC"],
  },
} satisfies Record<string, Palette>;

export type Tema = keyof typeof TEMAS;
export const TEMA_IDS = Object.keys(TEMAS) as Tema[];
export const isTema = (t: string | null | undefined): t is Tema => !!t && t in TEMAS;

const CARD_SUBJECT: Record<string, Subject | "sorot"> = {
  wilayah: "wilayah",
  kepadatan: "penduduk",
  kecamatan: "penduduk",
  cahaya: "cahaya",
  nightlights: "cahaya",
  rendah: "air",
  lowland: "air",
  terrain: "lahan",
  relief: "lahan",
  landcover: "lahan",
  angka: "sorot",
  penutup: "sorot",
};

/** The card root's CSS variables for a template in a palette. */
export function temaStyle(template: string, tema: Tema = "malam"): CSSProperties {
  const p: Palette = TEMAS[tema];
  const s = CARD_SUBJECT[template];
  const v: Record<string, string> = {
    "--nm-bg": p.bg, "--nm-ink": p.ink, "--nm-muted": p.muted, "--nm-line": p.line, "--nm-sorot": p.sorot,
    "--nm-theme": s === "sorot" ? p.sorot : s ? p.subject[s] : p.ink,
    "--nm-edge": p.edge, "--nm-seam": p.seam, "--nm-border": p.border, "--nm-border-soft": p.borderSoft,
    "--nm-border-strong": p.borderStrong, "--nm-nodata": p.noData, "--nm-prov": p.prov, "--nm-bar": p.bar,
  };
  p.admin.forEach((c, i) => (v[`--nm-admin-${i}`] = c));
  return v as CSSProperties;
}
