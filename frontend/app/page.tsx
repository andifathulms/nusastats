"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  api,
  CHART,
  dukcapilApi,
  formatNumber,
  SERIES_COLORS,
  type DukcapilSummary,
  type Summary,
} from "@/lib/api";
import { Badge, Panel, SectionTitle, StatTile } from "@/components/ui";

export default function OverviewPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [duk, setDuk] = useState<DukcapilSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.summary(), dukcapilApi.summary()])
      .then(([s, d]) => {
        setSummary(s);
        setDuk(d);
      })
      .catch((e) => setError(String(e)));
  }, []);

  if (error) return <div className="text-ink-muted">Gagal memuat: {error}</div>;
  if (!summary || !duk) return <div className="text-ink-muted">Memuat…</div>;

  const levelData = summary.by_admin_level.map((r) => ({
    name: r.label.replace("Regency/Kabupaten-Kota", "Kab/Kota"),
    data_points: r.data_points,
  }));
  const totals = duk.national_totals ?? {};
  const dukRegions = duk.by_level.reduce((a, l) => a + l.regions, 0);

  return (
    <div className="space-y-10">
      {/* Hero — dual source. */}
      <section className="relative overflow-hidden rounded-3xl border border-ink-border/70 bg-ink-panel/60 p-8 shadow-panel sm:p-12">
        <div className="pointer-events-none absolute inset-0 bg-brand-radial" />
        <div className="relative">
          <Badge tone="accent">Berbasis bukti, bukan estimasi</Badge>
          <h1 className="mt-4 max-w-2xl font-display text-4xl font-medium leading-[1.1] tracking-tight text-ink-text sm:text-5xl">
            Statistik Indonesia dari dua sumber resmi
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-muted sm:text-base">
            <span className="font-medium text-ink-text">BPS</span> — indikator statistik yang
            dikonfirmasi langsung dari BPS WebAPI, dan{" "}
            <span className="font-medium text-ink-text">Dukcapil</span> — data administrasi
            kependudukan Kemendagri hingga tingkat desa/kelurahan. Setiap angka tersimpan bersama
            respons sumbernya.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/regions"
              className="rounded-xl bg-brand-gradient px-5 py-2.5 text-sm font-medium text-white shadow-glow transition-transform hover:scale-[1.02]"
            >
              Jelajahi wilayah →
            </Link>
            <Link
              href="/variables"
              className="rounded-xl border border-ink-border bg-ink-panel2/60 px-5 py-2.5 text-sm font-medium text-ink-text transition-colors hover:border-ink-borderStrong"
            >
              Katalog variabel BPS
            </Link>
          </div>
        </div>
      </section>

      {/* Two source cards. */}
      <div className="grid items-stretch gap-6 lg:grid-cols-2">
        <SourceCard
          title="Badan Pusat Statistik"
          tag="BPS WebAPI"
          tiles={[
            { label: "Titik data", value: summary.total_data_points, sub: "nilai statistik riil", accent: "accent" },
            {
              label: "Indikator",
              value: summary.variables_with_data,
              sub: `dari ${formatNumber(summary.total_variables)} ditemukan`,
              accent: "accent",
            },
            { label: "Wilayah", value: summary.total_domains, sub: "nasional + prov + kab/kota", accent: "accent" },
            {
              label: "Rentang tahun",
              value: summary.year_min && summary.year_max ? `${summary.year_min}–${summary.year_max}` : "–",
              sub: "periode terlama–terbaru",
              accent: "accent",
            },
          ]}
          links={[
            { href: "/variables", label: "Variabel" },
            { href: "/analytics", label: "Analitik" },
          ]}
        />
        <SourceCard
          title="Ditjen Dukcapil"
          tag="Kemendagri"
          tiles={[
            { label: "Jumlah penduduk", value: totals.jumlah_penduduk ?? "–", sub: "jiwa (nasional)", accent: "accent2" },
            { label: "Kepala keluarga", value: totals.jumlah_kk ?? "–", sub: "KK", accent: "accent2" },
            { label: "Wilayah tercatat", value: dukRegions, sub: "prov → desa/kelurahan", accent: "accent2" },
            {
              label: "Periode",
              value: duk.period ?? "–",
              sub: duk.periods.length > 1 ? `${duk.periods.length} snapshot` : "snapshot terbaru",
              accent: "accent2",
            },
          ]}
          links={[
            { href: "/dukcapil", label: "Ringkasan" },
            { href: "/dukcapil/analytics", label: "Analitik" },
          ]}
        />
      </div>

      {/* BPS breakdowns. */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel>
          <SectionTitle hint="jumlah nilai di tiap tingkat">Titik data per tingkat (BPS)</SectionTitle>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={levelData} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
              <XAxis dataKey="name" tick={{ fill: CHART.axisTick, fontSize: 12 }} axisLine={{ stroke: CHART.axisLine }} tickLine={false} />
              <YAxis
                tick={{ fill: CHART.axisTick, fontSize: 12 }}
                axisLine={{ stroke: CHART.axisLine }}
                tickLine={false}
                tickFormatter={(v) => (v >= 1000 ? `${v / 1000}k` : `${v}`)}
              />
              <Tooltip
                cursor={{ fill: CHART.cursor }}
                contentStyle={{ background: CHART.tooltipBg, border: `1px solid ${CHART.tooltipBorder}`, borderRadius: 10, color: CHART.text }}
                formatter={(v: number) => [formatNumber(v), "Titik data"]}
              />
              <Bar dataKey="data_points" radius={[6, 6, 0, 0]}>
                {levelData.map((_, i) => (
                  <Cell key={i} fill={SERIES_COLORS[i % SERIES_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Panel>

        <Panel>
          <SectionTitle hint="indikator dengan data, per kategori BPS">Cakupan per kategori (BPS)</SectionTitle>
          <div className="space-y-3">
            {summary.by_category.map((c, i) => {
              const pct = c.variables ? Math.round((c.with_data / c.variables) * 100) : 0;
              return (
                <div key={c.category}>
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="text-ink-text">{c.category}</span>
                    <span className="tabular-nums text-ink-muted">
                      {formatNumber(c.with_data)} / {formatNumber(c.variables)}
                    </span>
                  </div>
                  <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-ink-panel2">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${pct}%`, background: SERIES_COLORS[i % SERIES_COLORS.length] }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>
      </div>
    </div>
  );
}

type Tile = { label: string; value: string | number; sub?: string; accent: "accent" | "accent2" | "good" | "warn" };

function SourceCard({
  title,
  tag,
  tiles,
  links,
}: {
  title: string;
  tag: string;
  tiles: Tile[];
  links: { href: string; label: string }[];
}) {
  return (
    <Panel className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-ink-text">{title}</h2>
        <Badge tone="muted">{tag}</Badge>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {tiles.map((t) => (
          <StatTile key={t.label} label={t.label} value={t.value} sub={t.sub} accent={t.accent} />
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {links.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="rounded-lg border border-ink-border bg-ink-panel2/60 px-4 py-2 text-sm font-medium text-ink-text transition-colors hover:border-ink-accent/60"
          >
            {l.label} →
          </Link>
        ))}
      </div>
    </Panel>
  );
}
