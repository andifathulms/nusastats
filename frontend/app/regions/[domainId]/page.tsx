"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  api,
  bpsRegencyStatus,
  dukcapilApi,
  formatNumber,
  PCT_COLOR,
  titleCase,
  type DukcapilRegionDetail,
  type RegionProfile,
  type RegionVariables,
} from "@/lib/api";
import { Badge, Panel, SectionTitle, StatTile } from "@/components/ui";
import { DukcapilDrilldown } from "@/components/DukcapilDrilldown";
import { DukcapilRegionProfile } from "@/components/DukcapilRegionProfile";

type Kind = "national" | "province" | "regency" | "district" | "village";

// The unified profile is keyed on a BPS domain_id for nasional/provinsi/kab
// (4-digit, "0000" = nasional) and on a Dukcapil code for kecamatan (6-digit)
// and desa (10-digit), which BPS has no counterpart for.
function regionKind(code: string): Kind {
  if (code === "0000") return "national";
  if (code.length === 4) return code.endsWith("00") ? "province" : "regency";
  if (code.length <= 7) return "district";
  return "village";
}

const KIND_LABEL: Record<Kind, string> = {
  national: "Nasional",
  province: "Provinsi",
  regency: "Kabupaten/Kota",
  district: "Kecamatan",
  village: "Desa/Kelurahan",
};

export default function RegionDetailPage({ params }: { params: { domainId: string } }) {
  const { domainId } = params;
  const kind = regionKind(domainId);
  const bpsBacked = kind === "national" || kind === "province" || kind === "regency";

  return bpsBacked ? (
    <BpsRegion domainId={domainId} kind={kind} />
  ) : (
    <DukcapilRegion code={domainId} kind={kind} />
  );
}

// --- Nasional / Provinsi / Kab-Kota: BPS-backed + Dukcapil demographics -----

type Tab = "indicators" | "profile" | "demografi" | "wilayah";

function BpsRegion({ domainId, kind }: { domainId: string; kind: Kind }) {
  const [data, setData] = useState<RegionVariables | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<Tab>("indicators");
  const [profile, setProfile] = useState<RegionProfile | null>(null);
  const [duk, setDuk] = useState<DukcapilRegionDetail | null>(null);
  const [dukState, setDukState] = useState<"idle" | "loading" | "empty">("idle");

  useEffect(() => {
    api.regionVariables(domainId).then(setData).catch((e) => setError(String(e)));
  }, [domainId]);

  // Lazy-load the BPS percentile profile the first time that tab opens.
  useEffect(() => {
    if (tab === "profile" && !profile) api.regionProfile(domainId).then(setProfile);
  }, [tab, profile, domainId]);

  // Lazy-load Dukcapil demographics: province via code[:2], regency via the
  // bridge (BPS and Dukcapil regency codes diverge, so name-matching is needed).
  useEffect(() => {
    if (tab !== "demografi" || duk || dukState === "loading" || dukState === "empty") return;
    setDukState("loading");
    const resolve =
      kind === "province"
        ? dukcapilApi.regionDetail(domainId.slice(0, 2))
        : dukcapilApi
            .regencyBridge(domainId)
            .then((b) => (b.dukcapil ? dukcapilApi.regionDetail(b.dukcapil.code) : null));
    resolve
      .then((d) => (d ? setDuk(d) : setDukState("empty")))
      .catch(() => setDukState("empty"));
  }, [tab, duk, dukState, kind, domainId]);

  const filtered = useMemo(() => {
    if (!data) return [];
    return data.results.filter((v) => !search || v.name.toLowerCase().includes(search.toLowerCase()));
  }, [data, search]);

  if (error) return <div className="text-ink-muted">Gagal memuat: {error}</div>;
  if (!data) return <div className="text-ink-muted">Memuat…</div>;

  const { region } = data;
  const badge =
    kind === "regency" ? bpsRegencyStatus(region.domain_id) || "Kabupaten/Kota" : KIND_LABEL[kind];

  const tabs: [Tab, string][] = [
    ["indicators", "Variabel BPS"],
    ...(kind !== "national" ? ([["profile", "Peringkat BPS"]] as [Tab, string][]) : []),
    ...(kind === "province" || kind === "regency" ? ([["demografi", "Demografi (Dukcapil)"]] as [Tab, string][]) : []),
    ...(kind === "regency" ? ([["wilayah", "Wilayah (Dukcapil)"]] as [Tab, string][]) : []),
  ];

  return (
    <div className="space-y-6">
      <header className="border-b border-ink-border pb-5">
        <Link href="/regions" className="text-sm text-ink-muted transition-colors hover:text-ink-accent">
          ← Wilayah
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="font-display text-3xl font-medium tracking-tight text-ink-text sm:text-4xl">
            {region.domain_name}
          </h1>
          <Badge tone="accent">{badge}</Badge>
          {region.parent_province_name && (
            <Link
              href={`/regions/${region.parent_province_id}`}
              className="text-sm text-ink-muted transition-colors hover:text-ink-accent"
            >
              di {region.parent_province_name}
            </Link>
          )}
          <span className="text-xs text-ink-faint">kode {region.domain_id}</span>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatTile label="Indikator" value={data.total_variables} sub="punya data di wilayah ini" />
        <StatTile label="Titik data" value={data.total_data_points} sub="nilai riil tersimpan" accent="accent2" />
        <StatTile
          label="Rentang tahun"
          value={data.year_min && data.year_max ? `${data.year_min}–${data.year_max}` : "–"}
          accent="good"
        />
      </div>

      {tabs.length > 1 && (
        <div className="inline-flex flex-wrap rounded-xl border border-ink-border/80 bg-ink-panel/50 p-1 backdrop-blur-sm">
          {tabs.map(([v, label]) => (
            <button
              key={v}
              onClick={() => setTab(v)}
              className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${
                tab === v ? "bg-brand-gradient text-white shadow-glow" : "text-ink-muted hover:text-ink-text"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {tab === "wilayah" && kind === "regency" ? (
        <DukcapilDrilldown domainId={domainId} />
      ) : tab === "demografi" ? (
        <DemografiView state={dukState} detail={duk} />
      ) : tab === "profile" && kind !== "national" ? (
        <ProfileView profile={profile} regionLevel={kind} domainId={domainId} />
      ) : (
        <div>
          <SectionTitle hint="klik untuk membuat grafik wilayah ini">Indikator tersedia</SectionTitle>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Saring indikator…"
            className="mb-3 w-full rounded-lg border border-ink-border bg-ink-panel px-4 py-2.5 text-sm text-ink-text placeholder:text-ink-muted focus:border-ink-accent focus:outline-none"
          />
          <Panel className="overflow-hidden p-0">
            <div className="max-h-[32rem] overflow-auto scroll-thin">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-ink-panel2/70 backdrop-blur">
                  <tr className="border-b border-ink-border text-left text-[11px] uppercase tracking-wider text-ink-muted">
                    <th className="px-5 py-3 font-semibold">Indikator</th>
                    <th className="px-5 py-3 font-semibold">Kategori</th>
                    <th className="px-5 py-3 text-right font-semibold">Tahun</th>
                    <th className="px-5 py-3 text-right font-semibold">Titik</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((v) => (
                    <tr key={v.variable_id} className="border-b border-ink-border/50 transition-colors last:border-0 hover:bg-ink-accent/[0.04]">
                      <td className="px-5 py-3">
                        <Link
                          href={`/variables/${v.variable_id}?region=${region.domain_id}`}
                          className="font-medium text-ink-accent hover:underline"
                        >
                          {v.name}
                        </Link>
                        {v.unit && <span className="ml-2 text-xs text-ink-faint">({v.unit})</span>}
                      </td>
                      <td className="px-5 py-3">
                        <Badge>{v.subject_category}</Badge>
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums text-ink-muted">
                        {v.year_min && v.year_max ? `${v.year_min}–${v.year_max}` : "–"}
                      </td>
                      <td className="px-5 py-3 text-right font-medium tabular-nums text-ink-text">
                        {formatNumber(v.data_point_count)}
                      </td>
                    </tr>
                  ))}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-10 text-center text-ink-muted">
                        Tidak ada indikator yang cocok.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>
      )}
    </div>
  );
}

function DemografiView({ state, detail }: { state: "idle" | "loading" | "empty"; detail: DukcapilRegionDetail | null }) {
  if (detail) {
    return (
      <div>
        <SectionTitle hint={`peringkat & persentil terhadap ${detail.peer_scope}`}>
          Demografi Dukcapil
        </SectionTitle>
        <Panel>
          <DukcapilRegionProfile detail={detail} bare />
        </Panel>
      </div>
    );
  }
  if (state === "empty")
    return <div className="text-sm text-ink-muted">Tidak ada padanan data Dukcapil untuk wilayah ini.</div>;
  return <div className="text-ink-muted">Memuat data Dukcapil…</div>;
}

function ProfileView({
  profile,
  regionLevel,
  domainId,
}: {
  profile: RegionProfile | null;
  regionLevel: string;
  domainId: string;
}) {
  if (!profile) return <div className="text-ink-muted">Menghitung peringkat persentil…</div>;
  const peerLabel = regionLevel === "province" ? "provinsi lain" : "kabupaten/kota lain";
  return (
    <div>
      <SectionTitle hint={`persentil vs ${peerLabel}, tahun terbaru masing-masing · terkuat dulu`}>
        Peringkat {profile.region.domain_name}
      </SectionTitle>
      <Panel className="overflow-hidden p-0">
        <div className="max-h-[36rem] divide-y divide-ink-border/40 overflow-auto scroll-thin">
          {profile.results.map((r) => {
            const pct = r.percentile ?? 0;
            const color = PCT_COLOR(pct);
            return (
              <div key={r.variable_id} className="flex items-center gap-3 px-4 py-2.5">
                <div className="w-1/2 min-w-0">
                  <Link
                    href={`/variables/${r.variable_id}?region=${domainId}`}
                    className="block truncate text-sm text-ink-text hover:text-ink-accent"
                    title={r.name}
                  >
                    {r.name}
                  </Link>
                  <div className="text-xs text-ink-muted">
                    {r.subject_category} · {r.year} · {formatNumber(r.value)} {r.unit}
                  </div>
                </div>
                <div className="flex flex-1 items-center gap-3">
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-ink-panel2">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
                  </div>
                  <div className="w-28 shrink-0 text-right text-xs tabular-nums text-ink-muted">
                    {r.rank ? (
                      <>
                        <span className="text-ink-text">persentil {pct}</span> · #{r.rank}/{r.of}
                      </>
                    ) : (
                      "–"
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          {profile.results.length === 0 && (
            <div className="px-4 py-8 text-center text-ink-muted">Tidak ada indikator yang bisa diperingkat.</div>
          )}
        </div>
      </Panel>
    </div>
  );
}

// --- Kecamatan / Desa: Dukcapil-only ---------------------------------------

function DukcapilRegion({ code, kind }: { code: string; kind: Kind }) {
  const [detail, setDetail] = useState<DukcapilRegionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    dukcapilApi.regionDetail(code).then(setDetail).catch((e) => setError(String(e)));
  }, [code]);

  if (error) return <div className="text-ink-muted">Gagal memuat: {error}</div>;
  if (!detail) return <div className="text-ink-muted">Memuat…</div>;

  const r = detail.region;
  const scope = [r.nama_kec, r.nama_kab, r.nama_prop].filter(Boolean).map(titleCase).join(", ");

  return (
    <div className="space-y-6">
      <header className="border-b border-ink-border pb-5">
        <Link href="/regions" className="text-sm text-ink-muted transition-colors hover:text-ink-accent">
          ← Wilayah
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="font-display text-3xl font-medium tracking-tight text-ink-text sm:text-4xl">{r.name}</h1>
          <Badge tone="accent">{r.status || KIND_LABEL[kind]}</Badge>
          <span className="text-xs text-ink-faint">kode {r.code}</span>
        </div>
        {scope && <div className="mt-1.5 text-sm text-ink-muted">{scope}</div>}
        <p className="mt-1 text-xs text-ink-muted">
          Sumber Dukcapil · peringkat & persentil terhadap {detail.peer_scope}. BPS tidak menyediakan
          data pada tingkat ini.
        </p>
      </header>
      <Panel>
        <DukcapilRegionProfile detail={detail} bare />
      </Panel>
    </div>
  );
}
