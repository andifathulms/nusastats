"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { dukcapilApi, formatNumber, type DukcapilSummary } from "@/lib/api";
import { Badge, Panel, SectionTitle, StatTile } from "@/components/ui";

export default function DukcapilOverviewPage() {
  const [summary, setSummary] = useState<DukcapilSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    dukcapilApi.summary().then(setSummary).catch((e) => setError(String(e)));
  }, []);

  if (error) return <div className="text-ink-muted">Gagal memuat: {error}</div>;
  if (!summary) return <div className="text-ink-muted">Memuat…</div>;

  const totals = summary.national_totals ?? {};
  const maxRegions = Math.max(1, ...summary.by_level.map((l) => l.regions));

  return (
    <div className="space-y-10">
      <section className="relative overflow-hidden rounded-3xl border border-ink-border/70 bg-ink-panel/60 p-8 shadow-panel sm:p-12">
        <div className="pointer-events-none absolute inset-0 bg-brand-radial" />
        <div className="relative">
          <Badge tone="accent">Sumber: Kemendagri / Ditjen Dukcapil</Badge>
          <h1 className="mt-4 max-w-2xl font-display text-4xl font-medium leading-[1.1] tracking-tight text-ink-text sm:text-5xl">
            Data administrasi kependudukan Indonesia
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-ink-muted sm:text-base">
            Rekaman kependudukan administratif dari GIS Dukcapil — hingga tingkat{" "}
            <span className="font-medium text-ink-text">desa/kelurahan</span>. Setiap angka berasal
            dari respons ArcGIS yang direkam, terpisah dari data BPS.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/dukcapil/analytics"
              className="rounded-xl bg-brand-gradient px-5 py-2.5 text-sm font-medium text-white shadow-glow transition-transform hover:scale-[1.02]"
            >
              Buka analitik →
            </Link>
            <Link
              href="/regions"
              className="rounded-xl border border-ink-border bg-ink-panel2/60 px-5 py-2.5 text-sm font-medium text-ink-text transition-colors hover:border-ink-borderStrong"
            >
              Jelajahi wilayah
            </Link>
          </div>
          {summary.period && (
            <div className="mt-5 text-xs text-ink-muted">
              Periode <span className="font-medium text-ink-text">{summary.period}</span>
              {summary.periods.length > 1 && <span> · {summary.periods.length} snapshot</span>}
              {summary.last_fetched_at && (
                <span> · direkam {new Date(summary.last_fetched_at).toLocaleDateString("id-ID")}</span>
              )}
            </div>
          )}
        </div>
      </section>

      {/* National headline totals (summed from provinces). */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Jumlah Penduduk" value={totals.jumlah_penduduk ?? "–"} sub="jiwa (nasional)" accent="accent" />
        <StatTile label="Kepala Keluarga" value={totals.jumlah_kk ?? "–"} sub="KK" accent="accent2" />
        <StatTile label="Laki-laki" value={totals.pria ?? "–"} sub="jiwa" accent="good" />
        <StatTile label="Perempuan" value={totals.wanita ?? "–"} sub="jiwa" accent="warn" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel>
          <SectionTitle hint="jumlah wilayah per tingkat administrasi">Cakupan wilayah</SectionTitle>
          <div className="space-y-3">
            {summary.by_level.map((l) => (
              <div key={l.level}>
                <div className="flex items-baseline justify-between text-sm">
                  <span className="text-ink-text">{l.label}</span>
                  <span className="tabular-nums text-ink-muted">{formatNumber(l.regions)}</span>
                </div>
                <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-ink-panel2">
                  <div
                    className="h-full rounded-full bg-brand-gradient transition-all"
                    style={{ width: `${Math.round((l.regions / maxRegions) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel className="flex flex-col justify-between gap-4">
          <div>
            <SectionTitle hint="peristiwa vital tercatat">Peristiwa vital (nasional)</SectionTitle>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-xs uppercase tracking-wide text-ink-muted">Kelahiran</div>
                <div className="mt-1 text-2xl font-semibold tabular-nums text-ink-text">
                  {formatNumber(totals.jml_lahir)}
                </div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-ink-muted">Kematian</div>
                <div className="mt-1 text-2xl font-semibold tabular-nums text-ink-text">
                  {formatNumber(totals.jml_meninggal)}
                </div>
              </div>
            </div>
          </div>
          <Link
            href="/dukcapil/analytics"
            className="rounded-lg bg-brand-gradient px-4 py-2 text-center text-sm font-medium text-white shadow-glow hover:opacity-90"
          >
            Bandingkan antar-wilayah →
          </Link>
        </Panel>
      </div>
    </div>
  );
}
