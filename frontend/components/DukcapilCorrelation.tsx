"use client";

import { useEffect, useState } from "react";
import {
  CartesianGrid,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import { dukcapilApi, formatNumber, regionLabel, type DukcapilCorrelation as Corr, type DukcapilIndicatorGroups } from "@/lib/api";
import { Panel, SectionTitle } from "@/components/ui";

function describeR(r: number | null): { text: string; tone: string } {
  if (r === null) return { text: "tidak terhitung", tone: "text-ink-muted" };
  const a = Math.abs(r);
  const s = a >= 0.7 ? "kuat" : a >= 0.4 ? "sedang" : a >= 0.2 ? "lemah" : "sangat lemah";
  const dir = r > 0 ? "positif" : "negatif";
  const tone = a >= 0.4 ? (r > 0 ? "text-emerald-600" : "text-rose-600") : "text-ink-muted";
  return { text: `${s} ${dir}`, tone };
}

function GroupedSelect({
  label,
  value,
  onChange,
  groups,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  groups: DukcapilIndicatorGroups["groups"];
}) {
  return (
    <div>
      <div className="mb-1 text-xs uppercase tracking-wide text-ink-muted">{label}</div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-ink-border bg-ink-panel px-3 py-2 text-sm text-ink-text focus:border-ink-accent/60 focus:outline-none"
      >
        {groups.map((g) => (
          <optgroup key={g.group} label={g.group}>
            {g.indicators.map((i) => (
              <option key={i.field} value={i.field}>
                {i.label_id}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </div>
  );
}

export function DukcapilCorrelation({ groups }: { groups: DukcapilIndicatorGroups["groups"] }) {
  const [x, setX] = useState("pct_sarjana");
  const [y, setY] = useState("pop_density");
  const [level, setLevel] = useState<"province" | "regency">("province");
  const [data, setData] = useState<Corr | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!x || !y) return;
    setLoading(true);
    dukcapilApi
      .correlate({ x, y, level })
      .then(setData)
      .finally(() => setLoading(false));
  }, [x, y, level]);

  const rDesc = describeR(data?.r ?? null);
  const levelLabel = level === "province" ? "provinsi" : "kabupaten/kota";

  return (
    <div className="space-y-6">
      <Panel className="space-y-4">
        <div className="grid gap-3 lg:grid-cols-2">
          <GroupedSelect label="Sumbu X" value={x} onChange={setX} groups={groups} />
          <GroupedSelect label="Sumbu Y" value={y} onChange={setY} groups={groups} />
        </div>
        <div className="inline-flex gap-1 rounded-lg border border-ink-border/80 bg-ink-panel/50 p-0.5">
          {(["province", "regency"] as const).map((l) => (
            <button
              key={l}
              onClick={() => setLevel(l)}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                level === l ? "bg-brand-gradient text-white" : "text-ink-muted hover:bg-ink-panel2/70 hover:text-ink-text"
              }`}
            >
              {l === "province" ? "Provinsi" : "Kabupaten/Kota"}
            </button>
          ))}
        </div>
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
                dari {data.n} {levelLabel}
              </div>
            </div>
          </Panel>

          <Panel>
            <SectionTitle hint={loading ? "memuat…" : "tiap titik = satu wilayah"}>
              {data.x.label_id} vs {data.y.label_id}
            </SectionTitle>
            <ResponsiveContainer width="100%" height={420}>
              <ScatterChart margin={{ top: 12, right: 24, bottom: 24, left: 12 }}>
                <CartesianGrid stroke="#e7e7dc" />
                <XAxis
                  type="number"
                  dataKey="x"
                  tick={{ fill: "#544c40", fontSize: 11 }}
                  axisLine={{ stroke: "#babba9" }}
                  tickLine={false}
                  label={{
                    value: `${data.x.label_id}${data.x.unit ? ` (${data.x.unit})` : ""}`,
                    position: "insideBottom",
                    offset: -12,
                    fill: "#544c40",
                    fontSize: 11,
                  }}
                />
                <YAxis
                  type="number"
                  dataKey="y"
                  tick={{ fill: "#544c40", fontSize: 11 }}
                  axisLine={{ stroke: "#babba9" }}
                  tickLine={false}
                  width={64}
                  label={{ value: data.y.unit || "", angle: -90, position: "insideLeft", fill: "#544c40", fontSize: 11 }}
                />
                <ZAxis range={[55, 55]} />
                <Tooltip
                  cursor={{ strokeDasharray: "3 3", stroke: "#babba9" }}
                  content={({ active, payload }) => {
                    if (!active || !payload || !payload.length) return null;
                    const p = payload[0].payload as { domain_name: string; status?: string; x: number; y: number };
                    return (
                      <div className="rounded-lg border border-ink-border bg-ink-panel px-3 py-2 text-xs">
                        <div className="font-medium text-ink-text">{regionLabel(p.domain_name, p.status)}</div>
                        <div className="text-ink-muted">
                          {data.x.label_id.slice(0, 28)}: {formatNumber(p.x)}
                        </div>
                        <div className="text-ink-muted">
                          {data.y.label_id.slice(0, 28)}: {formatNumber(p.y)}
                        </div>
                      </div>
                    );
                  }}
                />
                <Scatter data={data.results} fill="#8b5e3c" fillOpacity={0.8} />
              </ScatterChart>
            </ResponsiveContainer>
          </Panel>
        </>
      )}
    </div>
  );
}
