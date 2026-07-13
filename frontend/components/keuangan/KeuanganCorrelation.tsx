"use client";

import { useEffect, useMemo, useState } from "react";
import { CartesianGrid, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from "recharts";
import { CHART, djpkApi, formatRupiah, type DjpkAccountGroups, type DjpkMeasure, type DjpkRegionLevel } from "@/lib/api";
import { Panel, SectionTitle } from "@/components/ui";
import { GROUP_LABEL } from "@/components/keuangan/controls";

type Corr = Awaited<ReturnType<typeof djpkApi.correlate>>;

function describeR(r: number | null): { text: string; tone: string } {
  if (r === null) return { text: "tidak terhitung", tone: "text-ink-muted" };
  const a = Math.abs(r);
  const s = a >= 0.7 ? "kuat" : a >= 0.4 ? "sedang" : a >= 0.2 ? "lemah" : "sangat lemah";
  const dir = r > 0 ? "positif" : "negatif";
  const tone = a >= 0.4 ? (r > 0 ? "text-emerald-600" : "text-rose-600") : "text-ink-muted";
  return { text: `${s} ${dir}`, tone };
}

export function KeuanganCorrelation({
  xKey,
  xLabel,
  level,
  measure,
  tahun,
  catalog,
}: {
  xKey: string;
  xLabel: string;
  level: DjpkRegionLevel;
  measure: DjpkMeasure;
  tahun: number;
  catalog: DjpkAccountGroups | null;
}) {
  const [yKey, setYKey] = useState("belanja_modal");
  const [data, setData] = useState<Corr | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Avoid a degenerate x==y scatter.
    if (yKey === xKey) {
      setYKey(xKey === "pad" ? "belanja_modal" : "pad");
      return;
    }
    setLoading(true);
    setData(null);
    djpkApi
      .correlate({ x: xKey, y: yKey, measure, level, tahun: String(tahun) })
      .then(setData)
      .finally(() => setLoading(false));
  }, [xKey, yKey, measure, level, tahun]);

  const isPct = measure === "persentase";
  const div = isPct ? 1 : 1e9;
  const unit = isPct ? "%" : "miliar Rp";
  const points = useMemo(
    () => (data?.results ?? []).map((p) => ({ ...p, x: p.x / div, y: p.y / div })),
    [data, div],
  );
  const rDesc = describeR(data?.r ?? null);
  const fmt = (v: number) => (isPct ? `${v.toLocaleString("id-ID", { maximumFractionDigits: 1 })}%` : formatRupiah(v));

  return (
    <div className="space-y-4">
      <Panel>
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wider text-ink-muted">Sumbu Y (dibandingkan dengan {xLabel})</span>
          <select
            value={yKey}
            onChange={(e) => setYKey(e.target.value)}
            className="min-w-[16rem] rounded-lg border border-ink-border bg-ink-panel px-3 py-2 text-sm text-ink-text"
          >
            {catalog?.groups.map((g) => (
              <optgroup key={g.group} label={GROUP_LABEL[g.group] ?? g.group}>
                {g.accounts.map((a) => (
                  <option key={a.akun_key} value={a.akun_key}>
                    {a.parent_key ? "— " : ""}
                    {a.label_id}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
      </Panel>

      {data && data.n > 0 ? (
        <>
          <Panel className="flex flex-wrap items-center gap-6">
            <div>
              <div className="text-xs uppercase tracking-wide text-ink-muted">Korelasi (Pearson r)</div>
              <div className="mt-1 text-3xl font-semibold tabular-nums text-ink-text">{data.r ?? "–"}</div>
            </div>
            <div className={`text-sm ${rDesc.tone}`}>
              {rDesc.text}
              <div className="text-ink-muted">dari {data.n} {level === "province" ? "provinsi" : "kabupaten/kota"}</div>
            </div>
          </Panel>

          <Panel>
            <SectionTitle hint={loading ? "memuat…" : "tiap titik = satu wilayah"}>
              {data.x.label_id} vs {data.y.label_id} <span className="font-normal text-ink-muted">({unit})</span>
            </SectionTitle>
            <ResponsiveContainer width="100%" height={420}>
              <ScatterChart margin={{ top: 12, right: 24, bottom: 24, left: 12 }}>
                <CartesianGrid stroke={CHART.grid} />
                <XAxis type="number" dataKey="x" tick={{ fill: CHART.axisTick, fontSize: 11 }} axisLine={{ stroke: CHART.axisLine }} tickLine={false}
                  label={{ value: `${data.x.label_id} (${unit})`, position: "insideBottom", offset: -12, fill: CHART.axisTick, fontSize: 11 }} />
                <YAxis type="number" dataKey="y" tick={{ fill: CHART.axisTick, fontSize: 11 }} axisLine={{ stroke: CHART.axisLine }} tickLine={false} width={72}
                  label={{ value: unit, angle: -90, position: "insideLeft", fill: CHART.axisTick, fontSize: 11 }} />
                <ZAxis range={[50, 50]} />
                <Tooltip
                  cursor={{ strokeDasharray: "3 3", stroke: CHART.axisLine }}
                  content={({ active, payload }) => {
                    if (!active || !payload || !payload.length) return null;
                    const p = payload[0].payload as { domain_name: string; x: number; y: number };
                    return (
                      <div className="rounded-lg border border-ink-border bg-ink-panel px-3 py-2 text-xs">
                        <div className="font-medium text-ink-text">{p.domain_name}</div>
                        <div className="text-ink-muted">{data.x.label_id.slice(0, 28)}: {fmt(p.x * div)}</div>
                        <div className="text-ink-muted">{data.y.label_id.slice(0, 28)}: {fmt(p.y * div)}</div>
                      </div>
                    );
                  }}
                />
                <Scatter data={points} fill={CHART.accent} fillOpacity={0.75} />
              </ScatterChart>
            </ResponsiveContainer>
          </Panel>
        </>
      ) : (
        <Panel>
          <div className="py-8 text-center text-sm text-ink-muted">
            {loading ? "Memuat…" : "Tidak ada data untuk pasangan akun ini."}
          </div>
        </Panel>
      )}
    </div>
  );
}
