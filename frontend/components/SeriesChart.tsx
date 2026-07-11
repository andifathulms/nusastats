"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CHART, SERIES_COLORS } from "@/lib/api";

export type SeriesEntity = { key: string; label: string };

// `rows` is already pivoted: [{ year, [entity.key]: value, ... }, ...]
export function SeriesChart({
  rows,
  entities,
  unit,
}: {
  rows: Record<string, number | null>[];
  entities: SeriesEntity[];
  unit?: string;
}) {
  if (!rows.length || !entities.length) {
    return <div className="flex h-[320px] items-center justify-center text-sm text-ink-muted">Tidak ada data untuk digambar.</div>;
  }
  return (
    <ResponsiveContainer width="100%" height={340}>
      <LineChart data={rows} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
        <CartesianGrid stroke={CHART.grid} vertical={false} />
        <XAxis dataKey="year" tick={{ fill: CHART.axisTick, fontSize: 12 }} axisLine={{ stroke: CHART.axisLine }} tickLine={false} />
        <YAxis
          tick={{ fill: CHART.axisTick, fontSize: 12 }}
          axisLine={{ stroke: CHART.axisLine }}
          tickLine={false}
          width={64}
          tickFormatter={(v) => (Math.abs(v) >= 1000 ? `${(v / 1000).toLocaleString()}k` : `${v}`)}
        />
        <Tooltip
          contentStyle={{ background: CHART.tooltipBg, border: `1px solid ${CHART.tooltipBorder}`, borderRadius: 8, color: CHART.text }}
          labelStyle={{ color: CHART.axisTick }}
          formatter={(v: number, name: string) => [`${v?.toLocaleString?.() ?? v}${unit ? ` ${unit}` : ""}`, name]}
        />
        <Legend wrapperStyle={{ fontSize: 12, color: CHART.axisTick }} />
        {entities.map((e, i) => (
          <Line
            key={e.key}
            type="monotone"
            dataKey={e.key}
            name={e.label}
            stroke={SERIES_COLORS[i % SERIES_COLORS.length]}
            strokeWidth={2}
            dot={false}
            connectNulls
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
