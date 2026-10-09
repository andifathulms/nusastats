"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { dukcapilApi, formatNumber, type DukcapilSummary } from "@/lib/api";
import { ErrorState, Panel, SectionTitle, Skeleton, SkeletonRows, SkeletonTile, StatTile } from "@/components/ui";

export default function DukcapilOverviewPage() {
  const [summary, setSummary] = useState<DukcapilSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    dukcapilApi.summary().then(setSummary).catch((e) => setError(String(e)));
  }, []);

  if (error) return <ErrorState message={error} />;
  if (!summary) return <OverviewSkeleton />;

  const totals = summary.national_totals ?? {};
  const maxRegions = Math.max(1, ...summary.by_level.map((l) => l.regions));

  return (
    <div className="space-y-10">
      <section className="relative overflow-hidden rounded-[28px] bg-coal-bg p-8 text-coal-text shadow-lift ring-1 ring-white/5 sm:p-12">
        <div className="pointer-events-none absolute inset-0 bg-royal-weave opacity-50" />
        <div className="relative">
          <div className="font-mono text-[11.5px] uppercase tracking-[0.1em] text-ink-gold">Sumber: Kemendagri / Ditjen Dukcapil</div>
          <h1 className="mt-4 max-w-2xl font-display text-4xl font-medium leading-[1.02] tracking-[-0.02em] text-coal-text sm:text-[56px]">
            Data administrasi kependudukan Indonesia
          </h1>
          <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-coal-muted sm:text-base">
            Rekaman kependudukan administratif dari GIS Dukcapil — hingga tingkat{" "}
            <span className="font-semibold text-coal-text">desa/kelurahan</span>. Setiap angka berasal
            dari respons ArcGIS yang direkam, terpisah dari data BPS.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/dukcapil/analytics"
              className="inline-flex h-11 items-center rounded-full bg-brand-gradient px-6 text-sm font-bold text-white shadow-glow transition-transform hover:-translate-y-0.5"
            >
              Buka analitik →
            </Link>
            <Link
              href="/jelajahi"
              className="inline-flex h-11 items-center rounded-full border border-white/20 px-6 text-sm font-bold text-coal-text transition-colors hover:bg-white/5"
            >
              Jelajahi wilayah
            </Link>
            <Link
              href="/carousel?source=dukcapil&metric=jumlah_penduduk&level=kabupaten"
              className="inline-flex h-11 items-center rounded-full border border-white/20 px-6 text-sm font-bold text-coal-text transition-colors hover:bg-white/5"
            >
              Buat carousel
            </Link>
          </div>
          {summary.period && (
            <div className="mt-5 text-xs text-coal-muted">
              Periode <span className="font-semibold text-coal-text">{summary.period}</span>
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

/** Same shape as the loaded page (hero, four tiles, two panels) so arrival
 *  fills the layout instead of snapping it into place. */
function OverviewSkeleton() {
  return (
    <div className="space-y-10">
      <section className="relative overflow-hidden rounded-[28px] bg-coal-bg p-8 text-coal-text shadow-lift ring-1 ring-white/5 sm:p-12">
        <div className="pointer-events-none absolute inset-0 bg-royal-weave opacity-50" />
        <div className="relative">
          <Skeleton className="h-5 w-64" />
          <Skeleton className="mt-4 h-10 w-full max-w-2xl" />
          <Skeleton className="mt-2 h-10 w-1/2 max-w-sm" />
          <Skeleton className="mt-4 h-4 w-full max-w-xl" />
          <Skeleton className="mt-2 h-4 w-3/4 max-w-lg" />
          <Skeleton className="mt-6 h-10 w-40 rounded-xl" />
        </div>
      </section>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <SkeletonTile key={i} />)}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel><Skeleton className="h-3 w-40" /><SkeletonRows rows={4} className="mt-4" /></Panel>
        <Panel><Skeleton className="h-3 w-40" /><SkeletonRows rows={4} className="mt-4" /></Panel>
      </div>
    </div>
  );
}
