"use client";

import { useEffect, useState } from "react";
import { dukcapilApi, formatNumber, regionLabel, type DukcapilBridge, type DukcapilRank } from "@/lib/api";
import { Badge, Panel } from "@/components/ui";

type VillageRow = DukcapilRank["results"][number];

/** On a BPS regency page, drill into the Dukcapil administrative tree
 *  (kecamatan -> desa/kelurahan) for the matched regency. */
export function DukcapilDrilldown({ domainId }: { domainId: string }) {
  const [bridge, setBridge] = useState<DukcapilBridge | null>(null);
  const [openKec, setOpenKec] = useState<string | null>(null);
  const [villages, setVillages] = useState<Record<string, VillageRow[]>>({});

  useEffect(() => {
    setBridge(null);
    setOpenKec(null);
    setVillages({});
    dukcapilApi.regencyBridge(domainId).then(setBridge);
  }, [domainId]);

  const toggle = (code: string) => {
    if (openKec === code) return setOpenKec(null);
    setOpenKec(code);
    if (!villages[code]) {
      dukcapilApi
        .rank({ indicator: "jumlah_penduduk", level: "village", kec: code, order: "desc", limit: "500" })
        .then((r) => setVillages((v) => ({ ...v, [code]: r.results })));
    }
  };

  if (!bridge) return <div className="text-sm text-ink-muted">Memuat data Dukcapil…</div>;
  if (!bridge.dukcapil)
    return (
      <Panel>
        <div className="text-sm text-ink-muted">Tidak ada padanan wilayah Dukcapil untuk kab/kota ini.</div>
      </Panel>
    );

  const d = bridge.dukcapil;
  return (
    <div className="space-y-4">
      <Panel className="flex flex-wrap items-center gap-x-8 gap-y-2">
        <div>
          <div className="flex items-center gap-2">
            <Badge tone="accent">Sumber: Dukcapil</Badge>
          </div>
          <div className="mt-1 text-lg font-semibold text-ink-text">{regionLabel(d.name, d.status)}</div>
        </div>
        <Stat label="Penduduk" value={formatNumber(d.population)} />
        <Stat label="Kecamatan" value={formatNumber(d.district_count)} />
        <Stat label="Desa/Kelurahan" value={formatNumber(d.village_count)} />
      </Panel>

      <Panel className="overflow-hidden p-0">
        <div className="max-h-[34rem] divide-y divide-ink-border/50 overflow-auto scroll-thin">
          {bridge.districts.map((kec) => (
            <div key={kec.code}>
              <button
                onClick={() => toggle(kec.code)}
                className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm hover:bg-ink-panel2/40"
              >
                <span className="flex items-center gap-2 truncate">
                  <span className="w-3 shrink-0 text-ink-muted">{openKec === kec.code ? "▾" : "▸"}</span>
                  <span className="truncate text-ink-text">{kec.name}</span>
                  <span className="shrink-0 text-xs text-ink-muted">· {kec.village_count} desa/kel</span>
                </span>
                <span className="shrink-0 tabular-nums text-ink-muted">{formatNumber(kec.population)}</span>
              </button>
              {openKec === kec.code && (
                <div className="bg-ink-panel2/30 px-4 py-2">
                  {!villages[kec.code] ? (
                    <div className="text-xs text-ink-muted">Memuat…</div>
                  ) : (
                    <div className="grid grid-cols-1 gap-x-6 gap-y-0.5 sm:grid-cols-2 lg:grid-cols-3">
                      {villages[kec.code].map((v) => (
                        <div key={v.domain_id} className="flex items-baseline justify-between gap-2 text-xs">
                          <span className="truncate text-ink-text">{regionLabel(v.domain_name, v.status)}</span>
                          <span className="shrink-0 tabular-nums text-ink-muted">{formatNumber(v.value)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </Panel>
      <p className="text-xs text-ink-muted">Penduduk per wilayah dari data Dukcapil (Kemendagri).</p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-ink-muted">{label}</div>
      <div className="text-lg font-semibold tabular-nums text-ink-text">{value}</div>
    </div>
  );
}
