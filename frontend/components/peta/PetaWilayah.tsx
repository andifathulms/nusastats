"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChoroplethMap, type MapLayer } from "@/components/ChoroplethMap";
import { Badge, EmptyState, ErrorState, Panel, SectionTitle, Skeleton, SkeletonRows } from "@/components/ui";
import { formatDecimal, formatNumber, titleCase } from "@/lib/api";
import { loadPeta, petaAsset, type Peta, type PetaLandcover, type PetaTerrain } from "@/lib/peta";
import { routes } from "@/lib/routes";

type Layer = "batas" | "elevasi" | "tutupan";
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
  const router = useRouter();

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

  const { bounds, terrain, landcover } = peta;
  const has = (l: Layer) =>
    l === "batas" || (l === "elevasi" ? !!(bounds.layers.elevation && terrain) : !!(bounds.layers.landcover && landcover));
  const active: Layer = has(layer) ? layer : "batas";
  const mapLayers: MapLayer[] =
    active === "elevasi"
      ? [
          { href: petaAsset(kode, bounds.layers.elevation!) },
          ...(bounds.layers.hillshade ? [{ href: petaAsset(kode, bounds.layers.hillshade), blend: "multiply" as const }] : []),
        ]
      : active === "tutupan"
        ? [{ href: petaAsset(kode, bounds.layers.landcover!), pixelated: true }]
        : [];
  const opts: [Layer, string][] = [
    ["batas", "Batas"],
    ["elevasi", "Elevasi"],
    ["tutupan", "Tutupan lahan"],
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
            ariaLabel={`Peta ${active === "elevasi" ? "elevasi" : active === "tutupan" ? "tutupan lahan" : "batas"} wilayah`}
          />

          <Legend layer={active} terrain={terrain} landcover={landcover} />
          <Attribution terrain={terrain} landcover={landcover} />
        </Panel>

        <div className="min-w-0 space-y-6">
          {terrain ? <TerrainPanel t={terrain} /> : <Missing what="Statistik medan" />}
          {landcover ? <LandcoverPanel lc={landcover} /> : <Missing what="Tutupan lahan" />}
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

function Legend({ layer, terrain, landcover }: { layer: Layer; terrain: PetaTerrain | null; landcover: PetaLandcover | null }) {
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

function Attribution({ terrain, landcover }: { terrain: PetaTerrain | null; landcover: PetaLandcover | null }) {
  return (
    <p className="mt-4 border-t border-ink-border pt-3 text-[11.5px] leading-relaxed text-ink-muted">
      {terrain && <>Elevasi: {terrain.metadata.attribution}. </>}
      {landcover && <>Tutupan lahan: {landcover.metadata.attribution} (CC BY 4.0). </>}
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

function TerrainPanel({ t }: { t: PetaTerrain }) {
  const stats: [string, string][] = [
    ["Rata-rata elevasi", metres(t.elevation_m.mean)],
    ["Titik tertinggi", metres(t.highest_point.elevation_m)],
    ["Relief (p95 − p5)", metres(t.relief_m)],
    ["Lereng rata-rata", `${formatDecimal(t.slope_deg.mean, 1)}°`],
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
        {stats.map(([k, v]) => (
          <div key={k}>
            <dt className="text-xs text-ink-muted">{k}</dt>
            <dd className="whitespace-nowrap text-lg font-extrabold tabular-nums tracking-[-0.01em] text-ink-text">{v}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-5 text-xs font-semibold text-ink-muted">Luas menurut elevasi</div>
      <div className="mt-2">
        <Rows rows={Object.entries(t.elevation_bands_pct).map(([k, v]) => [BAND_LABEL[k] ?? k, v])} />
      </div>
      <div className="mt-5 text-xs font-semibold text-ink-muted">Luas menurut kemiringan</div>
      <div className="mt-2">
        <Rows rows={Object.entries(t.slope_classes_pct).map(([k, v]) => [SLOPE_LABEL[k] ?? k, v])} />
      </div>
      <p className="mt-4 text-xs leading-relaxed text-ink-muted">
        {t.classification.note} Elevasi dari model permukaan ({t.metadata.dataset}), termasuk tajuk pohon dan bangunan.
      </p>
    </Panel>
  );
}

function LandcoverPanel({ lc }: { lc: PetaLandcover }) {
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
      <p className="mt-4 text-xs leading-relaxed text-ink-muted">
        &ldquo;Tutupan pohon&rdquo; mencakup hutan dan perkebunan (sawit, akasia); citra satelit tidak membedakannya. Data {lc.year},
        bukan kondisi terkini.
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
