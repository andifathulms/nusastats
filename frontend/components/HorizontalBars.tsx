"use client";

import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CHART } from "@/lib/api";

export type BarDatum = { label: string; value: number; highlight?: boolean; color?: string; sub?: string };

function BarTooltip({ active, payload, unit }: { active?: boolean; payload?: any[]; unit?: string }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload as BarDatum;
  return (
    <div className="rounded-lg border border-ink-border bg-ink-panel px-3 py-2 text-xs shadow-panel">
      <div className="font-medium text-ink-text">{d.label}</div>
      {d.sub && <div className="mt-0.5 text-ink-muted">{d.sub}</div>}
      <div className="mt-1 tabular-nums text-ink-text">
        {d.value?.toLocaleString?.() ?? d.value}
        {unit ? ` ${unit}` : ""}
      </div>
    </div>
  );
}

export function HorizontalBars({
  data,
  unit,
  colorPos = CHART.accent,
  colorNeg,
}: {
  data: BarDatum[];
  unit?: string;
  colorPos?: string;
  colorNeg?: string;
}) {
  if (!data.length) {
    return <div className="flex h-40 items-center justify-center text-sm text-ink-muted">Tidak ada data.</div>;
  }
  const height = Math.max(160, data.length * 26 + 20);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 48, bottom: 4, left: 8 }}>
        <XAxis
          type="number"
          tick={{ fill: CHART.axisTick, fontSize: 11 }}
          axisLine={{ stroke: CHART.axisLine }}
          tickLine={false}
          tickFormatter={(v) => (Math.abs(v) >= 1000 ? `${(v / 1000).toLocaleString()}k` : `${v}`)}
        />
        <YAxis
          type="category"
          dataKey="label"
          width={150}
          tick={{ fill: CHART.text, fontSize: 12 }}
          axisLine={{ stroke: CHART.axisLine }}
          tickLine={false}
        />
        <Tooltip cursor={{ fill: CHART.cursor }} content={<BarTooltip unit={unit} />} />
        <Bar dataKey="value" radius={[0, 4, 4, 0]}>
          {data.map((d, i) => (
            <Cell
              key={i}
              fill={d.color ?? (colorNeg && d.value < 0 ? colorNeg : d.highlight ? CHART.good : colorPos)}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
