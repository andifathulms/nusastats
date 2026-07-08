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
import { SERIES_COLORS } from "@/lib/api";

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
    return <div className="flex h-[320px] items-center justify-center text-sm text-ink-muted">No data to chart.</div>;
  }
  return (
    <ResponsiveContainer width="100%" height={340}>
      <LineChart data={rows} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
        <CartesianGrid stroke="#1b2540" vertical={false} />
        <XAxis dataKey="year" tick={{ fill: "#9aa7c2", fontSize: 12 }} axisLine={{ stroke: "#26314f" }} tickLine={false} />
        <YAxis
          tick={{ fill: "#9aa7c2", fontSize: 12 }}
          axisLine={{ stroke: "#26314f" }}
          tickLine={false}
          width={64}
          tickFormatter={(v) => (Math.abs(v) >= 1000 ? `${(v / 1000).toLocaleString()}k` : `${v}`)}
        />
        <Tooltip
          contentStyle={{ background: "#141b2e", border: "1px solid #26314f", borderRadius: 8, color: "#e6ebf5" }}
          labelStyle={{ color: "#9aa7c2" }}
          formatter={(v: number, name: string) => [`${v?.toLocaleString?.() ?? v}${unit ? ` ${unit}` : ""}`, name]}
        />
        <Legend wrapperStyle={{ fontSize: 12, color: "#9aa7c2" }} />
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
