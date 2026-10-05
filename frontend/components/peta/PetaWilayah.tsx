"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChoroplethMap, type MapLayer } from "@/components/ChoroplethMap";
import { Badge, EmptyState, ErrorState, Panel, SectionTitle, Skeleton, SkeletonRows } from "@/components/ui";
import { formatDecimal, formatNumber, petaApi, titleCase, type PetaRegionRanks } from "@/lib/api";
import { loadPeta, petaAsset, type Peta, type PetaLandcover, type PetaNightlights, type PetaTerrain } from "@/lib/peta";
import { routes } from "@/lib/routes";

type Layer = "batas" | "elevasi" | "rendah" | "relief" | "tutupan" | "malam";
export type PetaFact = { label: string; value: string; source: string };

// A real but tiny share must not round to "0,0%", which reads as absent.
const pct = (v: number) => (v > 0 && v < 0.05 ? "<0,1%" : `${formatDecimal(v, 1)}%`);
const metres = (v: number) => `${formatNumber(Math.round(v))} m`;

/**
 * Terrain + land cover map for one area (Kemendagri kode), with stats panel.
 * Kabupaten view draws its kecamatan on top; clicking one opens its profile.
 * Data comes from public/peta/{kode}/ (data/peta_wilayah pipeline); an area
 * that has not been computed shows an explicit empty state, never a guess.
 */
export function PetaWilayah({
  kode,
  level,
  facts = [],
}: {
  kode: string;
  level: "regency" | "district";
  facts?: PetaFact[];
}) {
  const [peta, setPeta] = useState<Peta | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [layer, setLayer] = useState<Layer>("elevasi");
  const [hover, setHover] = useState<string | null>(null);
  // Peer ranks come from the backend `peta` app; without them the panel still
  // shows every figure (the static JSON), just without the rank chips.
  const [ranks, setRanks] = useState<PetaRegionRanks | null>(null);
  const router = useRouter();

  useEffect(() => {
    setRanks(null);
    petaApi.region(kode).then(setRanks).catch(() => setRanks(null));
  }, [kode]);

  useEffect(() => {
    setPeta(undefined);
    setError(null);
    loadPeta(kode).then(setPeta).catch((e) => setError(String(e)));
  }, [kode]);

  if (error) return <ErrorState message={`Gagal memuat peta wilayah: ${error}`} />;
  if (peta === undefined) return <PetaSkeleton />;
  if (peta === null)
    return (
      <EmptyState
        title="Peta medan & tutupan lahan belum dihitung untuk wilayah ini"
        hint="Data elevasi (Copernicus DEM) dan tutupan lahan (ESA WorldCover) dihitung per wilayah. Wilayah ini belum masuk perhitungan."
      />
    );

  const { bounds, terrain, landcover, nightlights, present } = peta;
  const has = (l: Layer) =>
    l === "batas" ||
    (l === "elevasi" ? !!(present.elevation && terrain)
      : l === "rendah" ? !!(present.lowland && terrain?.lowland_pct)
      : l === "relief" ? !!(present.relief && terrain?.local_relief)
      : l === "malam" ? !!(present.nightlights && nightlights)
      : !!(present.landcover && landcover));
  // Stats exist but their image was not generated on this machine.
  const imagesMissing = (!!terrain && !present.elevation) || (!!landcover && !present.landcover);
  const active: Layer = has(layer) ? layer : "batas";
  const mapLayers: MapLayer[] =
    active === "elevasi"
      ? [
          { href: petaAsset(kode, bounds.layers.elevation!) },
          ...(present.hillshade ? [{ href: petaAsset(kode, bounds.layers.hillshade!), blend: "multiply" as const }] : []),
        ]
      : active === "rendah"
        ? [
            ...(present.hillshade ? [{ href: petaAsset(kode, bounds.layers.hillshade!), opacity: 0.55 }] : []),
            { href: petaAsset(kode, bounds.layers.lowland!), pixelated: true },
          ]
        : active === "relief"
          ? [
              { href: petaAsset(kode, bounds.layers.relief!), pixelated: true },
              ...(present.hillshade ? [{ href: petaAsset(kode, bounds.layers.hillshade!), blend: "multiply" as const }] : []),
            ]
          : active === "tutupan"
            ? [{ href: petaAsset(kode, bounds.layers.landcover!), pixelated: true }]
            : active === "malam"
              ? [{ href: petaAsset(kode, bounds.layers.nightlights!), pixelated: true }]
              : [];
  const opts: [Layer, string][] = [
    ["batas", "Batas"],
    ["elevasi", "Elevasi"],
    ["rendah", "Dataran rendah"],
    ["relief", "Relief"],
    ["tutupan", "Tutupan lahan"],
    ["malam", "Cahaya malam"],
  ];

  return (
    <div>
      <SectionTitle hint={level === "regency" ? "klik kecamatan untuk membuka profilnya" : undefined}>Peta wilayah</SectionTitle>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* Sticky on desktop so the map stays in view beside the taller stats column. */}
        <Panel className="min-w-0 lg:sticky lg:top-28 lg:self-start">
          <div
            role="group"
            aria-label="Lapisan peta"
            className="mb-4 inline-flex max-w-full flex-wrap rounded-full border border-ink-border bg-ink-bg2 p-1"
          >
            {opts.map(([v, label]) => (
              <button
                key={v}
                type="button"
                aria-pressed={active === v}
                disabled={!has(v)}
                onClick={() => setLayer(v)}
                className={`rounded-full px-3.5 py-1.5 text-[13.5px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                  active === v ? "bg-ink-panel text-ink-text shadow-tile" : "text-ink-muted hover:text-ink-text"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <ChoroplethMap
            values={new Map()}
            min={0}
            max={1}
            geojsonUrls={[`/dukcapil-districts-${kode.slice(0, 2)}.geojson`]}
            provFilter={[kode]}
            frame={bounds}
            layers={mapLayers}
            outlineOnly
            outlineFill={active === "batas" ? "rgb(var(--ink-panel2))" : "transparent"}
            onSelect={level === "regency" ? (id) => router.push(routes.region(id)) : undefined}
            selectHint={level === "regency" ? "Klik untuk membuka profil kecamatan" : undefined}
            highlight={hover}
            onHover={setHover}
            ariaLabel={`Peta ${opts.find(([v]) => v === active)?.[1].toLowerCase()} wilayah`}
          />

          {imagesMissing && (
            <p className="mt-3 text-xs text-ink-muted">
              Gambar lapisan peta belum dibuat di perangkat ini. Statistik di samping tetap berlaku; jalankan pipeline
              data/peta_wilayah untuk membuat gambarnya.
            </p>
          )}
          <Legend layer={active} terrain={terrain} landcover={landcover} nightlights={nightlights} />
          <Attribution terrain={terrain} landcover={landcover} nightlights={nightlights} />
        </Panel>

        <div className="min-w-0 space-y-6">
          {terrain ? <TerrainPanel t={terrain} ranks={ranks} /> : <Missing what="Statistik medan" />}
          {landcover ? <LandcoverPanel lc={landcover} ranks={ranks} /> : <Missing what="Tutupan lahan" />}
          {nightlights && <NightlightsPanel nl={nightlights} ranks={ranks} />}
          {facts.length > 0 && (
            <Panel>
              <h3 className="text-[11px] font-bold uppercase tracking-[0.08em] text-ink-muted">Indikator lain</h3>
              <dl className="mt-3 space-y-2.5">
                {facts.map((f) => (
                  <div key={f.label} className="flex items-baseline justify-between gap-3 text-sm">
                    <dt className="text-ink-muted">
                      {f.label} <span className="text-xs">· {f.source}</span>
                    </dt>
                    <dd className="whitespace-nowrap font-semibold tabular-nums text-ink-text">{f.value}</dd>
                  </div>
                ))}
              </dl>
            </Panel>
          )}
          {level === "regency" && <KecamatanList kode={kode} hover={hover} onHover={setHover} />}
        </div>
      </div>
    </div>
  );
}

function Legend({
  layer,
  terrain,
  landcover,
  nightlights,
}: {
  layer: Layer;
  terrain: PetaTerrain | null;
  landcover: PetaLandcover | null;
  nightlights: PetaNightlights | null;
}) {
  if (layer === "malam" && nightlights) {
    const m = nightlights.metadata;
    return (
      <div className="mt-4">
        <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-ink-muted">
          Cahaya malam {nightlights.latest_year} (median tahunan)
        </div>
        <div className="mt-2 h-2.5 w-full max-w-sm rounded-full" style={{ background: `linear-gradient(90deg, ${m.colors.join(", ")})` }} />
        <div className="mt-1 flex w-full max-w-sm justify-between font-mono text-[11px] text-ink-muted">
          <span>gelap</span>
          <span>{formatNumber(m.max_radiance_nw)}+ nW/cm²/sr (skala log)</span>
        </div>
      </div>
    );
  }
  if (layer === "elevasi" && terrain) {
    // Show the tint up to the first stop at or above the area's highest point,
    // positioned linearly in metres, so the legend covers what the map shows.
    const stops = terrain.metadata.tint;
    const topIdx = stops.findIndex(([m]) => m >= terrain.elevation_m.max);
    const shown = stops.slice(0, topIdx === -1 ? stops.length : topIdx + 1);
    const top = shown[shown.length - 1][0] || 1;
    const gradient = shown.map(([m, c]) => `${c} ${((m / top) * 100).toFixed(2)}%`).join(", ");
    // Drop tick labels that would collide with the previous one (e.g. 0 and 100 m
    // on a 1.000 m scale); the gradient still carries every stop.
    // First and last always show; a middle one needs 12% of clearance on both sides.
    let lastX = 0;
    const ticks = shown.filter(([m], i) => {
      const x = m / top;
      if (i === 0 || i === shown.length - 1) return true;
      if (x - lastX < 0.12 || 1 - x < 0.12) return false;
      lastX = x;
      return true;
    });
    return (
      <div className="mt-4">
        <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-ink-muted">Elevasi (m dpl)</div>
        <div className="mt-2 h-2.5 w-full max-w-sm rounded-full" style={{ background: `linear-gradient(90deg, ${gradient})` }} />
        <div className="relative mt-1 h-4 w-full max-w-sm font-mono text-[11px] text-ink-muted">
          {ticks.map(([m]) => (
            <span
              key={m}
              className="absolute tabular-nums"
              style={{ left: `${(m / top) * 100}%`, transform: m === 0 ? "none" : m === top ? "translateX(-100%)" : "translateX(-50%)" }}
            >
              {formatNumber(m)}
            </span>
          ))}
        </div>
      </div>
    );
  }
  if (layer === "rendah" && terrain?.metadata.lowland_colors) {
    const [c5, c10] = terrain.metadata.lowland_colors;
    return (
      <div className="mt-4">
        <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-ink-muted">Dataran sangat rendah</div>
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-ink-muted">
          <li className="inline-flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: c5 }} /> di bawah 5 m</li>
          <li className="inline-flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: c10 }} /> 5–10 m</li>
        </ul>
        <p className="mt-1.5 text-xs text-ink-muted">
          Batas bawah: hutan, mangrove dan bangunan terbaca lebih tinggi dari tanahnya, jadi daratan rendah yang sebenarnya bisa lebih luas.
        </p>
      </div>
    );
  }
  if (layer === "relief" && terrain?.metadata.relief_colors && terrain.local_relief) {
    const labels = ["Datar", "Bergelombang", "Berbukit", "Bergunung"];
    const b = terrain.local_relief.breaks_m;
    const ranges = [`< ${b[0]} m`, `${b[0]}–${b[1]} m`, `${b[1]}–${b[2]} m`, `≥ ${b[2]} m`];
    return (
      <div className="mt-4">
        <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-ink-muted">
          Relief lokal (beda tinggi dalam {formatNumber(terrain.local_relief.window_m / 1000)} km)
        </div>
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-ink-muted">
          {labels.map((l, i) => (
            <li key={l} className="inline-flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-sm ring-1 ring-ink-border" style={{ background: terrain.metadata.relief_colors![i] }} />
              {l} <span className="font-mono">{ranges[i]}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  }
  if (layer === "tutupan" && landcover) {
    return (
      <div className="mt-4">
        <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-ink-muted">Tutupan lahan {landcover.year}</div>
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-ink-muted">
          {landcover.classes.map((c) => (
            <li key={c.code} className="inline-flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-sm ring-1 ring-ink-border" style={{ background: c.color }} />
              {c.label}
            </li>
          ))}
        </ul>
      </div>
    );
  }
  return (
    <div className="mt-4 flex items-center gap-2 text-xs text-ink-muted">
      <span className="inline-block h-0.5 w-5 bg-ink-text" /> Batas kecamatan
    </div>
  );
}

function Attribution({
  terrain,
  landcover,
  nightlights,
}: {
  terrain: PetaTerrain | null;
  landcover: PetaLandcover | null;
  nightlights: PetaNightlights | null;
}) {
  return (
    <p className="mt-4 border-t border-ink-border pt-3 text-[11.5px] leading-relaxed text-ink-muted">
      {terrain && <>Elevasi: {terrain.metadata.attribution}. </>}
      {landcover && <>Tutupan lahan: {landcover.metadata.attribution} (CC BY 4.0). </>}
      {nightlights && <>Cahaya malam: {nightlights.metadata.attribution}. </>}
      Batas wilayah indikatif (BIG 1:10.000).
    </p>
  );
}

function Missing({ what }: { what: string }) {
  return (
    <Panel>
      <p className="text-sm text-ink-muted">{what} belum dihitung untuk wilayah ini.</p>
    </Panel>
  );
}

function Rows({ rows }: { rows: [string, number][] }) {
  return (
    <div className="space-y-2">
      {rows.map(([label, v]) => (
        <div key={label} className="grid grid-cols-[minmax(0,1fr)_96px_56px] items-center gap-3 text-sm">
          <span className="truncate text-ink-muted">{label}</span>
          <span className="h-1.5 overflow-hidden rounded-full bg-ink-panel2">
            <span className="block h-full rounded-full bg-ink-accent" style={{ width: `${Math.min(100, v)}%` }} />
          </span>
          <span className="text-right tabular-nums text-ink-text">{pct(v)}</span>
        </div>
      ))}
    </div>
  );
}

const BAND_LABEL: Record<string, string> = {
  "<100": "< 100 m",
  "100-500": "100–500 m",
  "500-1000": "500–1.000 m",
  "1000-2000": "1.000–2.000 m",
  ">=2000": "≥ 2.000 m",
};
const SLOPE_LABEL: Record<string, string> = { "<8": "Landai (< 8°)", "8-25": "Miring (8–25°)", ">=25": "Curam (≥ 25°)" };

type Ranks = PetaRegionRanks | null;

function rankOf(ranks: Ranks, key: string) {
  const r = ranks?.indicators.find((i) => i.key === key);
  return r && r.rank && r.of > 1 ? r : null;
}

function RankChip({ ranks, k }: { ranks: Ranks; k: string }) {
  const r = rankOf(ranks, k);
  if (!r) return null;
  return <span className="font-mono text-[11px] text-ink-muted">#{r.rank} dari {r.of}</span>;
}

function TerrainPanel({ t, ranks }: { t: PetaTerrain; ranks: Ranks }) {
  const stats: [string, string, string][] = [
    ["Rata-rata elevasi", metres(t.elevation_m.mean), "elevation_mean"],
    ["Titik tertinggi", metres(t.highest_point.elevation_m), "elevation_max"],
    ["Relief (p95 − p5)", metres(t.relief_m), "relief"],
    ["Lereng rata-rata", `${formatDecimal(t.slope_deg.mean, 1)}°`, "slope_mean"],
  ];
  return (
    <Panel>
      <h3 className="text-[11px] font-bold uppercase tracking-[0.08em] text-ink-muted">Medan</h3>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className="font-display text-2xl font-medium leading-tight text-ink-text">{t.terrain_class_label}</span>
        <Badge>klasifikasi NusaStats</Badge>
      </div>
      <p className="mt-1.5 text-sm text-ink-muted">{t.terrain_class_reason}</p>
      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3">
        {stats.map(([k, v, key]) => (
          <div key={k}>
            <dt className="text-xs text-ink-muted">{k}</dt>
            <dd className="whitespace-nowrap text-lg font-extrabold tabular-nums tracking-[-0.01em] text-ink-text">{v}</dd>
            <dd><RankChip ranks={ranks} k={key} /></dd>
          </div>
        ))}
      </dl>
      {ranks && ranks.indicators.some((i) => i.rank && i.of > 1) && (
        <p className="mt-2 text-xs text-ink-muted">Peringkat dari tertinggi, terhadap {ranks.peer_scope}.</p>
      )}
      <div className="mt-5 text-xs font-semibold text-ink-muted">Luas menurut elevasi</div>
      <div className="mt-2">
        <Rows rows={Object.entries(t.elevation_bands_pct).map(([k, v]) => [BAND_LABEL[k] ?? k, v])} />
      </div>
      <div className="mt-5 text-xs font-semibold text-ink-muted">Luas menurut kemiringan</div>
      <div className="mt-2">
        <Rows rows={Object.entries(t.slope_classes_pct).map(([k, v]) => [SLOPE_LABEL[k] ?? k, v])} />
      </div>
      {t.local_relief && (
        <>
          <div className="mt-5 text-xs font-semibold text-ink-muted">
            Relief lokal: rata-rata {metres(t.local_relief.mean_m)} beda tinggi per {formatNumber(t.local_relief.window_m / 1000)} km
          </div>
          <div className="mt-2">
            <Rows
              rows={[
                ["Datar", t.local_relief.classes_pct.datar],
                ["Bergelombang", t.local_relief.classes_pct.bergelombang],
                ["Berbukit", t.local_relief.classes_pct.berbukit],
                ["Bergunung", t.local_relief.classes_pct.bergunung],
              ]}
            />
          </div>
        </>
      )}
      {/* Nothing under 10 m (inland, mountainous): the "setidaknya" line would only say 0%. */}
      {t.lowland_pct && t.lowland_pct.lt_10 > 0 && (
        <p className="mt-5 text-sm text-ink-text">
          Setidaknya <span className="font-semibold tabular-nums">{pct(t.lowland_pct.lt_10)}</span> luas wilayah berada di bawah 10 m
          {t.lowland_pct.lt_5 > 0 && <> ({pct(t.lowland_pct.lt_5)} di bawah 5 m)</>}.
          <span className="mt-1 block text-xs text-ink-muted">
            Batas bawah: model permukaan mengukur puncak pohon dan atap, bukan tanah.
          </span>
        </p>
      )}
      <p className="mt-4 text-xs leading-relaxed text-ink-muted">
        {t.classification.note} Elevasi dari model permukaan ({t.metadata.dataset}), termasuk tajuk pohon dan bangunan.
      </p>
    </Panel>
  );
}

const LC_RANKED: [string, string][] = [
  ["lc_tree", "Tutupan pohon"],
  ["lc_cropland", "Lahan pertanian"],
  ["lc_builtup", "Lahan terbangun"],
];

function LandcoverPanel({ lc, ranks }: { lc: PetaLandcover; ranks: Ranks }) {
  const ranked = LC_RANKED.map(([k, label]) => [label, rankOf(ranks, k)] as const).filter(([, r]) => r);
  return (
    <Panel>
      <h3 className="text-[11px] font-bold uppercase tracking-[0.08em] text-ink-muted">Tutupan lahan {lc.year}</h3>
      <div className="mt-3 flex h-3 w-full overflow-hidden rounded-full bg-ink-panel2" role="img" aria-label="Komposisi tutupan lahan">
        {lc.classes.map((c) => (
          <span key={c.code} className="h-full" style={{ width: `${c.share_pct}%`, background: c.color }} title={`${c.label} ${pct(c.share_pct)}`} />
        ))}
      </div>
      <ul className="mt-4 space-y-2">
        {lc.classes.map((c) => (
          <li key={c.code} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 text-sm">
            <span className="inline-flex min-w-0 items-center gap-2 text-ink-muted">
              <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm ring-1 ring-ink-border" style={{ background: c.color }} />
              <span className="truncate">{c.label}</span>
            </span>
            <span className="whitespace-nowrap text-right text-xs tabular-nums text-ink-muted">{formatNumber(Math.round(c.area_km2))} km²</span>
            <span className="w-14 text-right tabular-nums text-ink-text">{pct(c.share_pct)}</span>
          </li>
        ))}
      </ul>
      {ranked.length > 0 && (
        <p className="mt-3 text-xs text-ink-muted">
          Peringkat porsi luas terhadap {ranks!.peer_scope}:{" "}
          {ranked.map(([label, r], i) => (
            <span key={label}>
              {i > 0 && " · "}
              {label} <span className="font-mono">#{r!.rank}</span>
            </span>
          ))}
          {ranked[0][1] && <> dari {ranked[0][1]!.of}</>}.
        </p>
      )}
      <p className="mt-4 text-xs leading-relaxed text-ink-muted">
        &ldquo;Tutupan pohon&rdquo; mencakup hutan dan perkebunan (sawit, akasia); citra satelit tidak membedakannya. Data {lc.year},
        bukan kondisi terkini.
      </p>
    </Panel>
  );
}

function NightlightsPanel({ nl, ranks }: { nl: PetaNightlights; ranks: Ranks }) {
  const years = Object.keys(nl.years).sort();
  const maxPct = Math.max(...years.map((y) => nl.years[y].lit_pct), 0.1);
  const base = nl.years[String(nl.base_year)];
  const last = nl.years[String(nl.latest_year)];
  const x = nl.growth.lit_km2_x;
  return (
    <Panel>
      <h3 className="text-[11px] font-bold uppercase tracking-[0.08em] text-ink-muted">Cahaya malam</h3>
      <p className="mt-2 text-sm text-ink-text">
        <span className="font-semibold tabular-nums">{pct(last.lit_pct)}</span> luas wilayah bercahaya pada {nl.latest_year}
        {base && (
          <>
            {" "}(dari {pct(base.lit_pct)} pada {nl.base_year}
            {x && x !== 1 ? <>, luas bercahaya ×{formatDecimal(x, 1)}</> : null})
          </>
        )}
        .
      </p>
      <div className="mt-4 flex h-24 items-end gap-1.5" role="img" aria-label="Luas bercahaya per tahun">
        {years.map((y) => (
          <div key={y} className="flex min-w-0 flex-1 flex-col items-center gap-1">
            <div
              className="w-full rounded-t-[3px] bg-ink-accent2"
              style={{ height: `${Math.max(2, (nl.years[y].lit_pct / maxPct) * 72)}px` }}
              title={`${y}: ${pct(nl.years[y].lit_pct)}`}
            />
            <span className="font-mono text-[10px] text-ink-muted">{y.slice(2)}</span>
          </div>
        ))}
      </div>
      <RankChip ranks={ranks} k="ntl_lit_pct" />
      {nl.years_skipped && Object.keys(nl.years_skipped).length > 0 && (
        <p className="mt-3 text-xs text-ink-muted">
          Tidak dihitung: {Object.keys(nl.years_skipped).sort().join(", ")} (terlalu sedikit malam tanpa awan di sebagian wilayah).
        </p>
      )}
      <p className="mt-3 text-xs leading-relaxed text-ink-muted">
        Bercahaya = median tahunan ≥ {formatNumber(nl.lit_threshold_nw)} nW/cm²/sr (VIIRS, ~460 m). {nl.metadata.note}
      </p>
    </Panel>
  );
}

type Kec = { code: string; name: string; cls: string | null };

function KecamatanList({ kode, hover, onHover }: { kode: string; hover: string | null; onHover: (id: string | null) => void }) {
  const [rows, setRows] = useState<Kec[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/dukcapil-districts-${kode.slice(0, 2)}.geojson`)
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      })
      .then(async (fc: { features: { properties: { domain_id: string; name: string } }[] }) => {
        const kec = fc.features
          .map((f) => f.properties)
          .filter((p) => p.domain_id.startsWith(kode))
          .sort((a, b) => a.name.localeCompare(b.name, "id"));
        const classes = await Promise.all(
          kec.map((p) =>
            fetch(petaAsset(p.domain_id, "terrain.json"))
              .then((r) => (r.ok ? r.json() : null))
              .then((t: PetaTerrain | null) => t?.terrain_class_label ?? null)
              .catch(() => null)
          )
        );
        if (!cancelled) setRows(kec.map((p, i) => ({ code: p.domain_id, name: titleCase(p.name), cls: classes[i] })));
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [kode]);

  const body = useMemo(() => {
    if (failed) return <p className="text-sm text-ink-muted">Gagal memuat daftar kecamatan.</p>;
    if (!rows) return <SkeletonRows rows={4} />;
    return (
      <ul className="-mx-2">
        {rows.map((k) => (
          <li key={k.code}>
            <Link
              href={routes.region(k.code)}
              onMouseEnter={() => onHover(k.code)}
              onMouseLeave={() => onHover(null)}
              onFocus={() => onHover(k.code)}
              onBlur={() => onHover(null)}
              className={`flex items-center justify-between gap-3 rounded-xl px-2 py-1.5 text-sm transition-colors ${
                hover === k.code ? "bg-ink-accent/[0.07]" : ""
              }`}
            >
              <span className="truncate font-medium text-ink-accent">{k.name}</span>
              <span className="whitespace-nowrap text-xs text-ink-muted">{k.cls ?? "belum dihitung"}</span>
            </Link>
          </li>
        ))}
      </ul>
    );
  }, [rows, failed, hover, onHover]);

  return (
    <Panel>
      <h3 className="mb-2 text-[11px] font-bold uppercase tracking-[0.08em] text-ink-muted">Kecamatan</h3>
      {body}
    </Panel>
  );
}

function PetaSkeleton() {
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <Panel>
        <Skeleton className="h-9 w-72 rounded-full" />
        <Skeleton className="mt-4 h-[420px] w-full rounded-[20px]" />
      </Panel>
      <Panel>
        <Skeleton className="h-3 w-24" />
        <Skeleton className="mt-3 h-7 w-40" />
        <SkeletonRows rows={6} className="mt-4" />
      </Panel>
    </div>
  );
}
