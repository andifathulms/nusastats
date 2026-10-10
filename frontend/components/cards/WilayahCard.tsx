"use client";

import { useEffect, useMemo, useState } from "react";
import { dukcapilApi, formatNumber, regionLabel, titleCase, type DukcapilRankRow } from "@/lib/api";
import { NO_DATA, RAMP, frameOf, labelPoint, lerpHex, neighbourColours, project, projector, type Feature, type Geo } from "./geo";
import { CONTENT_W, CornerTag, Footer, H, PAD, SAFE, SafeZones, W } from "./ShareCard";

/**
 * 1080×1920 kabupaten profile cards drawn from boundaries + Dukcapil data (no
 * Peta raster needed), for the PNG exporter (`npm run card`). Same contract as
 * ShareCard: data-card-ready once fonts and data are in; data-card-error and no
 * figures when a guardrail fails.
 *
 *   /card/wilayah/{kab}    administrative map: kecamatan with their names
 *   /card/kepadatan/{kab}  population density per desa (registered residents
 *                          ÷ BIG area), on fixed log-spaced classes so cards
 *                          of different kabupaten compare
 */

export type WilayahTemplate = "wilayah" | "kepadatan";
export const WILAYAH_TEMPLATES: WilayahTemplate[] = ["wilayah", "kepadatan"];

// Muted sea/sand tones for neighbouring kecamatan: distinct, never a ranking.
const ADMIN_TONES = ["#22417A", "#2E5A8F", "#3B4F6B", "#1F5C6E", "#4A4A6A"];
// Density classes in jiwa/km². Fixed, log-spaced, so 6409 and 3273 read on one scale.
const BREAKS = [10, 50, 250, 1000, 5000];
const CLASS_COLORS = Array.from({ length: BREAKS.length + 1 }, (_, i) => {
  const x = (i / BREAKS.length) * (RAMP.length - 1);
  const j = Math.min(RAMP.length - 2, Math.floor(x));
  return lerpHex(RAMP[j], RAMP[j + 1], x - j);
});
// The map box on the card (px), to size labels in viewBox units.
const MAP_W = CONTENT_W;
const MAP_H = 820;

type Geos = { inner: Geo; outline: Geo; kec: Geo | null };
type KabInfo = { name: string; prov: string; pop: number | null; area: number | null };
type Data = {
  kab: KabInfo;
  districts: DukcapilRankRow[];
  villageTotal: number;
  villages: DukcapilRankRow[]; // kepadatan only
  period: string | null;
};

const compact = (n: number) =>
  n >= 1e6 ? `${(n / 1e6).toLocaleString("id-ID", { maximumFractionDigits: 2 })} juta` : formatNumber(Math.round(n));
const pct1 = (v: number) => `${v.toLocaleString("id-ID", { maximumFractionDigits: v < 10 ? 1 : 0 })}%`;

function bulanTahun(period: string | null): string {
  if (!period) return "";
  const b = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
  return `${b[Number(period.slice(5, 7)) - 1]} ${period.slice(0, 4)}`;
}

async function loadData(template: WilayahTemplate, kode: string): Promise<Data> {
  const prov = kode.slice(0, 2);
  const [pops, areas, districts, villageList, summary, villages] = await Promise.all([
    dukcapilApi.rank({ indicator: "jumlah_penduduk", level: "regency", prov, limit: "200" }),
    dukcapilApi.rank({ indicator: "luas_big", level: "regency", prov, limit: "200" }),
    dukcapilApi.rank({ indicator: "jumlah_penduduk", level: "district", kab: kode, limit: "500" }),
    dukcapilApi.regions({ level: "village", kab: kode }),
    dukcapilApi.summary(),
    template === "kepadatan"
      ? dukcapilApi.rank({ indicator: "pop_density_big", level: "village", kab: kode, limit: "10000" }).then((r) => r.results)
      : Promise.resolve([] as DukcapilRankRow[]),
  ]);
  const row = pops.results.find((r) => r.domain_id === kode);
  if (!row) throw new Error(`kabupaten ${kode} tidak ada di data Dukcapil`);
  return {
    kab: {
      name: regionLabel(titleCase(row.domain_name), row.status),
      prov: titleCase(row.nama_prop ?? ""),
      pop: row.value,
      area: areas.results.find((r) => r.domain_id === kode)?.value ?? null,
    },
    districts: districts.results,
    villageTotal: villageList.length,
    villages,
    period: summary.period ?? null,
  };
}

export function WilayahCard({ template, kode, debug }: { template: WilayahTemplate; kode: string; debug: boolean }) {
  const [data, setData] = useState<Data | null>(null);
  const [geo, setGeo] = useState<Geos | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [fontsReady, setFontsReady] = useState(false);

  useEffect(() => {
    if (kode.length !== 4) {
      setFatal("kartu ini untuk kabupaten/kota (kode 4 digit)");
      return;
    }
    const json = (url: string) => fetch(url).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${url} -> ${r.status}`))));
    loadData(template, kode).then(setData).catch((e) => setFatal(String(e.message ?? e)));
    const districts = `/dukcapil-districts-${kode.slice(0, 2)}.geojson`;
    Promise.all([
      json(template === "kepadatan" ? `/dukcapil-villages-${kode.slice(0, 2)}.geojson` : districts),
      json("/dukcapil-regencies.geojson"),
      template === "kepadatan" ? json(districts) : Promise.resolve(null),
    ])
      .then(([inner, outline, kec]) => setGeo({ inner, outline, kec }))
      .catch((e) => setFatal(String(e.message ?? e)));
    document.fonts.ready.then(() => setFontsReady(true));
  }, [template, kode]);

  const issues = useMemo(() => (data && geo ? problems(template, kode, data, geo) : []), [template, kode, data, geo]);
  const error = fatal ?? (issues.length ? issues.join("; ") : null);
  const ready = !error && !!data && !!geo && fontsReady;

  return (
    <div
      id="card"
      data-card-ready={ready ? "1" : undefined}
      data-card-error={error ?? undefined}
      className="relative overflow-hidden bg-coal-bg font-sans text-coal-text"
      style={{ width: W, height: H }}
    >
      {error ? (
        <div className="p-16 text-[28px] text-coal-text">Kartu tidak dibuat: {error}</div>
      ) : data && geo ? (
        template === "wilayah" ? <AdminBody kode={kode} data={data} geo={geo} /> : <DensityBody kode={kode} data={data} geo={geo} />
      ) : null}
      <CornerTag />
      {debug && <SafeZones />}
    </div>
  );
}

/** Guardrails: no figure is drawn when the inputs don't add up. */
function problems(template: WilayahTemplate, kode: string, data: Data, geo: Geos): string[] {
  const out: string[] = [];
  const inner = geo.inner.features.filter((f) => f.properties.domain_id.startsWith(kode));
  if (!inner.length) out.push(`tidak ada batas ${template === "kepadatan" ? "desa" : "kecamatan"} untuk ${kode}`);
  if (!geo.outline.features.some((f) => f.properties.domain_id === kode)) out.push(`tidak ada batas kabupaten ${kode}`);
  if (!data.districts.length) out.push("tidak ada data kecamatan");
  if (template === "kepadatan") {
    if (data.villages.some((v) => v.value < 0)) out.push("kepadatan negatif");
    const withValue = data.villages.length;
    // More than a quarter of desa without a value would make the map mostly grey.
    if (withValue < data.villageTotal * 0.75) out.push(`hanya ${withValue} dari ${data.villageTotal} desa punya nilai`);
  }
  return out;
}

function Column({ children }: { children: React.ReactNode }) {
  const top = SAFE.top + 100;
  return (
    <div className="absolute flex flex-col" style={{ left: PAD, top, width: CONTENT_W, height: H - SAFE.bottom - top }}>
      {children}
    </div>
  );
}

function Title({ eyebrow, kab }: { eyebrow: string; kab: KabInfo }) {
  const size = kab.name.length > 26 ? 60 : kab.name.length > 18 ? 72 : 84;
  return (
    <>
      <div className="font-mono text-[24px] uppercase tracking-[0.14em] text-ink-gold">{eyebrow}</div>
      <h1 className="mt-3 font-display font-medium leading-[1.02] tracking-[-0.02em]" style={{ fontSize: size }}>
        {kab.name}
      </h1>
      <div className="mt-2 text-[34px] text-coal-muted">{kab.prov}</div>
    </>
  );
}

function Fact({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <div className="whitespace-nowrap text-[48px] font-extrabold leading-none tracking-[-0.02em] tabular-nums">{value}</div>
      <div className="mt-2 text-[22px] text-coal-muted">{label}</div>
    </div>
  );
}

type Label = { id: string; name: string; x: number; y: number; size: number; n?: number };

function AdminBody({ kode, data, geo }: { kode: string; data: Data; geo: Geos }) {
  const { paths, edge, labels, numbered, vw, vh } = useMemo(() => {
    const feats = geo.inner.features.filter((f) => f.properties.domain_id.startsWith(kode));
    const own = geo.outline.features.filter((f) => f.properties.domain_id === kode);
    const frame = frameOf(own.length ? own : feats);
    const { paths, vw, vh } = project(feats, frame);
    const to = projector(frame);
    // viewBox units per card pixel, so labels come out at a readable px size.
    const k = 1 / Math.min(MAP_W / vw, MAP_H / vh);
    const names = new Map(data.districts.map((d) => [d.domain_id, titleCase(d.domain_name)]));
    const placed: { x0: number; x1: number; y0: number; y1: number }[] = [];
    const labels: Label[] = [];
    const numbered: Label[] = [];
    const spots = feats
      .map((f: Feature) => ({ f, ...labelPoint(f, to) }))
      .sort((a, b) => b.room - a.room);
    for (const s of spots) {
      const id = s.f.properties.domain_id;
      const name = names.get(id) ?? titleCase(s.f.properties.name ?? id);
      const size = Math.max(20, Math.min(30, (s.room / k) * 0.55)) * k;
      const w = name.length * size * 0.56;
      const box = { x0: s.x - w / 2, x1: s.x + w / 2, y0: s.y - size * 0.7, y1: s.y + size * 0.5 };
      const clear = !placed.some((p) => box.x0 < p.x1 && box.x1 > p.x0 && box.y0 < p.y1 && box.y1 > p.y0);
      const inside = box.x0 > 0 && box.x1 < vw && box.y0 > 0 && box.y1 < vh;
      if (s.room / k >= 14 && clear && inside) {
        placed.push(box);
        labels.push({ id, name, x: s.x, y: s.y, size });
      } else numbered.push({ id, name, x: s.x, y: s.y, size: 18 * k });
    }
    numbered.sort((a, b) => a.name.localeCompare(b.name, "id"));
    numbered.forEach((l, i) => (l.n = i + 1));
    const edge = own.length ? project(own, frame).paths : [];
    return { paths, edge, labels, numbered, vw, vh };
  }, [geo, kode, data.districts]);
  const tones = useMemo(
    () => neighbourColours(geo.inner.features.filter((f) => f.properties.domain_id.startsWith(kode)), ADMIN_TONES.length),
    [geo, kode]
  );
  const k = 1 / Math.min(MAP_W / vw, MAP_H / vh);

  return (
    <Column>
      <Title eyebrow="Peta wilayah administrasi" kab={data.kab} />
      <div className="mt-6 flex min-h-0 flex-1 items-center justify-center">
        <svg viewBox={`0 0 ${vw.toFixed(0)} ${vh.toFixed(0)}`} preserveAspectRatio="xMidYMid meet" className="h-full w-full">
          {paths.map((p) => (
            <path key={p.id} d={p.d} fill={ADMIN_TONES[tones.get(p.id) ?? 0]} stroke="rgba(243,236,221,0.55)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          ))}
          {edge.map((p) => (
            <path key={`e-${p.id}`} d={p.d} fill="none" stroke="#F3ECDD" strokeWidth={2.6} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          ))}
          {labels.map((l) => (
            <text
              key={l.id}
              x={l.x}
              y={l.y}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={l.size}
              fontWeight={600}
              fill="#F3ECDD"
              stroke="#0B1A33"
              strokeWidth={l.size * 0.18}
              paintOrder="stroke"
              style={{ fontFamily: "inherit" }}
            >
              {l.name}
            </text>
          ))}
          {numbered.map((l) => (
            <g key={l.id}>
              <circle cx={l.x} cy={l.y} r={14 * k} fill="#F3ECDD" />
              <text x={l.x} y={l.y} textAnchor="middle" dominantBaseline="central" fontSize={16 * k} fontWeight={700} fill="#0B1A33">
                {l.n}
              </text>
            </g>
          ))}
        </svg>
      </div>
      {numbered.length > 0 && (
        <ol className="mt-4 shrink-0 columns-3 gap-6 text-[19px] leading-snug text-coal-muted">
          {numbered.map((l) => (
            <li key={l.id} className="break-inside-avoid">
              <span className="font-mono text-ink-gold">{l.n}</span> {l.name}
            </li>
          ))}
        </ol>
      )}
      <div className="mt-6 grid shrink-0 grid-cols-4 gap-4">
        <Fact value={formatNumber(data.districts.length)} label="kecamatan" />
        <Fact value={formatNumber(data.villageTotal)} label="desa/kelurahan" />
        <Fact value={data.kab.pop !== null ? compact(data.kab.pop) : "–"} label="penduduk" />
        <Fact value={data.kab.area !== null ? `${formatNumber(Math.round(data.kab.area))}` : "–"} label="km² luas" />
      </div>
      <Footer source={`Ditjen Dukcapil Kemendagri, data ${bulanTahun(data.period)} (penduduk terdaftar); luas dan batas: BIG 1:10.000`} />
    </Column>
  );
}

function DensityBody({ kode, data, geo }: { kode: string; data: Data; geo: Geos }) {
  const byId = useMemo(() => new Map(data.villages.map((v) => [v.domain_id, v])), [data.villages]);
  const { paths, kec, edge, vw, vh } = useMemo(() => {
    const feats = geo.inner.features.filter((f) => f.properties.domain_id.startsWith(kode));
    const own = geo.outline.features.filter((f) => f.properties.domain_id === kode);
    const frame = frameOf(own.length ? own : feats);
    const kecFeats = geo.kec?.features.filter((f) => f.properties.domain_id.startsWith(kode)) ?? [];
    return {
      ...project(feats, frame),
      kec: project(kecFeats, frame).paths,
      edge: own.length ? project(own, frame).paths : [],
    };
  }, [geo, kode]);

  const cls = (v: number) => BREAKS.findIndex((b) => v < b) === -1 ? BREAKS.length : BREAKS.findIndex((b) => v < b);
  // "Half the residents live in X% of the area": desa sorted densest first,
  // summed until they hold half the population. Inputs: Dukcapil population and
  // BIG area per desa (the components of pop_density_big).
  const facts = useMemo(() => {
    const rows = data.villages
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
    const top = rows.reduce((m, r) => (r.v.value > m.v.value ? r : m), rows[0]);
    return { pop, halfAreaPct: area ? (a / area) * 100 : 0, top };
  }, [data.villages]);
  const missing = data.villageTotal - data.villages.length;
  const ranges = ["< 10", "10–50", "50–250", "250–1.000", "1.000–5.000", "≥ 5.000"];

  return (
    <Column>
      <Title eyebrow="Kepadatan penduduk per desa" kab={data.kab} />
      <div className="mt-6 flex min-h-0 flex-1 items-center justify-center">
        <svg viewBox={`0 0 ${vw.toFixed(0)} ${vh.toFixed(0)}`} preserveAspectRatio="xMidYMid meet" className="h-full w-full">
          {paths.map((p) => {
            const v = byId.get(p.id);
            return <path key={p.id} d={p.d} fill={v ? CLASS_COLORS[cls(v.value)] : NO_DATA} stroke="rgba(11,26,51,0.5)" strokeWidth={0.4} vectorEffect="non-scaling-stroke" />;
          })}
          {kec.map((p) => (
            <path key={`k-${p.id}`} d={p.d} fill="none" stroke="rgba(243,236,221,0.3)" strokeWidth={0.8} vectorEffect="non-scaling-stroke" />
          ))}
          {edge.map((p) => (
            <path key={`e-${p.id}`} d={p.d} fill="none" stroke="#F3ECDD" strokeWidth={2.6} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          ))}
        </svg>
      </div>
      <div className="mt-4 shrink-0">
        <div className="flex gap-1">
          {CLASS_COLORS.map((c, i) => (
            <div key={c} className="flex-1">
              <div className="h-4 rounded-sm" style={{ background: c }} />
              <div className="mt-1 text-center font-mono text-[16px] text-coal-muted">{ranges[i]}</div>
            </div>
          ))}
        </div>
        <div className="mt-1 text-right font-mono text-[16px] text-coal-muted">jiwa/km²{missing > 0 ? ` · abu-abu: ${missing} desa tanpa data` : ""}</div>
        <p className="mt-6 text-[34px] font-semibold leading-tight">
          Separuh penduduk tinggal di <span className="text-ink-gold">{pct1(facts.halfAreaPct)}</span> wilayahnya.
        </p>
        <div className="mt-6 grid grid-cols-2 gap-6">
          <Fact value={compact(facts.pop)} label="penduduk di peta ini" />
          <Fact value={`${formatNumber(Math.round(facts.top.v.value))}/km²`} label={`terpadat: ${titleCase(facts.top.v.domain_name)}`} />
        </div>
        <Footer
          source={`Penduduk: Ditjen Dukcapil Kemendagri, data ${bulanTahun(data.period)} (penduduk terdaftar, bukan sensus); luas desa: BIG 1:10.000, dihitung NusaStats`}
        />
      </div>
    </Column>
  );
}
