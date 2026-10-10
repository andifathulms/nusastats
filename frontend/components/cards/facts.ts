import { formatNumber, titleCase, type DukcapilRank, type DukcapilRankRow } from "@/lib/api";
import { litGrowth, type PetaLandcover, type PetaNightlights, type PetaTerrain } from "@/lib/peta";

/**
 * The numbers the kabupaten profile cards state, as pure functions over the
 * loaded inputs. The cards draw them and the TikTok caption (caption.ts) quotes
 * them, so the two can never disagree.
 */

export const MAJORITY = 50; // a desa is "mostly" lit / under 10 m at this share of its area

export const compact = (n: number) =>
  n >= 1e6 ? `${(n / 1e6).toLocaleString("id-ID", { maximumFractionDigits: 2 })} juta` : formatNumber(Math.round(n));
export const pct1 = (v: number) => `${v.toLocaleString("id-ID", { maximumFractionDigits: v < 10 ? 1 : 0 })}%`;
export const pctInt = (v: number) => (v > 0 && v < 1 ? "<1%" : `${formatNumber(Math.round(v))}%`);
export const metres = (v: number) => `${formatNumber(Math.round(v))} m`;
// Peak heights are model pixels (30 m, surface model): round to 10 m, never quote to the metre.
export const peak = (v: number) => `${formatNumber(Math.round(v / 10) * 10)} m`;

export function shortName(name: string): string {
  return name.replace(/^(Kab\. Adm\.|Kota Adm\.|Kab\.|Kota)\s+/, "");
}

/** "Half the residents live in X% of the area": desa sorted densest first,
 * summed until they hold half the population (Dukcapil population and BIG area
 * per desa, the components of pop_density_big). Plus the densest kecamatan, from
 * its desa summed, so one odd BIG desa polygon (Makassar's Manggala: 29.163
 * residents on 0,32 km²) can't become the headline. */
export function densityFacts(villages: DukcapilRankRow[], districts: DukcapilRankRow[]) {
  const rows = villages
    .map((v) => ({
      v,
      pop: v.components?.find((c) => c.field === "jumlah_penduduk")?.value ?? 0,
      area: v.components?.find((c) => c.field === "luas_big")?.value ?? 0,
    }))
    .filter((r) => r.area > 0);
  const pop = rows.reduce((a, r) => a + r.pop, 0);
  const area = rows.reduce((a, r) => a + r.area, 0);
  let p = 0;
  let a = 0;
  for (const r of [...rows].sort((x, y) => y.v.value - x.v.value)) {
    p += r.pop;
    a += r.area;
    if (p >= pop / 2) break;
  }
  const byKec = new Map<string, { pop: number; area: number }>();
  for (const r of rows) {
    const k = byKec.get(r.v.domain_id.slice(0, 6)) ?? { pop: 0, area: 0 };
    byKec.set(r.v.domain_id.slice(0, 6), { pop: k.pop + r.pop, area: k.area + r.area });
  }
  const names = new Map(districts.map((d) => [d.domain_id, titleCase(d.domain_name)]));
  const [kecId, kec] = [...byKec.entries()].reduce((m, e) => (e[1].pop / e[1].area > m[1].pop / m[1].area ? e : m));
  return { pop, halfAreaPct: area ? (a / area) * 100 : 0, top: { name: names.get(kecId) ?? kecId, density: kec.pop / kec.area } };
}

/** The two most common local-relief classes, largest first. */
export function reliefTop2(t: PetaTerrain): [string, number][] {
  const c = t.local_relief!.classes_pct;
  return ([["datar", c.datar], ["bergelombang", c.bergelombang], ["berbukit", c.berbukit], ["bergunung", c.bergunung]] as [string, number][])
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2);
}

export function lightsYears(nl: PetaNightlights) {
  return { base: nl.years[String(nl.base_year)], last: nl.years[String(nl.latest_year)], x: litGrowth(nl) };
}

export const landcoverTop3 = (lc: PetaLandcover) => lc.classes.slice(0, 3);

type DesaRow = { id: string; name: string; pop: number; area_km2: number; lit_pct: number | null; lt_10_pct: number | null };

/** Residents of desa where most of the area is lit at night (lit share >= 50%),
 * against the share of the whole kabupaten that is lit (area-weighted). */
export function litFacts(rows: DesaRow[]) {
  const pop = rows.reduce((a, r) => a + r.pop, 0);
  const litPop = rows.filter((r) => (r.lit_pct ?? 0) >= MAJORITY).reduce((a, r) => a + r.pop, 0);
  const area = rows.reduce((a, r) => a + r.area_km2, 0);
  const litArea = rows.reduce((a, r) => a + (r.area_km2 * (r.lit_pct ?? 0)) / 100, 0);
  const darkDesa = rows.filter((r) => (r.lit_pct ?? 0) < MAJORITY).length;
  const popShare = (litPop / pop) * 100;
  const areaShare = (litArea / area) * 100;
  // "padahal hanya" only when people are clearly more concentrated than light.
  return { litPop, darkDesa, popShare, areaShare, contrast: popShare - areaShare >= 20 };
}

/** Desa where most of the area is under 10 m, and the residents living in them. */
export function lowFacts(rows: DesaRow[]) {
  const low = rows.filter((r) => (r.lt_10_pct ?? 0) >= MAJORITY);
  const pop = rows.reduce((a, r) => a + r.pop, 0);
  const lowPop = low.reduce((a, r) => a + r.pop, 0);
  return { low, lowPop, lowShare: (lowPop / pop) * 100, top: [...low].sort((a, b) => b.pop - a.pop).slice(0, 4) };
}

/** A Dukcapil ratio per kecamatan: its formatter and the highest/lowest kecamatan. */
export function kecFacts(kec: DukcapilRank) {
  const unit = kec.unit ? ` ${kec.unit}` : "";
  const fmt = (v: number) => `${v.toLocaleString("id-ID", { maximumFractionDigits: 1 })}${unit === " %" ? "%" : unit}`;
  const sorted = [...kec.results].sort((a, b) => b.value - a.value);
  return { fmt, hi: sorted[0], lo: sorted[sorted.length - 1] };
}
