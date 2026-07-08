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
import { Panel, SectionTitle, StatTile } from "@/components/ui";

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
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-ink-text">Indonesian statistics, confirmed by evidence</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-muted">
          Every value here was fetched from the BPS WebAPI and stored with its source response — no
          estimates, no imputation. Browse {formatNumber(summary.variables_with_data)} indicators across
          national, provincial and kabupaten/kota levels.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Data points" value={summary.total_data_points} sub="real statistical values" />
        <StatTile
          label="Indicators"
          value={summary.variables_with_data}
          sub={`of ${formatNumber(summary.total_variables)} discovered`}
        />
        <StatTile label="Regions" value={summary.total_domains} sub="national + prov + kab/kota" />
        <StatTile
          label="Year range"
          value={summary.year_min && summary.year_max ? `${summary.year_min}–${summary.year_max}` : "–"}
          sub="earliest to latest period"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel>
          <SectionTitle hint="how many values at each level">Data points by admin level</SectionTitle>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={levelData} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
              <XAxis dataKey="name" tick={{ fill: "#9aa7c2", fontSize: 12 }} axisLine={{ stroke: "#26314f" }} tickLine={false} />
              <YAxis
                tick={{ fill: "#9aa7c2", fontSize: 12 }}
                axisLine={{ stroke: "#26314f" }}
                tickLine={false}
                tickFormatter={(v) => (v >= 1000 ? `${v / 1000}k` : `${v}`)}
              />
              <Tooltip
                cursor={{ fill: "#1b2540" }}
                contentStyle={{ background: "#141b2e", border: "1px solid #26314f", borderRadius: 8, color: "#e6ebf5" }}
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
                      className="h-full rounded-full"
                      style={{ width: `${pct}%`, background: SERIES_COLORS[i % SERIES_COLORS.length] }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>
      </div>

      <Panel className="flex items-center justify-between">
        <div>
          <div className="text-ink-text font-medium">Explore the full catalog</div>
          <div className="text-sm text-ink-muted">
            Search {formatNumber(summary.variables_with_data)} indicators and chart their time series by region.
          </div>
        </div>
        <Link
          href="/variables"
          className="rounded-lg bg-ink-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          Browse variables →
        </Link>
      </Panel>
    </div>
  );
}
