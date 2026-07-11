"use client";

import { useEffect, useState } from "react";
import {
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import {
  CHART,
  dukcapilApi,
  formatNumber,
  groupColor,
  regionLabel,
  type DukcapilCorrelation as Corr,
  type DukcapilIndicatorGroups,
  type DukcapilLevel,
  type DukcapilRegionRow,
} from "@/lib/api";
import { Panel, SectionTitle } from "@/components/ui";

const LEVELS: [DukcapilLevel, string][] = [
  ["province", "Provinsi"],
  ["regency", "Kabupaten/Kota"],
  ["district", "Kecamatan"],
  ["village", "Desa/Kelurahan"],
];

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

function RegionSelect({
  value,
  onChange,
  options,
  placeholder,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  options: DukcapilRegionRow[];
  placeholder: string;
  disabled?: boolean;
}) {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-lg border border-ink-border bg-ink-panel px-3 py-2 text-sm text-ink-text focus:border-ink-accent/60 focus:outline-none disabled:opacity-40"
    >
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o.code} value={o.code}>
          {regionLabel(o.name, o.status)}
        </option>
      ))}
    </select>
  );
}

export function DukcapilCorrelation({ groups }: { groups: DukcapilIndicatorGroups["groups"] }) {
  const [x, setX] = useState("pct_sarjana");
  const [y, setY] = useState("pop_density");
  const [level, setLevel] = useState<DukcapilLevel>("province");
  const [provinces, setProvinces] = useState<DukcapilRegionRow[]>([]);
  const [regencies, setRegencies] = useState<DukcapilRegionRow[]>([]);
  const [selProv, setSelProv] = useState("");
  const [selKab, setSelKab] = useState("");
  const [colorBy, setColorBy] = useState<"none" | "province" | "regency">("none");
  const [nameMaps, setNameMaps] = useState<{ province: Record<string, string>; regency: Record<string, string> }>({
    province: {},
    regency: {},
  });
  const [data, setData] = useState<Corr | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    dukcapilApi.regions({ level: "province" }).then(setProvinces);
    Promise.all([dukcapilApi.regions({ level: "province" }), dukcapilApi.regions({ level: "regency" })]).then(
      ([prov, reg]) =>
        setNameMaps({
          province: Object.fromEntries(prov.map((x) => [x.code, regionLabel(x.name, x.status)])),
          regency: Object.fromEntries(reg.map((x) => [x.code, regionLabel(x.name, x.status)])),
        })
    );
  }, []);
  useEffect(() => {
    if (!selProv) {
      setRegencies([]);
      setSelKab("");
      return;
    }
    dukcapilApi.regions({ level: "regency", prov: selProv }).then(setRegencies);
  }, [selProv]);

  // District/village would be far too many points nationwide, so require a
  // scope: a province for kecamatan, a kabupaten for desa.
  const needProv = level === "district" && !selProv;
  const needKab = level === "village" && !selKab;
  const blocked = needProv || needKab;
  const ancestor: Record<string, string> = selKab ? { kab: selKab } : selProv ? { prov: selProv } : {};

  const scopeKey = `${selProv}/${selKab}`;
  useEffect(() => {
    if (!x || !y || blocked) {
      setData(null);
      return;
    }
    setLoading(true);
    dukcapilApi
      .correlate({ x, y, level, ...ancestor })
      .then(setData)
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [x, y, level, scopeKey, blocked]);

  const rDesc = describeR(data?.r ?? null);
  const levelLabel = LEVELS.find(([v]) => v === level)?.[1] ?? level;

  const colorDims: ["province" | "regency", string][] =
    level === "regency"
      ? [["province", "Provinsi"]]
      : level === "district" || level === "village"
      ? [["province", "Provinsi"], ["regency", "Kab/Kota"]]
      : [];
  const effColorBy = colorDims.some(([v]) => v === colorBy) ? colorBy : "none";
  const groupOf = (code: string) =>
    effColorBy === "province" ? code.slice(0, 2) : effColorBy === "regency" ? code.slice(0, 4) : "";
  const legend =
    effColorBy === "none"
      ? []
      : Array.from(new Set((data?.results ?? []).map((p) => groupOf(p.domain_id)))).map((g) => ({
          code: g,
          name: nameMaps[effColorBy][g] ?? g,
        }));

  return (
    <div className="space-y-6">
      <Panel className="space-y-4">
        <div className="grid gap-3 lg:grid-cols-2">
          <GroupedSelect label="Sumbu X" value={x} onChange={setX} groups={groups} />
          <GroupedSelect label="Sumbu Y" value={y} onChange={setY} groups={groups} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex gap-1 rounded-lg border border-ink-border/80 bg-ink-panel/50 p-0.5">
            {LEVELS.map(([v, lbl]) => (
              <button
                key={v}
                onClick={() => setLevel(v)}
                className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                  level === v ? "bg-brand-gradient text-white" : "text-ink-muted hover:bg-ink-panel2/70 hover:text-ink-text"
                }`}
              >
                {lbl}
              </button>
            ))}
          </div>
          {level !== "province" && (
            <RegionSelect
              value={selProv}
              onChange={(v) => {
                setSelProv(v);
                setSelKab("");
              }}
              options={provinces}
              placeholder={level === "regency" ? "Semua provinsi" : "Pilih provinsi"}
            />
          )}
          {(level === "district" || level === "village") && (
            <RegionSelect
              value={selKab}
              onChange={setSelKab}
              options={regencies}
              disabled={!selProv}
              placeholder={level === "village" ? "Pilih kab/kota" : "Semua kab/kota"}
            />
          )}
          {colorDims.length > 0 && (
            <select
              value={effColorBy}
              onChange={(e) => setColorBy(e.target.value as "none" | "province" | "regency")}
              className="rounded-lg border border-ink-border bg-ink-panel px-3 py-2 text-sm text-ink-text focus:border-ink-accent/60 focus:outline-none"
              title="Warnai titik menurut wilayah induk"
            >
              <option value="none">Warnai: —</option>
              {colorDims.map(([v, lbl]) => (
                <option key={v} value={v}>
                  Warnai: {lbl}
                </option>
              ))}
            </select>
          )}
        </div>
      </Panel>

      {blocked ? (
        <Panel>
          <div className="py-8 text-center text-sm text-ink-muted">
            Pilih {needProv ? "provinsi" : "kabupaten/kota"} untuk menampilkan korelasi tingkat {levelLabel.toLowerCase()}.
          </div>
        </Panel>
      ) : data && data.n > 0 ? (
        <>
          <Panel className="flex flex-wrap items-center gap-6">
            <div>
              <div className="text-xs uppercase tracking-wide text-ink-muted">Korelasi (Pearson r)</div>
              <div className="mt-1 text-3xl font-semibold tabular-nums text-ink-text">{data.r ?? "–"}</div>
            </div>
            <div className={`text-sm ${rDesc.tone}`}>
              {rDesc.text}
              <div className="text-ink-muted">
                dari {data.n} {levelLabel.toLowerCase()}
              </div>
            </div>
          </Panel>

          <Panel>
            <SectionTitle hint={loading ? "memuat…" : "tiap titik = satu wilayah"}>
              {data.x.label_id} vs {data.y.label_id}
            </SectionTitle>
            <ResponsiveContainer width="100%" height={420}>
              <ScatterChart margin={{ top: 12, right: 24, bottom: 24, left: 12 }}>
                <CartesianGrid stroke={CHART.grid} />
                <XAxis
                  type="number"
                  dataKey="x"
                  tick={{ fill: CHART.axisTick, fontSize: 11 }}
                  axisLine={{ stroke: CHART.axisLine }}
                  tickLine={false}
                  label={{
                    value: `${data.x.label_id}${data.x.unit ? ` (${data.x.unit})` : ""}`,
                    position: "insideBottom",
                    offset: -12,
                    fill: CHART.axisTick,
                    fontSize: 11,
                  }}
                />
                <YAxis
                  type="number"
                  dataKey="y"
                  tick={{ fill: CHART.axisTick, fontSize: 11 }}
                  axisLine={{ stroke: CHART.axisLine }}
                  tickLine={false}
                  width={64}
                  label={{ value: data.y.unit || "", angle: -90, position: "insideLeft", fill: CHART.axisTick, fontSize: 11 }}
                />
                <ZAxis range={[50, 50]} />
                <Tooltip
                  cursor={{ strokeDasharray: "3 3", stroke: CHART.axisLine }}
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
                <Scatter data={data.results} fill={CHART.accent} fillOpacity={0.75}>
                  {effColorBy !== "none" &&
                    data.results.map((p) => <Cell key={p.domain_id} fill={groupColor(groupOf(p.domain_id))} />)}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
            {legend.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
                {legend.map((g) => (
                  <span key={g.code} className="inline-flex items-center gap-1">
                    <span className="h-2 w-2 rounded-sm" style={{ background: groupColor(g.code) }} />
                    <span className="text-ink-muted">{g.name}</span>
                  </span>
                ))}
              </div>
            )}
          </Panel>
        </>
      ) : (
        data && (
          <Panel>
            <div className="py-8 text-center text-sm text-ink-muted">Tidak ada data untuk pasangan indikator ini.</div>
          </Panel>
        )
      )}
    </div>
  );
}
