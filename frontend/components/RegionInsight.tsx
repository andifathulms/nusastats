"use client";

// "Insight" sections for the region detail page: what's inside this region?
// - Province: demography of its kabupaten/kota (Dukcapil) and their economy
//   (BPS PDRB + DJPK APBD accounts and fiscal ratios), each on a province map.
// - Regency: demography of its kecamatan (Dukcapil) on a regency map.
//
// Three sources, three code schemes. Every metric loader normalizes to a single
// row shape carrying the Kemendagri code (what the map geometry is keyed on)
// and/or the BPS domain_id (what /jelajahi/<id> routes on); MetricSection fills
// in whichever side the loader didn't supply, via the regency crosswalk.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  api,
  bpsRegionLabel,
  CHART,
  djpkApi,
  dukcapilApi,
  formatNumber,
  formatRupiah,
  regionLabel,
  type DjpkScope,
  type RegencyCrosswalk,
} from "@/lib/api";
import { Panel, SectionTitle } from "@/components/ui";
import { ChoroplethMap, type MapValue } from "@/components/ChoroplethMap";

// --- metric contract -------------------------------------------------------

type MetricRow = {
  code?: string; // Kemendagri wilayah code — map geometry key
  bpsId?: string; // BPS domain_id — /jelajahi/<id> route
  name: string; // display-ready (loaders apply the Kota/Kab. prefix)
  value: number;
};

type MetricResult = { rows: MetricRow[]; note: string };

type Metric = {
  key: string;
  label: string; // pill text
  // Mid-sentence form for the narrative. Explicit rather than lowercasing the
  // label, which would mangle the acronyms ("PDRB" -> "pdrb").
  phrase: string;
  group: string;
  unit: string;
  // Additive metrics (counts, rupiah) get a "share of the total" narrative;
  // ratios and rates get compared to the median instead — summing them is
  // meaningless.
  additive: boolean;
  format: (v: number) => string;
  load: (ctx: LoadCtx) => Promise<MetricResult>;
};

type LoadCtx = {
  prov: string; // 2-digit Kemendagri/BPS province code
  djpkProv: string | null; // DJPK's own province code, or null if unresolved
  kab?: string; // 4-digit Kemendagri regency code (regency pages)
};

const pct = (d = 1) => (v: number) => `${v.toLocaleString("id-ID", { maximumFractionDigits: d })}%`;
const count = (d = 0) => (v: number) =>
  d ? v.toLocaleString("id-ID", { maximumFractionDigits: d }) : formatNumber(Math.round(v));
const rupiah = (v: number) => formatRupiah(v);
// BPS publishes PDRB in miliar rupiah; formatRupiah expects whole rupiah.
const rupiahMiliar = (v: number) => formatRupiah(v * 1e9);

// --- demography metrics (Dukcapil) -----------------------------------------

function dukcapilMetric(
  key: string,
  label: string,
  phrase: string,
  unit: string,
  additive: boolean,
  format: (v: number) => string,
  scope: (ctx: LoadCtx) => Record<string, string>
): Metric {
  return {
    key,
    label,
    phrase,
    group: "Dukcapil",
    unit,
    additive,
    format,
    load: async (ctx) => {
      const r = await dukcapilApi.rank({ indicator: key, order: "desc", limit: "600", ...scope(ctx) });
      return {
        rows: r.results.map((x) => ({
          code: x.domain_id,
          name: regionLabel(x.domain_name, x.status),
          value: x.value,
        })),
        note: "sumber Dukcapil (Kemendagri)",
      };
    },
  };
}

const DEMOGRAPHY_METRICS = (scope: (ctx: LoadCtx) => Record<string, string>): Metric[] => [
  dukcapilMetric("jumlah_penduduk", "Penduduk", "jumlah penduduk", "jiwa", true, count(), scope),
  dukcapilMetric("pop_density", "Kepadatan", "kepadatan penduduk", "jiwa/km²", false, count(), scope),
  dukcapilMetric("median_age", "Usia median", "usia median", "tahun", false, count(1), scope),
  dukcapilMetric("pct_productive", "% usia produktif", "proporsi usia produktif", "%", false, pct(), scope),
  dukcapilMetric("pct_sarjana", "% sarjana", "proporsi sarjana", "%", false, pct(), scope),
  dukcapilMetric("ktp_coverage", "Cakupan KTP-el", "cakupan KTP-el", "%", false, pct(), scope),
];

// --- economy metrics (BPS PDRB + DJPK APBD) --------------------------------

// BPS SERI-2010 PDRB by expenditure, regency level. turvar 1550 = the PDRB
// total; the variable's default turvar is a *component* (household
// consumption), so the total must be asked for explicitly.
const PDRB_ADHB = "2193"; // current prices — economy size
const PDRB_ADHK = "2194"; // constant 2010 prices — real growth
const PDRB_TOTAL_TURVAR = "1550";

const bpsRow = (r: { domain_id: string; domain_name: string }, value: number): MetricRow => ({
  bpsId: r.domain_id,
  name: bpsRegionLabel(r.domain_name, r.domain_id),
  value,
});

const PDRB_METRIC: Metric = {
  key: "pdrb",
  label: "PDRB",
  phrase: "PDRB",
  group: "Ukuran ekonomi (BPS)",
  unit: "",
  additive: true,
  format: rupiahMiliar,
  load: async (ctx) => {
    const r = await api.ranking(PDRB_ADHB, { admin_level: "regency", turvar_id: PDRB_TOTAL_TURVAR });
    // BPS regency domain_ids are hierarchical: first 2 digits = the province.
    const rows = r.results.filter((x) => x.domain_id.startsWith(ctx.prov)).map((x) => bpsRow(x, x.value));
    return { rows, note: `PDRB atas dasar harga berlaku ${r.year} · sumber BPS` };
  },
};

const PDRB_GROWTH_METRIC: Metric = {
  key: "pdrb_growth",
  label: "Pertumbuhan PDRB",
  phrase: "pertumbuhan PDRB",
  group: "Ukuran ekonomi (BPS)",
  unit: "%",
  additive: false,
  format: pct(),
  load: async (ctx) => {
    // Anchor to the latest year the size ranking has, then measure real growth
    // over the year before it on the constant-price series.
    const base = await api.ranking(PDRB_ADHB, { admin_level: "regency", turvar_id: PDRB_TOTAL_TURVAR });
    if (!base.year) return { rows: [], note: "tahun PDRB tidak diketahui" };
    const g = await api.growth(PDRB_ADHK, {
      admin_level: "regency",
      turvar_id: PDRB_TOTAL_TURVAR,
      year_from: String(base.year - 1),
      year_to: String(base.year),
    });
    const rows = g.results
      .filter((x) => x.domain_id.startsWith(ctx.prov) && x.change_pct !== null)
      .map((x) => bpsRow(x, x.change_pct as number));
    return { rows, note: `pertumbuhan riil ${base.year - 1}→${base.year} (harga konstan) · sumber BPS` };
  },
};

function djpkScopeNote(scope: DjpkScope): string {
  const type = scope.type === "realisasi" ? "realisasi" : "anggaran";
  return `APBD ${type} ${scope.tahun} · sumber DJPK/Kemenkeu`;
}

function djpkMetric(
  akun: string,
  label: string,
  phrase: string,
  group: string,
  unit: string,
  additive: boolean,
  format: (v: number) => string
): Metric {
  return {
    key: akun,
    label,
    phrase,
    group,
    unit,
    additive,
    format,
    load: async (ctx) => {
      // DJPK numbers provinces on its own scheme; without the resolved code we
      // cannot scope the query, so say so rather than showing the whole country.
      if (!ctx.djpkProv) return { rows: [], note: "wilayah DJPK tidak dikenali" };
      const r = await djpkApi.rank({
        akun,
        level: "regency",
        prov: ctx.djpkProv,
        measure: "realisasi",
        order: "desc",
        limit: "600",
      });
      return {
        rows: r.results.map((x) => ({
          code: x.kemendagri_code || undefined,
          name: x.domain_name, // DJPK names already carry "Kab. "/"Kota "
          value: x.value,
        })),
        note: djpkScopeNote(r.scope),
      };
    },
  };
}

const APBD = "Keuangan daerah (DJPK)";
const RASIO = "Rasio fiskal (DJPK)";

const ECONOMY_METRICS: Metric[] = [
  PDRB_METRIC,
  PDRB_GROWTH_METRIC,
  djpkMetric("pad", "PAD", "PAD (pendapatan asli daerah)", APBD, "", true, rupiah),
  djpkMetric("pendapatan_daerah", "Pendapatan", "pendapatan daerah", APBD, "", true, rupiah),
  djpkMetric("tkdd", "Transfer pusat", "transfer dari pusat (TKDD)", APBD, "", true, rupiah),
  djpkMetric("belanja_daerah", "Belanja", "belanja daerah", APBD, "", true, rupiah),
  djpkMetric("belanja_modal", "Belanja modal", "belanja modal", APBD, "", true, rupiah),
  djpkMetric("rasio_kemandirian", "Kemandirian fiskal", "kemandirian fiskal", RASIO, "%", false, pct()),
  djpkMetric("rasio_ketergantungan", "Ketergantungan transfer", "ketergantungan transfer", RASIO, "%", false, pct()),
  // "%" prefixed: these share a name with the rupiah accounts above, and the
  // group label that separates them is hidden on narrow screens.
  djpkMetric("rasio_belanja_pegawai", "% belanja pegawai", "rasio belanja pegawai", RASIO, "%", false, pct()),
  djpkMetric("rasio_belanja_modal", "% belanja modal", "rasio belanja modal", RASIO, "%", false, pct()),
];

// --- page-level sections ---------------------------------------------------

export function ProvinceInsight({ domainId, regionName }: { domainId: string; regionName: string }) {
  const prov = domainId.slice(0, 2);
  const [djpkProv, setDjpkProv] = useState<string | null>(null);
  const [djpkReady, setDjpkReady] = useState(false);

  // DJPK province code <- Kemendagri province code, via the DJPK region list.
  useEffect(() => {
    djpkApi
      .regions({ level: "province" })
      .then((rows) => setDjpkProv(rows.find((r) => r.kemendagri_code === prov)?.djpk_prov ?? null))
      .catch(() => setDjpkProv(null))
      .finally(() => setDjpkReady(true));
  }, [prov]);

  const ctx: LoadCtx = { prov, djpkProv };

  return (
    <div className="space-y-10">
      <MetricSection
        title="Demografi kabupaten/kota"
        childLabel="kabupaten/kota"
        parentName={regionName}
        metrics={DEMOGRAPHY_METRICS(() => ({ level: "regency", prov }))}
        ctx={ctx}
        geojsonUrl="/dukcapil-regencies.geojson"
        mapFilter={[prov]}
        linkVia="crosswalk"
      />
      {djpkReady && (
        <MetricSection
          title="Ekonomi kabupaten/kota"
          childLabel="kabupaten/kota"
          parentName={regionName}
          metrics={ECONOMY_METRICS}
          ctx={ctx}
          geojsonUrl="/dukcapil-regencies.geojson"
          mapFilter={[prov]}
          linkVia="crosswalk"
        />
      )}
    </div>
  );
}

export function RegencyInsight({ domainId, regionName }: { domainId: string; regionName: string }) {
  const [kab, setKab] = useState<string | null>(null);
  const [state, setState] = useState<"loading" | "empty" | "ok">("loading");

  // BPS and Kemendagri regency codes diverge — resolve through the bridge.
  useEffect(() => {
    setState("loading");
    dukcapilApi
      .regencyBridge(domainId)
      .then((b) => {
        if (b.dukcapil) {
          setKab(b.dukcapil.code);
          setState("ok");
        } else setState("empty");
      })
      .catch(() => setState("empty"));
  }, [domainId]);

  if (state === "loading") return <div className="text-ink-muted">Memuat data Dukcapil…</div>;
  if (state === "empty" || !kab)
    return <div className="text-sm text-ink-muted">Tidak ada padanan data Dukcapil untuk wilayah ini.</div>;

  return (
    <div className="space-y-8">
      <MetricSection
        title="Demografi kecamatan"
        childLabel="kecamatan"
        parentName={regionName}
        metrics={DEMOGRAPHY_METRICS(() => ({ level: "district", kab }))}
        ctx={{ prov: kab.slice(0, 2), djpkProv: null, kab }}
        geojsonUrl={`/dukcapil-districts-${kab.slice(0, 2)}.geojson`}
        mapFilter={[kab]}
        linkVia="direct"
      />
      <p className="text-xs text-ink-muted">
        PDRB dan APBD tidak dipublikasikan pada tingkat kecamatan — keduanya berhenti di kabupaten/kota,
        sehingga bagian ekonomi hanya tersedia di halaman provinsi.
      </p>
    </div>
  );
}

// --- the shared section: picker + narrative + map + ranked lists ------------

function MetricSection({
  title,
  childLabel,
  parentName,
  metrics,
  ctx,
  geojsonUrl,
  mapFilter,
  linkVia,
}: {
  title: string;
  childLabel: string;
  parentName: string;
  metrics: Metric[];
  ctx: LoadCtx;
  geojsonUrl: string;
  mapFilter: string[];
  // "crosswalk": rows are kabupaten — resolve BPS <-> Kemendagri codes.
  // "direct": rows are kecamatan — the Kemendagri code is itself the route.
  linkVia: "crosswalk" | "direct";
}) {
  const [key, setKey] = useState(metrics[0].key);
  const [result, setResult] = useState<MetricResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [cw, setCw] = useState<RegencyCrosswalk[]>([]);
  const metric = metrics.find((m) => m.key === key) ?? metrics[0];

  useEffect(() => {
    if (linkVia !== "crosswalk") return;
    dukcapilApi
      .regencyCrosswalk()
      .then((c) => setCw(c.results))
      .catch(() => setCw([]));
  }, [linkVia]);

  useEffect(() => {
    let live = true;
    setLoading(true);
    setFailed(false);
    metric
      .load(ctx)
      .then((r) => live && setResult(r))
      .catch(() => live && (setResult(null), setFailed(true)))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, ctx.prov, ctx.djpkProv, ctx.kab]);

  // Fill in whichever code side the loader didn't supply.
  const { bpsByKemen, kemenByBps } = useMemo(
    () => ({
      bpsByKemen: new Map(cw.map((c) => [c.kemendagri_code, c.bps_domain_id])),
      kemenByBps: new Map(cw.map((c) => [c.bps_domain_id, c.kemendagri_code])),
    }),
    [cw]
  );

  const rows = useMemo(() => {
    const raw = result?.rows ?? [];
    return raw
      .map((r) => {
        if (linkVia === "direct") return { ...r, bpsId: r.code };
        const code = r.code ?? (r.bpsId ? kemenByBps.get(r.bpsId) : undefined);
        const bpsId = r.bpsId ?? (r.code ? bpsByKemen.get(r.code) : undefined);
        return { ...r, code, bpsId };
      })
      .sort((a, b) => b.value - a.value);
  }, [result, linkVia, bpsByKemen, kemenByBps]);

  const values = useMemo(() => {
    const m = new Map<string, MapValue>();
    rows.forEach((r) => r.code && m.set(r.code, { value: r.value, name: r.name }));
    return m;
  }, [rows]);

  const nums = rows.map((r) => r.value);
  const min = nums.length ? Math.min(...nums) : 0;
  const max = nums.length ? Math.max(...nums) : 1;

  const groups = useMemo(() => {
    const g: [string, Metric[]][] = [];
    metrics.forEach((m) => {
      const hit = g.find(([name]) => name === m.group);
      if (hit) hit[1].push(m);
      else g.push([m.group, [m]]);
    });
    return g;
  }, [metrics]);
  const flatPicker = groups.length === 1;

  return (
    <section>
      <SectionTitle
        hint={loading ? "memuat…" : rows.length ? `${rows.length} ${childLabel} · ${result?.note ?? ""}` : ""}
      >
        {title}
      </SectionTitle>

      {/* Metric picker. Each group is its own row; the label sits in a
          fixed-width column so every group's pills begin on the same x —
          right-aligning the rows independently staircases the left edge and
          scatters the labels. */}
      <div className="mb-4 space-y-1.5">
        {groups.map(([group, items]) => (
          <div key={group} className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
            {!flatPicker && (
              <span className="text-[11px] uppercase leading-5 tracking-wider text-ink-faint sm:w-52 sm:shrink-0 sm:text-right">
                {group}
              </span>
            )}
            <div className="flex w-fit flex-wrap gap-0.5 rounded-lg border border-ink-border/80 bg-ink-panel2/50 p-0.5">
              {items.map((m) => (
                <button
                  key={m.key}
                  onClick={() => setKey(m.key)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                    key === m.key ? "bg-laut-950 text-kertas-200 dark:bg-ink-accent dark:text-ink-onAccent" : "text-ink-muted hover:text-ink-text"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {failed ? (
        <div className="text-sm text-ink-muted">Gagal memuat data {metric.phrase}.</div>
      ) : !loading && rows.length === 0 ? (
        <div className="text-sm text-ink-muted">
          Data {metric.phrase} belum tersedia untuk {parentName}
          {result?.note ? ` (${result.note})` : ""}.
        </div>
      ) : (
        <>
          {rows.length > 0 && (
            <Narrative rows={rows} metric={metric} childLabel={childLabel} parentName={parentName} />
          )}
          <div className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <Panel className="min-w-0">
              <ChoroplethMap
                values={values}
                min={min}
                max={max}
                unit={metric.unit}
                format={metric.format}
                geojsonUrls={[geojsonUrl]}
                provFilter={mapFilter}
              />
            </Panel>
            <Panel className="flex min-w-0 flex-col gap-4">
              <RankedList rows={rows} metric={metric} childLabel={childLabel} />
            </Panel>
          </div>
        </>
      )}
    </section>
  );
}

function Narrative({
  rows,
  metric,
  childLabel,
  parentName,
}: {
  rows: MetricRow[];
  metric: Metric;
  childLabel: string;
  parentName: string;
}) {
  const top = rows[0];
  const bot = rows[rows.length - 1];
  if (!top || rows.length < 2) return null;

  const total = rows.reduce((s, r) => s + r.value, 0);
  const median = rows[Math.floor(rows.length / 2)]?.value ?? 0;
  // id-ID throughout: the sentence also carries pct()/formatRupiah output, and
  // mixing decimal conventions inside one sentence ("11.3%" beside "27,8×") reads
  // as a typo.
  const num = (v: number) => v.toLocaleString("id-ID", { maximumFractionDigits: 1 });
  const share = metric.additive && total > 0 ? num((top.value / total) * 100) : null;
  // Only meaningful for same-signed, non-zero magnitudes.
  const ratio = metric.additive && bot.value > 0 ? top.value / bot.value : null;

  return (
    <p className="max-w-3xl text-sm leading-relaxed text-ink-text/90">
      <span className="font-semibold text-ink-text">{top.name}</span> mencatat {metric.phrase} tertinggi di{" "}
      {parentName} — {metric.format(top.value)}
      {share ? (
        <>
          , atau <span className="font-medium text-ink-text">{share}%</span> dari total {childLabel}
        </>
      ) : (
        <>, dibanding median {metric.format(median)}</>
      )}
      . Terendah adalah <span className="font-semibold text-ink-text">{bot.name}</span> dengan{" "}
      {metric.format(bot.value)}
      {ratio && ratio >= 2 ? <> — selisih {num(ratio)}× lipat antar {childLabel}</> : null}.
    </p>
  );
}

function RankedList({ rows, metric, childLabel }: { rows: MetricRow[]; metric: Metric; childLabel: string }) {
  const top = rows.slice(0, 5);
  const bottom = rows.length > 10 ? rows.slice(-5).reverse() : [];
  // Bars encode magnitude from a zero baseline; a metric that goes negative
  // (real growth can) is scaled from the most-negative value instead.
  const hi = Math.max(...rows.map((r) => r.value));
  const lo = Math.min(0, ...rows.map((r) => r.value));
  const span = hi - lo || 1;

  const Row = ({ r, rankNo }: { r: MetricRow; rankNo: number }) => (
    <div className="flex items-center gap-2.5">
      <span className="w-6 shrink-0 text-right text-xs tabular-nums text-ink-muted">{rankNo}</span>
      <span className="w-36 min-w-0 shrink-0 truncate text-sm" title={r.name}>
        {r.bpsId ? (
          <Link href={`/jelajahi/${r.bpsId}`} className="text-ink-text transition-colors hover:text-ink-accent">
            {r.name}
          </Link>
        ) : (
          <span className="text-ink-text">{r.name}</span>
        )}
      </span>
      <span className="relative h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-ink-panel2">
        <span
          className="absolute inset-y-0 left-0 rounded-full"
          style={{ width: `${Math.max(2, ((r.value - lo) / span) * 100)}%`, background: CHART.accent }}
        />
      </span>
      <span className="w-24 shrink-0 text-right text-xs tabular-nums text-ink-muted">
        {metric.format(r.value)}
      </span>
    </div>
  );

  return (
    <>
      <div>
        <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-muted">
          5 {childLabel} teratas
        </div>
        <div className="space-y-1.5">
          {top.map((r, i) => (
            <Row key={r.code ?? r.bpsId ?? r.name} r={r} rankNo={i + 1} />
          ))}
        </div>
      </div>
      {bottom.length > 0 && (
        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-muted">
            5 {childLabel} terbawah
          </div>
          <div className="space-y-1.5">
            {bottom.map((r, i) => (
              <Row key={r.code ?? r.bpsId ?? r.name} r={r} rankNo={rows.length - i} />
            ))}
          </div>
        </div>
      )}
    </>
  );
}
