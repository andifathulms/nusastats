"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api, formatNumber, type RegionProfile, type RegionVariables } from "@/lib/api";
import { Badge, Panel, SectionTitle, StatTile } from "@/components/ui";

const LEVEL_LABEL: Record<string, string> = {
  national: "National",
  province: "Province",
  regency: "Kabupaten/Kota",
};

export default function RegionDetailPage({ params }: { params: { domainId: string } }) {
  const { domainId } = params;
  const [data, setData] = useState<RegionVariables | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"indicators" | "profile">("indicators");
  const [profile, setProfile] = useState<RegionProfile | null>(null);

  useEffect(() => {
    api
      .regionVariables(domainId)
      .then(setData)
      .catch((e) => setError(String(e)));
  }, [domainId]);

  // Load the profile lazily the first time that tab is opened.
  useEffect(() => {
    if (view === "profile" && !profile) api.regionProfile(domainId).then(setProfile);
  }, [view, profile, domainId]);

  const filtered = useMemo(() => {
    if (!data) return [];
    return data.results.filter((v) => !search || v.name.toLowerCase().includes(search.toLowerCase()));
  }, [data, search]);

  if (error) return <div className="text-ink-muted">Failed to load: {error}</div>;
  if (!data) return <div className="text-ink-muted">Loading…</div>;

  const { region } = data;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/regions" className="text-sm text-ink-muted hover:text-ink-text">
          ← Regions
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold text-ink-text">{region.domain_name}</h1>
          <Badge tone="accent">{LEVEL_LABEL[region.admin_level] ?? region.admin_level}</Badge>
          {region.parent_province_name && (
            <Link href={`/regions/${region.parent_province_id}`} className="text-sm text-ink-muted hover:text-ink-text">
              in {region.parent_province_name}
            </Link>
          )}
          <span className="text-xs text-ink-muted">code {region.domain_id}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatTile label="Indicators" value={data.total_variables} sub="with data for this region" />
        <StatTile label="Data points" value={data.total_data_points} sub="real values stored" />
        <StatTile
          label="Year range"
          value={data.year_min && data.year_max ? `${data.year_min}–${data.year_max}` : "–"}
        />
      </div>

      {region.admin_level !== "national" && (
        <div className="inline-flex rounded-lg border border-ink-border p-1">
          {(["indicators", "profile"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`rounded-md px-4 py-1.5 text-sm capitalize ${
                view === v ? "bg-ink-accent text-white" : "text-ink-muted hover:text-ink-text"
              }`}
            >
              {v === "profile" ? "Profile (how it ranks)" : "Indicators"}
            </button>
          ))}
        </div>
      )}

      {view === "profile" && region.admin_level !== "national" ? (
        <ProfileView profile={profile} regionLevel={region.admin_level} domainId={domainId} />
      ) : (
      <div>
        <SectionTitle hint="click one to chart it for this region">Available indicators</SectionTitle>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter indicators…"
          className="mb-3 w-full rounded-lg border border-ink-border bg-ink-panel px-4 py-2.5 text-sm text-ink-text placeholder:text-ink-muted focus:border-ink-accent focus:outline-none"
        />
        <Panel className="p-0 overflow-hidden">
          <div className="max-h-[32rem] overflow-auto scroll-thin">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-ink-panel">
                <tr className="border-b border-ink-border text-left text-xs uppercase tracking-wide text-ink-muted">
                  <th className="px-4 py-3 font-medium">Indicator</th>
                  <th className="px-4 py-3 font-medium">Category</th>
                  <th className="px-4 py-3 font-medium text-right">Years</th>
                  <th className="px-4 py-3 font-medium text-right">Points</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((v) => (
                  <tr key={v.variable_id} className="border-b border-ink-border/50 hover:bg-ink-panel2/40">
                    <td className="px-4 py-2.5">
                      {/* Deep-link into the explorer, pre-focused on this region. */}
                      <Link
                        href={`/variables/${v.variable_id}?region=${region.domain_id}`}
                        className="text-ink-accent hover:underline"
                      >
                        {v.name}
                      </Link>
                      {v.unit && <span className="ml-2 text-xs text-ink-muted">({v.unit})</span>}
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge>{v.subject_category}</Badge>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-ink-muted">
                      {v.year_min && v.year_max ? `${v.year_min}–${v.year_max}` : "–"}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-ink-text">
                      {formatNumber(v.data_point_count)}
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-ink-muted">
                      No indicators match.
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

function ProfileView({
  profile,
  regionLevel,
  domainId,
}: {
  profile: RegionProfile | null;
  regionLevel: string;
  domainId: string;
}) {
  if (!profile) return <div className="text-ink-muted">Computing percentile ranks…</div>;
  const peerLabel = regionLevel === "province" ? "provinces" : "kabupaten/kota";
  return (
    <div>
      <SectionTitle hint={`percentile vs other ${peerLabel}, latest year each · strongest first`}>
        How {profile.region.domain_name} ranks
      </SectionTitle>
      <Panel className="p-0 overflow-hidden">
        <div className="max-h-[36rem] divide-y divide-ink-border/40 overflow-auto scroll-thin">
          {profile.results.map((r) => {
            const pct = r.percentile ?? 0;
            const color = pct >= 66 ? "#4dd0a7" : pct >= 33 ? "#f2b34e" : "#e5686f";
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
                        <span className="text-ink-text">{pct}th pct</span> · #{r.rank}/{r.of}
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
            <div className="px-4 py-8 text-center text-ink-muted">No rankable indicators for this region.</div>
          )}
        </div>
      </Panel>
    </div>
  );
}
