import { formatNumber, titleCase } from "@/lib/api";
import { loadPeta } from "@/lib/peta";
import {
  compact, densityFacts, kecFacts, landcoverTop3, lightsYears, litFacts, lowFacts, metres, pct1, pctInt, peak, reliefTop2, shortName,
} from "./facts";
import { problems as shareProblems } from "./ShareCard";
import { bulanTahun, loadData, loadGeo, problems as wilayahProblems } from "./WilayahCard";
import { joinDesa, load as loadProfil, problems as profilProblems } from "./ProfilCards";

/**
 * A ready-to-paste TikTok title and description for a kabupaten profile
 * carousel: one line per slide that renders, each quoting the facts the slide
 * shows (facts.ts, the same functions the cards call), and each slide's
 * guardrails run first, so a slide that won't render gets no line.
 */

export const PROFIL = ["kepadatan", "wilayah", "terrain", "relief", "lowland", "rendah", "landcover", "nightlights", "cahaya", "kecamatan", "penutup"];
export const TITLE_MAX = 90;
export const DESC_MAX = 2200;

export type ProfilCaption = { title: string; description: string; slides: string[]; skipped: string[] };

const tag = (s: string) => "#" + s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

function fit(...candidates: string[]): string {
  return candidates.find((c) => c.length <= TITLE_MAX) ?? candidates[candidates.length - 1].slice(0, TITLE_MAX - 1).trimEnd() + "…";
}

/** `only`: the slides actually in the export (e.g. the ZIP), in posting order. */
export async function profilCaption(kode: string, indicator: string, only?: string[]): Promise<ProfilCaption> {
  const [wil, geoKep, geoKec, peta, desaLoad, kecLoad] = await Promise.all([
    loadData("kepadatan", kode),
    loadGeo("kepadatan", kode),
    loadGeo("wilayah", kode),
    loadPeta(kode),
    loadProfil("rendah", kode, indicator),
    loadProfil("kecamatan", kode, indicator),
  ]);
  const name = wil.kab.name;
  const short = shortName(name);
  const period = bulanTahun(wil.period);
  const t = peta?.terrain;
  const lines: Record<string, string> = {};
  const skipped: string[] = [];
  let hook: string | null = null;

  const check = (id: string, issues: string[]) => {
    if (issues.length) skipped.push(`${id}: ${issues.join("; ")}`);
    return !issues.length && (!only || only.includes(id));
  };

  if (check("kepadatan", wilayahProblems("kepadatan", kode, wil, geoKep))) {
    const f = densityFacts(wil.villages, wil.districts);
    hook = `Separuh warga ${short} tinggal di ${pct1(f.halfAreaPct)} wilayahnya`;
    lines.kepadatan = `Kepadatan per desa. Kecamatan terpadat: ${f.top.name}, ${formatNumber(Math.round(f.top.density))} jiwa/km².`;
  }
  if (check("wilayah", wilayahProblems("wilayah", kode, wil, geoKec))) {
    const parts = [`${formatNumber(wil.districts.length)} kecamatan`, `${formatNumber(wil.villageTotal)} desa/kelurahan`];
    if (wil.kab.pop !== null) parts.push(`${compact(wil.kab.pop)} penduduk terdaftar`);
    if (wil.kab.area !== null) parts.push(`${formatNumber(Math.round(wil.kab.area))} km²`);
    lines.wilayah = `${name}: ${parts.join(", ")}.`;
  }
  if (t && check("terrain", shareProblems(peta, "terrain"))) {
    const high = t.metrics_pct.share_elev_ge_1000;
    lines.terrain =
      `Medan ${t.terrain_class_label.toLowerCase()} (klasifikasi NusaStats): rata-rata ${metres(t.elevation_m.mean)}, ` +
      `titik tertinggi sekitar ${peak(t.highest_point.elevation_m)}` +
      (high > 0 ? `, ${pctInt(high)} wilayah di atas 1.000 m.` : ".");
  }
  if (t?.local_relief && check("relief", shareProblems(peta, "relief"))) {
    lines.relief = `Relief lokal: ${reliefTop2(t).map(([l, v]) => `${pctInt(v)} ${l}`).join(", ")}.`;
  }
  if (t?.lowland_pct && check("lowland", shareProblems(peta, "lowland"))) {
    lines.lowland = `${pctInt(t.lowland_pct.lt_10)} wilayah di bawah 10 m, ${pctInt(t.lowland_pct.lt_5)} di bawah 5 m.`;
  }
  if (check("rendah", profilProblems("rendah", kode, desaLoad, indicator))) {
    const f = lowFacts(joinDesa(desaLoad));
    lines.rendah = f.low.length
      ? `${compact(f.lowPop)} penduduk (${pct1(f.lowShare)}) tinggal di ${formatNumber(f.low.length)} desa yang sebagian besar wilayahnya di bawah 10 m.`
      : "Tidak ada desa yang sebagian besar wilayahnya di bawah 10 m.";
  }
  if (peta?.landcover && check("landcover", shareProblems(peta, "landcover"))) {
    const top = landcoverTop3(peta.landcover);
    lines.landcover = `Tutupan lahan ${peta.landcover.year}: ${top.map((c) => `${pctInt(c.share_pct)} ${c.label.toLowerCase()}`).join(", ")}.`;
  }
  if (peta?.nightlights && check("nightlights", shareProblems(peta, "nightlights"))) {
    const nl = peta.nightlights;
    const { base, last, x } = lightsYears(nl);
    const [b, l] = [pctInt(base.lit_pct), pctInt(last.lit_pct)];
    const growth = x !== null ? Math.round(x * 10) / 10 : null;
    lines.nightlights =
      b === l
        ? `Wilayah bercahaya malam: ${l} (${nl.base_year} dan ${nl.latest_year}).`
        : `Wilayah bercahaya malam: ${b} (${nl.base_year}) menjadi ${l} (${nl.latest_year})` +
          (growth !== null && growth !== 1 ? `, luasnya ×${formatNumber(growth)}.` : ".");
  }
  // cahaya joins the same desa table as rendah; its guardrail also needs the night-lights layer.
  if (check("cahaya", profilProblems("cahaya", kode, desaLoad, indicator))) {
    const f = litFacts(joinDesa(desaLoad));
    lines.cahaya =
      `${pct1(f.popShare)} penduduk tinggal di desa yang terang malam hari` +
      (f.contrast ? `, padahal hanya ${pct1(f.areaShare)} wilayahnya bercahaya.` : `; ${pct1(f.areaShare)} wilayahnya bercahaya.`);
  }
  if (check("kecamatan", profilProblems("kecamatan", kode, kecLoad, indicator))) {
    const kec = kecLoad.kec!;
    const { fmt, hi, lo } = kecFacts(kec);
    lines.kecamatan =
      `${kec.indicator.label_id} per kecamatan: tertinggi ${titleCase(hi.domain_name)} (${fmt(hi.value)}), ` +
      `terendah ${titleCase(lo.domain_name)} (${fmt(lo.value)}).`;
  }
  const closing = check("penutup", wilayahProblems("penutup", kode, wil, geoKec));

  const order = PROFIL.filter((id) => lines[id] || (id === "penutup" && closing));
  const slides = order.filter((id) => lines[id]).map((id) => `${order.indexOf(id) + 1}. ${lines[id]}`);
  const has = (...ids: string[]) => ids.some((id) => lines[id]);

  const layers = [
    has("terrain", "relief") && "medan",
    has("lowland", "rendah") && "dataran rendah",
    has("landcover") && "tutupan lahan",
    has("nightlights", "cahaya") && "cahaya malam",
  ].filter(Boolean) as string[];
  const tour = layers.length ? `Geser untuk peta ${layers.length > 1 ? layers.slice(0, -1).join(", ") + " dan " + layers[layers.length - 1] : layers[0]} ${short}.` : "";

  const sources = [
    has("kepadatan", "wilayah", "rendah", "cahaya", "kecamatan") && `penduduk: Ditjen Dukcapil Kemendagri, data ${period} (penduduk terdaftar, bukan sensus)`,
    "batas wilayah: BIG 1:10.000",
    has("terrain", "relief", "lowland", "rendah") && "ketinggian: Copernicus DEM GLO-30",
    has("landcover") && `tutupan lahan: ESA WorldCover ${peta?.landcover?.year} (CC BY 4.0)`,
    has("nightlights", "cahaya") && "cahaya malam: World Bank Light Every Night, VIIRS (CC BY 4.0)",
  ].filter(Boolean) as string[];
  const tags = [tag(short), tag(wil.kab.prov), "#petaindonesia", "#kenalikabupatenmu", "#nusantaramapper", "#datadaerah"];

  const title = hook
    ? fit(`${hook} | Peta ${name}`, hook)
    : fit(`Peta ${name}, ${wil.kab.prov}: medan, penduduk dan cahaya malam`, `Peta ${name}, ${wil.kab.prov}`, `Peta ${name}`);
  const description = [
    [hook ? `${hook}.` : `Kenali ${name}, ${wil.kab.prov}.`, tour].filter(Boolean).join(" "),
    "",
    ...slides,
    "",
    "Kabupaten mana berikutnya? Tulis di komentar.",
    "",
    `Sumber: ${sources.join("; ")}. Diolah oleh Nusantara Mapper.`,
    tags.join(" "),
  ].join("\n");
  return { title, description: description.slice(0, DESC_MAX), slides: order, skipped };
}
