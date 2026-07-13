"use client";

import { useEffect, useState } from "react";
import { djpkApi, formatRupiah, type DjpkRegionDetail } from "@/lib/api";
import { Badge, Panel } from "@/components/ui";
import { GROUP_LABEL } from "@/components/keuangan/controls";

// Modal overlay showing one region's full APBD tree for a scope, each line with
// anggaran / realisasi / % serapan and its rank among peers.
export function KeuanganRegionProfile({
  code,
  tahun,
  onClose,
}: {
  code: string;
  tahun: number;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<DjpkRegionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDetail(null);
    setError(null);
    djpkApi.regionDetail(code, { tahun: String(tahun) }).then(setDetail).catch((e) => setError(String(e)));
  }, [code, tahun]);

  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-8" onClick={onClose}>
      <div className="w-full max-w-3xl" onClick={(e) => e.stopPropagation()}>
        <Panel glow>
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-semibold text-ink-text">{detail?.region.name ?? "Memuat…"}</h3>
                {detail && <Badge tone="muted">{detail.region.level === "province" ? "Provinsi" : "Kab/Kota"}</Badge>}
                {detail?.region.kemendagri_code && <Badge tone="accent">{detail.region.kemendagri_code}</Badge>}
              </div>
              {detail && (
                <p className="mt-1 text-xs text-ink-muted">
                  APBD {detail.scope.tahun} · realisasi · peringkat dihitung terhadap {detail.peer_scope}.
                </p>
              )}
            </div>
            <button onClick={onClose} className="rounded-lg border border-ink-border px-2 py-1 text-xs text-ink-muted hover:text-ink-text">Tutup</button>
          </div>

          {error && <div className="text-sm text-ink-muted">Gagal memuat: {error}</div>}
          {!error && !detail && <div className="text-sm text-ink-muted">Memuat…</div>}

          {detail && (
            <div className="space-y-5">
              {detail.ratios.length > 0 && (
                <div className="rounded-xl border border-ink-border/70 bg-ink-panel2/40 p-3">
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-accent">Rasio &amp; Kinerja</div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {detail.ratios.map((x) => (
                      <div key={x.akun_key} title={x.desc}>
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="truncate text-sm text-ink-text">{x.label_id}</span>
                          <span className="shrink-0 text-sm font-semibold tabular-nums text-ink-text">
                            {x.value.toLocaleString("id-ID", { maximumFractionDigits: 1 })}%
                          </span>
                        </div>
                        {x.percentile != null && (
                          <div className="mt-1 flex items-center gap-2">
                            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink-panel2">
                              <div className="h-full bg-brand-gradient" style={{ width: `${x.percentile}%` }} />
                            </div>
                            <span className="w-14 shrink-0 text-right text-[10px] text-ink-muted">#{x.rank}/{x.of}</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {detail.groups.map((g) => (
                <div key={g.group}>
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-accent">{GROUP_LABEL[g.group] ?? g.group}</div>
                  <div className="space-y-1.5">
                    {g.lines.map((l, i) => (
                      <div key={`${l.akun_key}-${i}`} className="text-sm">
                        <div className="flex items-center justify-between gap-2">
                          <span className={`truncate ${l.parent_key ? "pl-3 text-ink-muted" : "font-medium text-ink-text"}`} title={l.label_id}>
                            {l.label_id}
                          </span>
                          <span className="shrink-0 tabular-nums text-ink-text">
                            {formatRupiah(l.realisasi)}
                            {l.persentase != null && (
                              <span className="ml-1.5 text-[10px] font-normal text-ink-muted">{l.persentase.toLocaleString("id-ID", { maximumFractionDigits: 0 })}%</span>
                            )}
                          </span>
                        </div>
                        {l.percentile != null && (
                          <div className="mt-0.5 flex items-center gap-2">
                            <div className="h-1 flex-1 overflow-hidden rounded-full bg-ink-panel2">
                              <div className="h-full bg-brand-gradient" style={{ width: `${l.percentile}%` }} />
                            </div>
                            <span className="w-16 shrink-0 text-right text-[10px] text-ink-muted">#{l.rank}/{l.of}</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
