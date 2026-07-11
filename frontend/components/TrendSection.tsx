"use client";

import { useEffect, useState } from "react";
import {
  Area,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
} from "recharts";
import { api, CHART, formatNumber, type Dimensions, type Trend } from "@/lib/api";
import { Panel, SectionTitle, StatTile } from "@/components/ui";
import { IndicatorPicker, type PickedVariable } from "@/components/IndicatorPicker";

export function TrendSection() {
  const [variable, setVariable] = useState<PickedVariable | null>(null);
  const [dims, setDims] = useState<Dimensions | null>(null);
  const [turvarId, setTurvarId] = useState("");
  const [data, setData] = useState<Trend | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.variables({ keyword: "Angka Harapan Hidup" }).then((d) => {
      const v = d.results[0];
      if (v) setVariable({ variable_id: v.variable_id, name: v.name, unit: v.unit });
    });
  }, []);

  useEffect(() => {
    if (!variable) return;
    api.dimensions(variable.variable_id).then((d) => {
      setDims(d);
      const total = d.turvars.find((t) => t.turvar_id === "0");
      setTurvarId(total ? total.turvar_id : d.turvars[0]?.turvar_id ?? "");
    });
  }, [variable]);

  useEffect(() => {
    if (!variable || !dims) return;
    setLoading(true);
    api
      .trend(variable.variable_id, turvarId ? { turvar_id: turvarId } : {})
      .then(setData)
      .finally(() => setLoading(false));
  }, [variable, dims, turvarId]);

  // Recharts needs the band as [low, high] pairs for an Area.
  const rows = (data?.results ?? []).map((r) => ({
    year: r.year,
    national: r.national,
    prov_mean: r.prov_mean,
    band: r.prov_min !== null && r.prov_max !== null ? [r.prov_min, r.prov_max] : undefined,
  }));

  const selectClass =
    "rounded-lg border border-ink-border bg-ink-panel2 px-3 py-2 text-sm text-ink-text focus:border-ink-accent focus:outline-none focus:ring-2 focus:ring-ink-accent/15 transition-colors";

  return (
    <div className="space-y-6">
      <Panel className="space-y-4">
        <IndicatorPicker value={variable} onPick={setVariable} />
        {dims && dims.turvars.length > 1 && (
          <select value={turvarId} onChange={(e) => setTurvarId(e.target.value)} className={selectClass}>
            {dims.turvars.map((t) => (
              <option key={t.turvar_id} value={t.turvar_id}>
                {t.turvar_label || `turvar ${t.turvar_id}`}
              </option>
            ))}
          </select>
        )}
      </Panel>

      {data && (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
            <StatTile
              label="Perubahan total"
              value={data.change_pct === null ? "–" : `${data.change_pct > 0 ? "+" : ""}${data.change_pct}%`}
              sub={data.has_national ? "nasional, tahun awal→akhir" : "rata-rata provinsi, awal→akhir"}
            />
            <StatTile
              label="Pertumbuhan tahunan (CAGR)"
              value={data.cagr_pct === null ? "–" : `${data.cagr_pct > 0 ? "+" : ""}${data.cagr_pct}%`}
              sub="majemuk, per tahun"
            />
            <StatTile
              label="Deret"
              value={data.has_national ? "Nasional + provinsi" : "Provinsi saja"}
              sub={data.has_national ? "" : "tidak ada agregat nasional yang diterbitkan"}
            />
          </div>

          <Panel>
            <SectionTitle hint={loading ? "memuat…" : "garis = nasional (atau rata-rata provinsi); pita = minimum–maksimum provinsi"}>
              {data.name} {data.unit && <span className="text-ink-muted">({data.unit})</span>}
            </SectionTitle>
            <ResponsiveContainer width="100%" height={360}>
              <ComposedChart data={rows} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
                <CartesianGrid stroke={CHART.grid} vertical={false} />
                <XAxis dataKey="year" tick={{ fill: CHART.axisTick, fontSize: 12 }} axisLine={{ stroke: CHART.axisLine }} tickLine={false} />
                <YAxis
                  tick={{ fill: CHART.axisTick, fontSize: 12 }}
                  axisLine={{ stroke: CHART.axisLine }}
                  tickLine={false}
                  width={64}
                  domain={["auto", "auto"]}
                  tickFormatter={(v) => (Math.abs(v) >= 1000 ? `${(v / 1000).toLocaleString()}k` : `${v}`)}
                />
                <Tooltip
                  contentStyle={{ background: CHART.tooltipBg, border: `1px solid ${CHART.tooltipBorder}`, borderRadius: 8, color: CHART.text }}
                  labelStyle={{ color: CHART.axisTick }}
                  formatter={(v: number | number[], name: string) => {
                    if (Array.isArray(v)) return [`${formatNumber(v[0])} – ${formatNumber(v[1])}`, "Rentang provinsi"];
                    return [formatNumber(v as number), name === "national" ? "Nasional" : "Rata-rata provinsi"];
                  }}
                />
                <Legend
                  wrapperStyle={{ fontSize: 12, color: CHART.axisTick }}
                  formatter={(v) => (v === "national" ? "Nasional" : v === "prov_mean" ? "Rata-rata provinsi" : "Rentang provinsi")}
                />
                <Area dataKey="band" stroke="none" fill={CHART.accent} fillOpacity={0.12} legendType="none" />
                {data.has_national && (
                  <Line type="monotone" dataKey="national" stroke={CHART.accent} strokeWidth={2.5} dot={false} connectNulls />
                )}
                <Line type="monotone" dataKey="prov_mean" stroke={CHART.good} strokeWidth={2} strokeDasharray={data.has_national ? "4 3" : undefined} dot={false} connectNulls />
              </ComposedChart>
            </ResponsiveContainer>
          </Panel>
        </>
      )}
    </div>
  );
}
