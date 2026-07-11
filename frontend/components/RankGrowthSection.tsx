"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api, CHART, formatNumber, type Dimensions, type Growth, type Ranking } from "@/lib/api";
import { Panel, SectionTitle, StatTile } from "@/components/ui";
import { HorizontalBars, type BarDatum } from "@/components/HorizontalBars";
import { IndicatorPicker, type PickedVariable } from "@/components/IndicatorPicker";

const CHART_CAP = 25;

export function RankGrowthSection({ mode }: { mode: "ranking" | "growth" }) {
  const [variable, setVariable] = useState<PickedVariable | null>(null);
  const [dims, setDims] = useState<Dimensions | null>(null);
  const [adminLevel, setAdminLevel] = useState("province");
  const [turvarId, setTurvarId] = useState("");
  const [year, setYear] = useState<number | null>(null);
  const [yearFrom, setYearFrom] = useState<number | null>(null);
  const [yearTo, setYearTo] = useState<number | null>(null);
  const [order, setOrder] = useState<"desc" | "asc">("desc");

  const [ranking, setRanking] = useState<Ranking | null>(null);
  const [growth, setGrowth] = useState<Growth | null>(null);
  const [loading, setLoading] = useState(false);

  const regionLevels = useMemo(
    () => (dims ? dims.admin_levels.filter((l) => l === "province" || l === "regency") : []),
    [dims]
  );
  const isRegional = regionLevels.length > 0;

  useEffect(() => {
    api.variables({ keyword: "Angka Harapan Hidup" }).then((d) => {
      const first = d.results[0];
      if (first) setVariable({ variable_id: first.variable_id, name: first.name, unit: first.unit });
    });
  }, []);

  useEffect(() => {
    if (!variable) return;
    api.dimensions(variable.variable_id).then((d) => {
      setDims(d);
      const total = d.turvars.find((t) => t.turvar_id === "0");
      setTurvarId(total ? total.turvar_id : d.turvars[0]?.turvar_id ?? "");
      const levels = d.admin_levels.filter((l) => l === "province" || l === "regency");
      setAdminLevel(levels.includes("province") ? "province" : levels[0] ?? "province");
      if (d.years.length) {
        setYear(d.years[d.years.length - 1]);
        setYearFrom(d.years[0]);
        setYearTo(d.years[d.years.length - 1]);
      }
    });
  }, [variable]);

  useEffect(() => {
    if (!variable || !dims || !isRegional) return;
    const base: Record<string, string> = { admin_level: adminLevel, order };
    if (turvarId) base.turvar_id = turvarId;
    setLoading(true);
    if (mode === "ranking") {
      if (year) base.year = String(year);
      api.ranking(variable.variable_id, base).then(setRanking).finally(() => setLoading(false));
    } else {
      if (yearFrom) base.year_from = String(yearFrom);
      if (yearTo) base.year_to = String(yearTo);
      api.growth(variable.variable_id, base).then(setGrowth).finally(() => setLoading(false));
    }
  }, [variable, dims, isRegional, mode, adminLevel, turvarId, year, yearFrom, yearTo, order]);

  const selectClass =
    "rounded-lg border border-ink-border bg-ink-panel2 px-3 py-2 text-sm text-ink-text focus:border-ink-accent focus:outline-none focus:ring-2 focus:ring-ink-accent/15 transition-colors";

  return (
    <div className="space-y-6">
      <Panel className="space-y-4">
        <IndicatorPicker value={variable} onPick={setVariable} />
        {isRegional && (
          <div className="flex flex-wrap gap-2">
            <select value={adminLevel} onChange={(e) => setAdminLevel(e.target.value)} className={selectClass}>
              {regionLevels.map((l) => (
                <option key={l} value={l}>
                  {l === "province" ? "Provinsi" : "Kabupaten/Kota"}
                </option>
              ))}
            </select>
            {dims && dims.turvars.length > 1 && (
              <select value={turvarId} onChange={(e) => setTurvarId(e.target.value)} className={selectClass}>
                {dims.turvars.map((t) => (
                  <option key={t.turvar_id} value={t.turvar_id}>
                    {t.turvar_label || `turvar ${t.turvar_id}`}
                  </option>
                ))}
              </select>
            )}
            {mode === "ranking" ? (
              <select value={year ?? ""} onChange={(e) => setYear(Number(e.target.value))} className={selectClass}>
                {dims?.years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            ) : (
              <>
                <select value={yearFrom ?? ""} onChange={(e) => setYearFrom(Number(e.target.value))} className={selectClass}>
                  {dims?.years.map((y) => (
                    <option key={y} value={y}>
                      dari {y}
                    </option>
                  ))}
                </select>
                <select value={yearTo ?? ""} onChange={(e) => setYearTo(Number(e.target.value))} className={selectClass}>
                  {dims?.years.map((y) => (
                    <option key={y} value={y}>
                      sampai {y}
                    </option>
                  ))}
                </select>
              </>
            )}
            <select value={order} onChange={(e) => setOrder(e.target.value as "desc" | "asc")} className={selectClass}>
              <option value="desc">Tertinggi dulu</option>
              <option value="asc">Terendah dulu</option>
            </select>
          </div>
        )}
      </Panel>

      {!isRegional && dims && (
        <Panel>
          <div className="text-sm text-ink-muted">
            Indikator ini tidak memiliki rincian provinsi/kabupaten, sehingga tidak ada yang dapat diperingkatkan antarwilayah. Pilih
            indikator kewilayahan (mis. angka harapan hidup, tingkat kemiskinan, pengangguran).
          </div>
        </Panel>
      )}

      {isRegional && mode === "ranking" && ranking && <RankingView ranking={ranking} loading={loading} />}
      {isRegional && mode === "growth" && growth && <GrowthView growth={growth} loading={loading} />}
    </div>
  );
}

function RankingView({ ranking, loading }: { ranking: Ranking; loading: boolean }) {
  const top = ranking.results[0];
  const bottom = ranking.results[ranking.results.length - 1];
  const bars: BarDatum[] = ranking.results
    .slice(0, CHART_CAP)
    .map((r) => ({ label: r.domain_name, value: r.value, highlight: r.rank === 1 }));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Tertinggi" value={top ? `${top.value}` : "–"} sub={top?.domain_name} />
        <StatTile label="Terendah" value={bottom ? `${bottom.value}` : "–"} sub={bottom?.domain_name} />
        <StatTile label="Rata-rata" value={ranking.stats.mean ?? "–"} sub={`${ranking.stats.count} wilayah`} />
        <StatTile label="Median" value={ranking.stats.median ?? "–"} />
      </div>

      <Panel>
        <SectionTitle hint={`${ranking.year} · ${ranking.unit || "nilai"}${loading ? " · memuat…" : ""}`}>
          {ranking.name} — {Math.min(CHART_CAP, ranking.results.length)} teratas
        </SectionTitle>
        <HorizontalBars data={bars} unit={ranking.unit} />
        {ranking.results.length > CHART_CAP && (
          <div className="mt-2 text-xs text-ink-muted">
            Menampilkan {CHART_CAP} teratas dari {ranking.results.length}; peringkat lengkap ada di tabel di bawah.
          </div>
        )}
      </Panel>

      <RankTable
        headers={["#", "Wilayah", ranking.unit || "Nilai"]}
        rows={ranking.results.map((r) => [String(r.rank), r.domain_id, r.domain_name, formatNumber(r.value)])}
      />
    </div>
  );
}

function GrowthView({ growth, loading }: { growth: Growth; loading: boolean }) {
  const bars: BarDatum[] = growth.results
    .filter((r) => r.change_pct !== null)
    .slice(0, CHART_CAP)
    .map((r) => ({ label: r.domain_name, value: r.change_pct as number }));

  return (
    <div className="space-y-6">
      <Panel>
        <SectionTitle hint={`${growth.year_from} → ${growth.year_to} · perubahan %${loading ? " · memuat…" : ""}`}>
          {growth.name} — perubahan per wilayah
        </SectionTitle>
        <HorizontalBars data={bars} unit="%" colorPos={CHART.good} colorNeg={CHART.bad} />
      </Panel>

      <RankTable
        headers={["#", "Wilayah", "Dari", "Sampai", "Perubahan", "%"]}
        rows={growth.results.map((r) => [
          String(r.rank),
          r.domain_id,
          r.domain_name,
          formatNumber(r.value_from),
          formatNumber(r.value_to),
          formatNumber(r.change),
          r.change_pct === null ? "–" : `${r.change_pct}%`,
        ])}
      />
    </div>
  );
}

function RankTable({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <Panel className="p-0 overflow-hidden">
      <div className="max-h-[32rem] overflow-auto scroll-thin">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-ink-panel2/70 backdrop-blur">
            <tr className="border-b border-ink-border text-left text-[11px] uppercase tracking-wider text-ink-muted">
              {headers.map((h, i) => (
                <th key={i} className={`px-5 py-2.5 font-semibold ${i >= 2 ? "text-right" : ""}`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b border-ink-border/40 transition-colors last:border-0 hover:bg-ink-accent/[0.04]">
                <td className="px-5 py-2 tabular-nums text-ink-muted">{r[0]}</td>
                <td className="px-5 py-2">
                  <Link href={`/regions/${r[1]}`} className="font-medium text-ink-accent hover:underline">
                    {r[2]}
                  </Link>
                </td>
                {r.slice(3).map((cell, j) => (
                  <td key={j} className="px-5 py-2 text-right font-medium tabular-nums text-ink-text">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
