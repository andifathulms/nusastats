"use client";

import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatNumber, SERIES_COLORS, type DukcapilRegionDetail } from "@/lib/api";

type Datum = { name: string; value: number };

function rawGroup(detail: DukcapilRegionDetail, group: string): Datum[] {
  const g = detail.groups.find((x) => x.group === group);
  if (!g) return [];
  // Only the raw count fields — exclude the derived ratios that share the group.
  return g.indicators.filter((i) => !i.derived).map((i) => ({ name: i.label_id, value: i.value }));
}

/** Age-structure histogram (the source has no age×sex crosstab, so this is an
 *  age distribution, not a male/female pyramid). */
function AgeDistribution({ detail }: { detail: DukcapilRegionDetail }) {
  const data = rawGroup(detail, "Kelompok Umur").map((d) => ({
    name: d.name.replace(/^Usia\s*/, ""),
    value: d.value,
  }));
  if (!data.length) return null;
  return (
    <div>
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-accent">Distribusi Usia</div>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: 4 }}>
          <XAxis dataKey="name" tick={{ fill: "#544c40", fontSize: 9 }} interval={0} angle={-45} textAnchor="end" height={44} axisLine={{ stroke: "#babba9" }} tickLine={false} />
          <YAxis tick={{ fill: "#544c40", fontSize: 10 }} axisLine={false} tickLine={false} width={44} tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : `${v}`)} />
          <Tooltip
            cursor={{ fill: "#e7e7dc" }}
            content={({ active, payload, label }) =>
              active && payload?.length ? (
                <div className="rounded-lg border border-ink-border bg-ink-panel px-3 py-1.5 text-xs">
                  <div className="font-medium text-ink-text">Usia {label}</div>
                  <div className="text-ink-muted">{formatNumber(payload[0].value as number)} jiwa</div>
                </div>
              ) : null
            }
          />
          <Bar dataKey="value" fill="#8b5e3c" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function Donut({ title, data }: { title: string; data: Datum[] }) {
  const rows = data.filter((d) => d.value > 0).sort((a, b) => b.value - a.value);
  const total = rows.reduce((s, d) => s + d.value, 0);
  if (!total) return null;
  // Keep legends readable: top 7 slices, the rest folded into "Lainnya".
  const top = rows.slice(0, 7);
  const restVal = rows.slice(7).reduce((s, d) => s + d.value, 0);
  const slices = restVal > 0 ? [...top, { name: "Lainnya", value: restVal }] : top;
  const pct = (v: number) => `${((v / total) * 100).toFixed(1)}%`;

  return (
    <div>
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-accent">{title}</div>
      <div className="flex items-center gap-3">
        <ResponsiveContainer width="45%" height={130}>
          <PieChart>
            <Pie data={slices} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="90%" stroke="none">
              {slices.map((_, i) => (
                <Cell key={i} fill={SERIES_COLORS[i % SERIES_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              content={({ active, payload }) =>
                active && payload?.length ? (
                  <div className="rounded-lg border border-ink-border bg-ink-panel px-3 py-1.5 text-xs">
                    <div className="font-medium text-ink-text">{payload[0].name}</div>
                    <div className="text-ink-muted">
                      {formatNumber(payload[0].value as number)} · {pct(payload[0].value as number)}
                    </div>
                  </div>
                ) : null
              }
            />
          </PieChart>
        </ResponsiveContainer>
        <ul className="flex-1 space-y-0.5 text-[11px]">
          {slices.map((d, i) => (
            <li key={d.name} className="flex items-center gap-1.5">
              <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: SERIES_COLORS[i % SERIES_COLORS.length] }} />
              <span className="truncate text-ink-muted">{d.name}</span>
              <span className="ml-auto shrink-0 tabular-nums text-ink-text">{pct(d.value)}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function RegionCharts({ detail }: { detail: DukcapilRegionDetail }) {
  const religion = rawGroup(detail, "Agama");
  const education = rawGroup(detail, "Pendidikan (Tamat)");
  const occupation = rawGroup(detail, "Pekerjaan");
  const hasAny = religion.length || education.length || occupation.length;
  if (!hasAny) return null;

  return (
    <div className="mb-5 space-y-5 border-b border-ink-border pb-5">
      <AgeDistribution detail={detail} />
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {religion.length > 0 && <Donut title="Komposisi Agama" data={religion} />}
        {education.length > 0 && <Donut title="Pendidikan (Tamat)" data={education} />}
        {occupation.length > 0 && <Donut title="Pekerjaan" data={occupation} />}
      </div>
    </div>
  );
}
