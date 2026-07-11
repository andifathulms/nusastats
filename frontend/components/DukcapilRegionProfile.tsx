"use client";

import { formatNumber, titleCase, type DukcapilRegionDetail } from "@/lib/api";
import { Badge, Panel } from "@/components/ui";
import { RegionCharts } from "@/components/RegionCharts";

/**
 * A Dukcapil region's full demographic profile: charts + every indicator group
 * with the region's rank/percentile among peers.
 *
 * - default: wrapped in a glowing Panel with a header (and an optional close
 *   button when `onClose` is given) — used inline in the Dukcapil analytics tool.
 * - `bare`: just the charts + indicator grid, no Panel/header — used embedded in
 *   the unified Wilayah profile's "Demografi (Dukcapil)" section.
 */
export function DukcapilRegionProfile({
  detail,
  onClose,
  bare = false,
}: {
  detail: DukcapilRegionDetail;
  onClose?: () => void;
  bare?: boolean;
}) {
  const body = (
    <>
      <RegionCharts detail={detail} />
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {detail.groups.map((g) => (
          <div key={g.group}>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-accent">{g.group}</div>
            <div className="space-y-1.5">
              {g.indicators.map((i) => (
                <div key={i.field} className="text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-ink-muted">{i.label_id}</span>
                    <span className="shrink-0 tabular-nums text-ink-text">
                      {formatNumber(i.value)}
                      {i.derived && i.unit && (
                        <span className="ml-1 text-[10px] font-normal text-ink-muted">{i.unit}</span>
                      )}
                    </span>
                  </div>
                  {i.percentile !== null && (
                    <div className="mt-0.5 flex items-center gap-2">
                      <div className="h-1 flex-1 overflow-hidden rounded-full bg-ink-panel2">
                        <div className="h-full bg-brand-gradient" style={{ width: `${i.percentile}%` }} />
                      </div>
                      <span className="w-16 shrink-0 text-right text-[10px] text-ink-muted">
                        #{i.rank}/{i.of}
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );

  if (bare) return body;

  const r = detail.region;
  const scope = [r.nama_kec, r.nama_kab, r.nama_prop].filter(Boolean).map(titleCase).join(", ");
  return (
    <Panel glow>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold text-ink-text">{r.name}</h3>
            {r.status && <Badge tone="muted">{r.status}</Badge>}
          </div>
          {scope && <div className="mt-0.5 text-xs text-ink-muted">{scope}</div>}
          <p className="mt-1 text-xs text-ink-muted">
            Peringkat & persentil dihitung terhadap {detail.peer_scope}.
          </p>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="rounded-lg border border-ink-border px-2 py-1 text-xs text-ink-muted hover:text-ink-text"
          >
            Tutup
          </button>
        )}
      </div>
      {body}
    </Panel>
  );
}
