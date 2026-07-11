"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
  ResponsiveContainer,
} from "recharts";
import { api, CHART, formatNumber, type Correlation, type Dimensions } from "@/lib/api";
import { Panel, SectionTitle } from "@/components/ui";
import { IndicatorPicker, type PickedVariable } from "@/components/IndicatorPicker";

function describeR(r: number | null): { text: string; tone: string } {
  if (r === null) return { text: "tidak dapat dihitung", tone: "text-ink-muted" };
  const a = Math.abs(r);
  const strength = a >= 0.7 ? "kuat" : a >= 0.4 ? "sedang" : a >= 0.2 ? "lemah" : "sangat lemah";
  const dir = r > 0 ? "positif" : "negatif";
  const tone = a >= 0.4 ? (r > 0 ? "text-emerald-300" : "text-rose-300") : "text-ink-muted";
  return { text: `${strength} ${dir}`, tone };
}

export function CorrelationSection() {
  const [xVar, setXVar] = useState<PickedVariable | null>(null);
  const [yVar, setYVar] = useState<PickedVariable | null>(null);
  const [xDims, setXDims] = useState<Dimensions | null>(null);
  const [yDims, setYDims] = useState<Dimensions | null>(null);
  const [adminLevel, setAdminLevel] = useState("province");
  const [year, setYear] = useState<number | null>(null);
  const [data, setData] = useState<Correlation | null>(null);
  const [loading, setLoading] = useState(false);

  // Defaults: life expectancy vs HDI, a genuinely correlated pair.
  useEffect(() => {
    api.variables({ keyword: "Angka Harapan Hidup" }).then((d) => {
      const v = d.results[0];
      if (v) setXVar({ variable_id: v.variable_id, name: v.name, unit: v.unit });
    });
    api.variables({ keyword: "Indeks Pembangunan Manusia" }).then((d) => {
      const v = d.results[0];
      if (v) setYVar({ variable_id: v.variable_id, name: v.name, unit: v.unit });
    });
  }, []);

  useEffect(() => {
    if (xVar) api.dimensions(xVar.variable_id).then(setXDims);
  }, [xVar]);
  useEffect(() => {
    if (yVar) api.dimensions(yVar.variable_id).then(setYDims);
  }, [yVar]);

  const commonLevels = useMemo(() => {
    if (!xDims || !yDims) return [];
    const y = new Set(yDims.admin_levels);
    return xDims.admin_levels.filter((l) => (l === "province" || l === "regency") && y.has(l));
  }, [xDims, yDims]);

  const commonYears = useMemo(() => {
    if (!xDims || !yDims) return [];
    const y = new Set(yDims.years);
    return xDims.years.filter((yr) => y.has(yr));
  }, [xDims, yDims]);

  useEffect(() => {
    if (commonLevels.length) setAdminLevel((cur) => (commonLevels.includes(cur) ? cur : commonLevels[0]));
  }, [commonLevels]);
  useEffect(() => {
    if (commonYears.length) setYear((cur) => (cur && commonYears.includes(cur) ? cur : commonYears[commonYears.length - 1]));
  }, [commonYears]);

  useEffect(() => {
    if (!xVar || !yVar || !adminLevel || !year) return;
    setLoading(true);
    api
      .correlate({ x: xVar.variable_id, y: yVar.variable_id, admin_level: adminLevel, year: String(year) })
      .then(setData)
      .finally(() => setLoading(false));
  }, [xVar, yVar, adminLevel, year]);

  const selectClass =
    "rounded-lg border border-ink-border bg-ink-panel2 px-3 py-2 text-sm text-ink-text focus:border-ink-accent focus:outline-none focus:ring-2 focus:ring-ink-accent/15 transition-colors";
  const rDesc = describeR(data?.r ?? null);

  return (
    <div className="space-y-6">
      <Panel className="space-y-4">
        <div className="grid gap-3 lg:grid-cols-2">
          <div>
            <div className="mb-1 text-xs uppercase tracking-wide text-ink-muted">Sumbu X</div>
            <IndicatorPicker value={xVar} onPick={setXVar} />
          </div>
          <div>
            <div className="mb-1 text-xs uppercase tracking-wide text-ink-muted">Sumbu Y</div>
            <IndicatorPicker value={yVar} onPick={setYVar} />
          </div>
        </div>
        {commonLevels.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            <select value={adminLevel} onChange={(e) => setAdminLevel(e.target.value)} className={selectClass}>
              {commonLevels.map((l) => (
                <option key={l} value={l}>
                  {l === "province" ? "Provinsi" : "Kabupaten/Kota"}
                </option>
              ))}
            </select>
            <select value={year ?? ""} onChange={(e) => setYear(Number(e.target.value))} className={selectClass}>
              {commonYears.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
        ) : (
          xDims &&
          yDims && (
            <div className="text-sm text-ink-muted">
              Kedua indikator ini tidak memiliki tingkat wilayah yang sama, sehingga tidak dapat dikorelasikan antarwilayah.
            </div>
          )
        )}
      </Panel>

      {data && data.n > 0 && (
        <>
          <Panel className="flex flex-wrap items-center gap-6">
            <div>
              <div className="text-xs uppercase tracking-wide text-ink-muted">Korelasi (Pearson r)</div>
              <div className="mt-1 text-3xl font-semibold tabular-nums text-ink-text">{data.r ?? "–"}</div>
            </div>
            <div className={`text-sm ${rDesc.tone}`}>
              {rDesc.text}
              <div className="text-ink-muted">
                di {data.n} {adminLevel === "province" ? "provinsi" : "kabupaten/kota"} · {data.year}
              </div>
            </div>
          </Panel>

          <Panel>
            <SectionTitle hint={loading ? "memuat…" : `setiap titik mewakili satu wilayah`}>
              {data.x.name} vs {data.y.name}
            </SectionTitle>
            <ResponsiveContainer width="100%" height={420}>
              <ScatterChart margin={{ top: 12, right: 24, bottom: 24, left: 12 }}>
                <CartesianGrid stroke={CHART.grid} />
                <XAxis
                  type="number"
                  dataKey="x"
                  name={data.x.name}
                  tick={{ fill: CHART.axisTick, fontSize: 11 }}
                  axisLine={{ stroke: CHART.axisLine }}
                  tickLine={false}
                  label={{ value: `${data.x.name}${data.x.unit ? ` (${data.x.unit})` : ""}`, position: "insideBottom", offset: -12, fill: CHART.axisTick, fontSize: 11 }}
                />
                <YAxis
                  type="number"
                  dataKey="y"
                  name={data.y.name}
                  tick={{ fill: CHART.axisTick, fontSize: 11 }}
                  axisLine={{ stroke: CHART.axisLine }}
                  tickLine={false}
                  width={64}
                  label={{ value: data.y.unit || "", angle: -90, position: "insideLeft", fill: CHART.axisTick, fontSize: 11 }}
                />
                <ZAxis range={[55, 55]} />
                <Tooltip
                  cursor={{ strokeDasharray: "3 3", stroke: CHART.axisLine }}
                  contentStyle={{ background: CHART.tooltipBg, border: `1px solid ${CHART.tooltipBorder}`, borderRadius: 8, color: CHART.text }}
                  content={({ active, payload }) => {
                    if (!active || !payload || !payload.length) return null;
                    const p = payload[0].payload as { domain_name: string; x: number; y: number };
                    return (
                      <div className="rounded-lg border border-ink-border bg-ink-panel px-3 py-2 text-xs">
                        <div className="font-medium text-ink-text">{p.domain_name}</div>
                        <div className="text-ink-muted">
                          {data.x.name.slice(0, 24)}: {formatNumber(p.x)}
                        </div>
                        <div className="text-ink-muted">
                          {data.y.name.slice(0, 24)}: {formatNumber(p.y)}
                        </div>
                      </div>
                    );
                  }}
                />
                <Scatter data={data.results} fill={CHART.accent} fillOpacity={0.8} />
              </ScatterChart>
            </ResponsiveContainer>
          </Panel>
        </>
      )}

      {data && data.n === 0 && xDims && yDims && commonLevels.length > 0 && (
        <Panel>
          <div className="text-sm text-ink-muted">Tidak ada wilayah beririsan yang memiliki data untuk kedua indikator pada {year}.</div>
        </Panel>
      )}
    </div>
  );
}
