// Nusantara Mapper card brand ("Atlas Malam"): one theme colour per kind of
// subject, so each slide of a carousel looks different while the layout stays
// the same. Applied as --nm-theme on the card root (see globals.css .nm-card).
import type { CSSProperties } from "react";

export const NM = {
  bg: "#0F1416",
  ink: "#F1EDE3",
  sorot: "#F4B740", // the one thing to look at: rank chip, hook number
  penduduk: "#F08A5D",
  lahan: "#7BC47F",
  air: "#4FB3E8",
  cahaya: "#B38CF2",
  wilayah: "#F1EDE3",
};

export const CARD_THEME: Record<string, string> = {
  wilayah: NM.wilayah,
  kepadatan: NM.penduduk,
  kecamatan: NM.penduduk,
  cahaya: NM.cahaya,
  nightlights: NM.cahaya,
  rendah: NM.air,
  lowland: NM.air,
  terrain: NM.lahan,
  relief: NM.lahan,
  landcover: NM.lahan,
  angka: NM.sorot,
  penutup: NM.sorot,
};

export const themeVar = (template: string): CSSProperties => ({ ["--nm-theme" as string]: CARD_THEME[template] ?? NM.ink });
