"use client";

import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export type BarDatum = { label: string; value: number; highlight?: boolean };

export function HorizontalBars({
  data,
  unit,
  colorPos = "#5b8cff",
  colorNeg,
}: {
  data: BarDatum[];
  unit?: string;
  colorPos?: string;
  colorNeg?: string;
}) {
  if (!data.length) {
    return <div className="flex h-40 items-center justify-center text-sm text-ink-muted">No data.</div>;
  }
  const height = Math.max(160, data.length * 26 + 20);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 48, bottom: 4, left: 8 }}>
        <XAxis
          type="number"
          tick={{ fill: "#9aa7c2", fontSize: 11 }}
          axisLine={{ stroke: "#26314f" }}
          tickLine={false}
          tickFormatter={(v) => (Math.abs(v) >= 1000 ? `${(v / 1000).toLocaleString()}k` : `${v}`)}
        />
        <YAxis
          type="category"
          dataKey="label"
          width={150}
          tick={{ fill: "#c7d0e4", fontSize: 12 }}
          axisLine={{ stroke: "#26314f" }}
          tickLine={false}
        />
        <Tooltip
          cursor={{ fill: "#1b2540" }}
          contentStyle={{ background: "#141b2e", border: "1px solid #26314f", borderRadius: 8, color: "#e6ebf5" }}
          formatter={(v: number) => [`${v?.toLocaleString?.() ?? v}${unit ? ` ${unit}` : ""}`, ""]}
        />
        <Bar dataKey="value" radius={[0, 4, 4, 0]}>
          {data.map((d, i) => (
            <Cell
              key={i}
              fill={colorNeg && d.value < 0 ? colorNeg : d.highlight ? "#4dd0a7" : colorPos}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
