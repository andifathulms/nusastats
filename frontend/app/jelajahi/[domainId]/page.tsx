"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  api,
  bpsRegencyStatus,
  dukcapilApi,
  formatCompact,
  formatDecimal,
  formatNumber,
  regionLabel,
  PCT_COLOR,
  titleCase,
  type DukcapilRegionDetail,
  type RegionProfile,
  type RegionVariables,
} from "@/lib/api";
import { Badge, ErrorState, Panel, SectionTitle, Skeleton, SkeletonRows, SkeletonTile } from "@/components/ui";
import { DukcapilDrilldown } from "@/components/DukcapilDrilldown";
import { DukcapilRegionProfile } from "@/components/DukcapilRegionProfile";
import { ProvinceInsight, RegencyInsight } from "@/components/RegionInsight";
import { Breadcrumbs, RegionHero, StickyTabs, type Crumb, type HeroFact } from "@/components/explore/RegionHero";
import { provinceHref, routes } from "@/lib/routes";

// BPS province domain -> Dukcapil 2-digit code. BPS still uses the pre-2022
// Papua split: 9400 Papua = Dukcapil 91, 9100 Papua Barat = Dukcapil 92.
function dukcapilProvinceCode(bpsId: string): string {
  return ({ "9400": "91", "9100": "92" } as Record<string, string>)[bpsId] ?? bpsId.slice(0, 2);
}

type Kind = "national" | "province" | "regency" | "district" | "village";

// The unified profile is keyed on a BPS domain_id for nasional/provinsi/kab
// (4-digit, "0000" = nasional) and on a Dukcapil code for kecamatan (6-digit)
// and desa (10-digit), which BPS has no counterpart for.
function regionKind(code: string): Kind {
  if (code === "0000") return "national";
  // 2-digit = a Dukcapil-only province (the four post-2022 Papua provinces).
  if (code.length === 2) return "province";
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
  const bpsBacked = (kind === "national" || kind === "province" || kind === "regency") && domainId.length === 4;

  return bpsBacked ? (
    <BpsRegion domainId={domainId} kind={kind} />
  ) : (
    <DukcapilRegion code={domainId} kind={kind} />
  );
}

// --- Nasional / Provinsi / Kab-Kota: BPS-backed + Dukcapil demographics -----

type Tab = "insight" | "indicators" | "profile" | "demografi" | "wilayah";

function BpsRegion({ domainId, kind }: { domainId: string; kind: Kind }) {
  const [data, setData] = useState<RegionVariables | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  // The insight tab (what's inside this region) leads for province/regency —
  // it's the most telling view; nasional falls back to the variable catalog.
  const [tab, setTab] = useState<Tab>(kind === "province" || kind === "regency" ? "insight" : "indicators");
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

  // Dukcapil demographics feed both the hero facts and the Demografi tab.
  // Province via its 2-digit code (BPS keeps the old Papua split), regency via
  // the bridge (BPS and Dukcapil regency codes diverge; name-matched).
  useEffect(() => {
    if (kind === "national") return;
    setDukState("loading");
    // One request either way: a regency resolves to its Dukcapil match
    // server-side (previously a bridge call, then the detail call).
    const resolve =
      kind === "province"
        ? dukcapilApi.regionDetail(dukcapilProvinceCode(domainId))
        : dukcapilApi.regionDetailByBps(domainId);
    resolve
      .then((d) => (d ? setDuk(d) : setDukState("empty")))
      .catch(() => setDukState("empty"));
  }, [kind, domainId]);

  const filtered = useMemo(() => {
    if (!data) return [];
    return data.results.filter((v) => !search || v.name.toLowerCase().includes(search.toLowerCase()));
  }, [data, search]);

  if (error) return <ErrorState message={error} />;

  // Only the hero and the indicator table wait for the region's variable list;
  // the tabs and their own data (insight maps, demografi, wilayah) start
  // loading immediately instead of after it.
  const region = data?.region;
  // BPS ships "Dki Jakarta" / "Di Yogyakarta"; titleCase restores the acronyms.
  const regionName = region ? titleCase(region.domain_name) : "";
  const badge =
    kind === "regency" ? bpsRegencyStatus(domainId) || "Kabupaten/Kota" : KIND_LABEL[kind];

  const tabs: [Tab, string][] = [
    ...(kind === "province" ? ([["insight", "Kabupaten/Kota"]] as [Tab, string][]) : []),
    ...(kind === "regency" ? ([["insight", "Kecamatan"]] as [Tab, string][]) : []),
    ["indicators", "Variabel BPS"],
    ...(kind !== "national" ? ([["profile", "Peringkat BPS"]] as [Tab, string][]) : []),
    ...(kind === "province" || kind === "regency" ? ([["demografi", "Demografi (Dukcapil)"]] as [Tab, string][]) : []),
    ...(kind === "regency" ? ([["wilayah", "Wilayah (Dukcapil)"]] as [Tab, string][]) : []),
  ];

  const crumbs: Crumb[] = [{ label: "Indonesia", href: routes.region("0000") }];
  if (region?.parent_province_id && region.parent_province_name)
    crumbs.push({ label: titleCase(region.parent_province_name), href: routes.region(region.parent_province_id) });
  if (kind !== "national") crumbs.push({ label: kind === "regency" ? regionLabel(regionName, badge) : regionName });

  const ind = (f: string) => duk?.groups.flatMap((g) => g.indicators).find((i) => i.field === f);
  const pop = ind("jumlah_penduduk");
  const dens = ind("pop_density_big");
  const dukPending = kind !== "national" && !duk && dukState !== "empty";
  const peers = kind === "province" ? "" : " di provinsi";
  const facts: HeroFact[] = [
    ...(kind === "national" || dukState === "empty"
      ? []
      : [
          {
            value: dukPending ? null : pop ? formatCompact(pop.value) : "–",
            label: "penduduk (Dukcapil)",
            chip: pop?.rank ? `#${pop.rank} dari ${pop.of}${peers}` : null,
          },
          {
            value: dukPending ? null : dens ? formatDecimal(dens.value, dens.value < 100 ? 1 : 0) : "–",
            label: "jiwa/km²",
            chip: dens?.rank ? `#${dens.rank} terpadat${peers}` : null,
          },
        ]),
    ...(data
      ? [
          { value: formatNumber(data.total_variables), label: "indikator BPS", chip: `${formatCompact(data.total_data_points)} titik data` },
          { value: data.year_min && data.year_max ? `${data.year_min}–${data.year_max}` : "–", label: "rentang tahun" },
        ]
      : []),
  ];
  const silhouette =
    kind === "province"
      ? { kind: "provinces" as const, code: dukcapilProvinceCode(domainId) }
      : kind === "regency" && duk
        ? { kind: "regencies" as const, code: duk.region.code }
        : null;

  return (
    <div className="space-y-6">
      {!data ? (
        <HeroSkeleton />
      ) : (
        <>
      <Breadcrumbs items={crumbs} />
      <RegionHero
        eyebrow={kind === "national" ? "Profil nasional" : kind === "province" ? "Profil provinsi" : "Profil kabupaten/kota"}
        name={kind === "regency" ? regionLabel(regionName, badge) : regionName}
        tags={[badge, ...(duk?.region.status && duk.region.status !== badge && kind === "province" ? duk.region.status.split(", ") : [])]}
        code={domainId}
        facts={facts}
        silhouette={silhouette}
      />
        </>
      )}

      {tabs.length > 1 && <StickyTabs tabs={tabs} value={tab} onChange={setTab} />}

      <div id="profile-body" className="scroll-mt-32" />
      {tab === "insight" && kind === "province" ? (
        <ProvinceInsight domainId={domainId} regionName={regionName} />
      ) : tab === "insight" && kind === "regency" ? (
        <RegencyInsight domainId={domainId} regionName={regionName} />
      ) : tab === "wilayah" && kind === "regency" ? (
        <DukcapilDrilldown domainId={domainId} />
      ) : tab === "demografi" ? (
        <DemografiView state={dukState} detail={duk} />
      ) : tab === "profile" && kind !== "national" ? (
        <ProfileView profile={profile} regionLevel={kind} domainId={domainId} />
      ) : !data ? (
        <Panel><Skeleton className="h-3 w-48" /><SkeletonRows rows={8} className="mt-4" /></Panel>
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
                          href={`/variables/${v.variable_id}?region=${domainId}`}
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

  const [kabHref, setKabHref] = useState<string | null>(null);

  useEffect(() => {
    dukcapilApi.regionDetail(code).then(setDetail).catch((e) => setError(String(e)));
  }, [code]);

  // Kab/kota crumb → the BPS profile, via the validated crosswalk (never by code).
  useEffect(() => {
    if (code.length <= 4) return;
    dukcapilApi
      .regencyCrosswalk()
      .then((cw) => {
        const hit = cw.results.find((x) => x.kemendagri_code === code.slice(0, 4));
        if (hit) setKabHref(routes.region(hit.bps_domain_id));
      })
      .catch(() => {});
  }, [code]);

  if (error) return <ErrorState message={error} />;
  if (!detail) return <RegionSkeleton />;

  const r = detail.region;
  const ind = (f: string) => detail.groups.flatMap((g) => g.indicators).find((i) => i.field === f);
  const pop = ind("jumlah_penduduk");
  const dens = ind("pop_density_big");
  const crumbs: Crumb[] = [{ label: "Indonesia", href: routes.region("0000") }];
  if (r.nama_prop && kind !== "province") crumbs.push({ label: titleCase(r.nama_prop), href: provinceHref(code.slice(0, 2)) });
  if (r.nama_kab && code.length > 4) crumbs.push({ label: titleCase(r.nama_kab), href: kabHref ?? undefined });
  if (r.nama_kec && code.length > 6) crumbs.push({ label: titleCase(r.nama_kec), href: routes.region(code.slice(0, 6)) });
  crumbs.push({ label: kind === "village" ? regionLabel(r.name, r.status) : r.name });
  const peerNote = kind === "district" ? " kecamatan" : kind === "village" ? " desa/kel" : "";

  return (
    <div className="space-y-6">
      <Breadcrumbs items={crumbs} />
      <RegionHero
        eyebrow={`Profil ${KIND_LABEL[kind].toLowerCase()} · sumber Dukcapil`}
        name={kind === "village" ? regionLabel(r.name, r.status) : r.name}
        tags={(r.status || KIND_LABEL[kind]).split(", ")}
        code={r.code}
        facts={[
          { value: pop ? formatCompact(pop.value) : "–", label: "penduduk", chip: pop?.rank ? `#${pop.rank} dari ${pop.of}${peerNote}` : null },
          { value: dens ? formatDecimal(dens.value, dens.value < 100 ? 1 : 0) : "–", label: "jiwa/km² (luas BIG)", chip: dens?.rank ? `#${dens.rank} terpadat` : null },
        ]}
        silhouette={kind === "province" ? { kind: "provinces", code } : null}
      />
      <p className="text-sm text-ink-muted">
        Peringkat & persentil terhadap {detail.peer_scope}. BPS tidak menyediakan data pada tingkat ini.
      </p>
      <Panel>
        <DukcapilRegionProfile detail={detail} bare />
      </Panel>
    </div>
  );
}

/** Header + tiles + tab bar + body, at the real page's proportions. */
function RegionSkeleton() {
  return (
    <div className="space-y-6">
      <HeroSkeleton />
      <Skeleton className="h-10 w-full max-w-lg rounded-xl" />
      <Panel><Skeleton className="h-3 w-48" /><SkeletonRows rows={8} className="mt-4" /></Panel>
    </div>
  );
}

function HeroSkeleton() {
  return (
    <div className="space-y-6">
      <header className="border-b border-ink-border pb-5">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="mt-3 h-9 w-72" />
      </header>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        {[0, 1, 2].map((i) => <SkeletonTile key={i} />)}
      </div>
    </div>
  );
}
