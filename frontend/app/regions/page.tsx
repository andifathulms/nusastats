"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api, type Region } from "@/lib/api";
import { Panel } from "@/components/ui";

export default function RegionsPage() {
  const [level, setLevel] = useState<"province" | "regency">("province");
  const [regions, setRegions] = useState<Region[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api
      .regions({ admin_level: level })
      .then(setRegions)
      .finally(() => setLoading(false));
  }, [level]);

  const filtered = useMemo(
    () => regions.filter((r) => !search || r.domain_name.toLowerCase().includes(search.toLowerCase())),
    [regions, search]
  );

  // Group kabupaten/kota under their province for readability.
  const grouped = useMemo(() => {
    if (level !== "regency") return null;
    const byProv = new Map<string, Region[]>();
    for (const r of filtered) {
      const key = r.parent_province_name || "—";
      byProv.set(key, [...(byProv.get(key) ?? []), r]);
    }
    return [...byProv.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered, level]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-ink-text">Regions</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Pick a province or kabupaten/kota to see every indicator that has data for it.
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="inline-flex rounded-lg border border-ink-border p-1">
          {(["province", "regency"] as const).map((l) => (
            <button
              key={l}
              onClick={() => {
                setLevel(l);
                setSearch("");
              }}
              className={`rounded-md px-3 py-1.5 text-sm ${
                level === l ? "bg-ink-accent text-white" : "text-ink-muted hover:text-ink-text"
              }`}
            >
              {l === "province" ? "Provinces (34)" : "Kabupaten/Kota (514)"}
            </button>
          ))}
        </div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter by name…"
          className="flex-1 rounded-lg border border-ink-border bg-ink-panel px-4 py-2 text-sm text-ink-text placeholder:text-ink-muted focus:border-ink-accent focus:outline-none"
        />
      </div>

      {loading && <div className="text-ink-muted">Loading…</div>}

      {!loading && level === "province" && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {filtered.map((r) => (
            <RegionCard key={r.domain_id} region={r} />
          ))}
        </div>
      )}

      {!loading && level === "regency" && grouped && (
        <div className="space-y-6">
          {grouped.map(([prov, list]) => (
            <div key={prov}>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">{prov}</div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                {list.map((r) => (
                  <RegionCard key={r.domain_id} region={r} small />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function RegionCard({ region, small }: { region: Region; small?: boolean }) {
  return (
    <Link href={`/regions/${region.domain_id}`}>
      <Panel className={`transition-colors hover:border-ink-accent/60 ${small ? "p-3" : ""}`}>
        <div className={`font-medium text-ink-text ${small ? "text-sm" : ""}`}>{region.domain_name}</div>
        <div className="mt-0.5 text-xs text-ink-muted">code {region.domain_id}</div>
      </Panel>
    </Link>
  );
}
