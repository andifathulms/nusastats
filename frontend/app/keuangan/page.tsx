"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { djpkApi, formatRupiah, type DjpkRank, type DjpkSummary } from "@/lib/api";
import { Badge, Panel, SectionTitle, StatTile } from "@/components/ui";

export default function KeuanganOverviewPage() {
  const [summary, setSummary] = useState<DjpkSummary | null>(null);
  const [topPad, setTopPad] = useState<DjpkRank | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    djpkApi.summary().then(setSummary).catch((e) => setError(String(e)));
    djpkApi
      .rank({ akun: "pad", level: "province", measure: "realisasi", limit: "10" })
      .then(setTopPad)
      .catch(() => {});
  }, []);

  if (error) return <div className="text-ink-muted">Gagal memuat: {error}</div>;
  if (!summary) return <div className="text-ink-muted">Memuat…</div>;

  const totals = summary.national_totals ?? {};
  const maxRegions = Math.max(1, ...summary.by_level.map((l) => l.regions));
  const maxPad = Math.max(1, ...(topPad?.results ?? []).map((r) => r.value));

  return (
    <div className="space-y-10">
      <section className="relative overflow-hidden rounded-3xl border border-ink-border/70 bg-ink-panel/60 p-8 shadow-panel sm:p-12">
        <div className="pointer-events-none absolute inset-0 bg-brand-radial" />
        <div className="relative">
          <Badge tone="accent">Sumber: Kemenkeu / DJPK–SIKD</Badge>
          <h1 className="mt-4 max-w-2xl font-display text-4xl font-medium leading-[1.1] tracking-tight text-ink-text sm:text-5xl">
            Keuangan daerah: APBD &amp; PAD per wilayah
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-ink-muted sm:text-base">
            Realisasi APBD tiap provinsi dan kabupaten/kota — Pendapatan Asli Daerah, transfer,
            belanja, dan pembiayaan. Setiap angka berasal dari ekspor resmi portal SIKD DJPK,
            terpisah dari data BPS dan Dukcapil.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/keuangan/analytics"
              className="rounded-xl bg-brand-gradient px-5 py-2.5 text-sm font-medium text-white shadow-glow transition-transform hover:scale-[1.02]"
            >
              Buka analitik →
            </Link>
          </div>
          <div className="mt-5 text-xs text-ink-muted">
            Tahun anggaran <span className="font-medium text-ink-text">{summary.scope.tahun}</span>
            {summary.years.length > 1 && <span> · {summary.years.length} tahun</span>}
            {summary.last_fetched_at && (
              <span> · direkam {new Date(summary.last_fetched_at).toLocaleDateString("id-ID")}</span>
            )}
          </div>
        </div>
      </section>

      {/* National headline totals (summed from provinces). */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Pendapatan Daerah" value={formatRupiah(totals.pendapatan_daerah)} sub="realisasi provinsi (nasional)" accent="accent" />
        <StatTile label="PAD" value={formatRupiah(totals.pad)} sub="Pendapatan Asli Daerah" accent="good" />
        <StatTile label="Belanja Daerah" value={formatRupiah(totals.belanja_daerah)} sub="realisasi" accent="accent2" />
        <StatTile label="Pembiayaan" value={formatRupiah(totals.pembiayaan_daerah)} sub="netto" accent="warn" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel>
          <SectionTitle hint="jumlah wilayah dengan data APBD">Cakupan wilayah</SectionTitle>
          <div className="space-y-3">
            {summary.by_level.map((l) => (
              <div key={l.level}>
                <div className="flex items-baseline justify-between text-sm">
                  <span className="text-ink-text">{l.label}</span>
                  <span className="tabular-nums text-ink-muted">{l.regions}</span>
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
            <SectionTitle hint={`PAD realisasi ${summary.scope.tahun} · provinsi teratas`}>
              10 provinsi PAD tertinggi
            </SectionTitle>
            <div className="space-y-1.5">
              {(topPad?.results ?? []).map((r) => (
                <div key={r.domain_id} className="flex items-center gap-3">
                  <div className="w-5 shrink-0 text-right text-xs tabular-nums text-ink-muted">{r.rank}</div>
                  <div className="w-40 shrink-0 truncate text-sm text-ink-text" title={r.domain_name}>
                    {r.domain_name}
                  </div>
                  <div className="relative h-4 flex-1 overflow-hidden rounded bg-ink-panel2">
                    <div className="h-full rounded bg-brand-gradient" style={{ width: `${Math.round((r.value / maxPad) * 100)}%` }} />
                  </div>
                  <div className="w-20 shrink-0 text-right text-sm tabular-nums text-ink-text">{formatRupiah(r.value)}</div>
                </div>
              ))}
            </div>
          </div>
          <Link
            href="/keuangan/analytics"
            className="rounded-lg bg-brand-gradient px-4 py-2 text-center text-sm font-medium text-white shadow-glow hover:opacity-90"
          >
            Peringkat, korelasi, peta &amp; pertumbuhan →
          </Link>
        </Panel>
      </div>
    </div>
  );
}
