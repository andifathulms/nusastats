"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api, formatNumber, SERIES_COLORS, type Summary } from "@/lib/api";
import { Badge, Panel, SectionTitle, StatTile } from "@/components/ui";

export default function OverviewPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.summary().then(setSummary).catch((e) => setError(String(e)));
  }, []);

  if (error) return <div className="text-ink-muted">Failed to load: {error}</div>;
  if (!summary) return <div className="text-ink-muted">Loading…</div>;

  const levelData = summary.by_admin_level.map((r) => ({
    name: r.label.replace("Regency/Kabupaten-Kota", "Kab/Kota"),
    data_points: r.data_points,
    domains: r.domains,
  }));

  return (
    <div className="space-y-10">
      <section className="relative overflow-hidden rounded-3xl border border-ink-border/70 bg-ink-panel/60 p-8 shadow-panel sm:p-12">
        <div className="pointer-events-none absolute inset-0 bg-brand-radial" />
        <div className="relative">
          <Badge tone="accent">Evidence-backed, not estimated</Badge>
          <h1 className="mt-4 max-w-2xl text-3xl font-semibold tracking-tight text-ink-text sm:text-4xl">
            Indonesian statistics, confirmed by real BPS responses
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-ink-muted sm:text-base">
            Every value here was fetched from the BPS WebAPI and stored with its source response — no
            estimates, no imputation. Browse{" "}
            <span className="font-medium text-ink-text">{formatNumber(summary.variables_with_data)}</span>{" "}
            indicators across national, provincial and kabupaten/kota levels.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/variables"
              className="rounded-xl bg-brand-gradient px-5 py-2.5 text-sm font-medium text-white shadow-glow transition-transform hover:scale-[1.02]"
            >
              Browse variables →
            </Link>
            <Link
              href="/analytics"
              className="rounded-xl border border-ink-border bg-ink-panel2/60 px-5 py-2.5 text-sm font-medium text-ink-text transition-colors hover:border-ink-borderStrong"
            >
              Open analytics
            </Link>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Data points" value={summary.total_data_points} sub="real statistical values" accent="accent" />
        <StatTile
          label="Indicators"
          value={summary.variables_with_data}
          sub={`of ${formatNumber(summary.total_variables)} discovered`}
          accent="accent2"
        />
        <StatTile label="Regions" value={summary.total_domains} sub="national + prov + kab/kota" accent="good" />
        <StatTile
          label="Year range"
          value={summary.year_min && summary.year_max ? `${summary.year_min}–${summary.year_max}` : "–"}
          sub="earliest to latest period"
          accent="warn"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel>
          <SectionTitle hint="how many values at each level">Data points by admin level</SectionTitle>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={levelData} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
              <XAxis dataKey="name" tick={{ fill: "#544c40", fontSize: 12 }} axisLine={{ stroke: "#babba9" }} tickLine={false} />
              <YAxis
                tick={{ fill: "#544c40", fontSize: 12 }}
                axisLine={{ stroke: "#babba9" }}
                tickLine={false}
                tickFormatter={(v) => (v >= 1000 ? `${v / 1000}k` : `${v}`)}
              />
              <Tooltip
                cursor={{ fill: "#e7e7dc" }}
                contentStyle={{ background: "#ffffff", border: "1px solid #babba9", borderRadius: 10, color: "#051220" }}
                formatter={(v: number) => [formatNumber(v), "Data points"]}
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
          <SectionTitle hint="indicators with data, per BPS category">Coverage by category</SectionTitle>
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

      <Panel className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <div className="font-medium text-ink-text">Explore the full catalog</div>
          <div className="text-sm text-ink-muted">
            Search {formatNumber(summary.variables_with_data)} indicators and chart their time series by region.
          </div>
        </div>
        <Link
          href="/variables"
          className="rounded-lg bg-brand-gradient px-4 py-2 text-sm font-medium text-white shadow-glow hover:opacity-90"
        >
          Browse variables →
        </Link>
      </Panel>
    </div>
  );
}
