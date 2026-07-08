"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api, formatNumber, type Dimensions, type Ranking } from "@/lib/api";
import { Panel, SectionTitle } from "@/components/ui";
import { ChoroplethMap, type MapValue } from "@/components/ChoroplethMap";
import { IndicatorPicker, type PickedVariable } from "@/components/IndicatorPicker";

export function MapSection() {
  const [variable, setVariable] = useState<PickedVariable | null>(null);
  const [dims, setDims] = useState<Dimensions | null>(null);
  const [turvarId, setTurvarId] = useState("");
  const [year, setYear] = useState<number | null>(null);
  const [ranking, setRanking] = useState<Ranking | null>(null);
  const [loading, setLoading] = useState(false);

  const hasProvince = !!dims && dims.admin_levels.includes("province");

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
      if (d.years.length) setYear(d.years[d.years.length - 1]);
    });
  }, [variable]);

  useEffect(() => {
    if (!variable || !dims || !hasProvince || !year) return;
    setLoading(true);
    const p: Record<string, string> = { admin_level: "province", year: String(year) };
    if (turvarId) p.turvar_id = turvarId;
    api
      .ranking(variable.variable_id, p)
      .then(setRanking)
      .finally(() => setLoading(false));
  }, [variable, dims, hasProvince, year, turvarId]);

  const values = useMemo(() => {
    const m = new Map<string, MapValue>();
    ranking?.results.forEach((r) => m.set(r.domain_id, { value: r.value, name: r.domain_name }));
    return m;
  }, [ranking]);

  const selectClass =
    "rounded-lg border border-ink-border bg-ink-panel2 px-3 py-2 text-sm text-ink-text focus:border-ink-accent focus:outline-none";

  return (
    <div className="space-y-6">
      <Panel className="space-y-4">
        <IndicatorPicker value={variable} onPick={setVariable} />
        {hasProvince && (
          <div className="flex flex-wrap gap-2">
            {dims && dims.turvars.length > 1 && (
              <select value={turvarId} onChange={(e) => setTurvarId(e.target.value)} className={selectClass}>
                {dims.turvars.map((t) => (
                  <option key={t.turvar_id} value={t.turvar_id}>
                    {t.turvar_label || `turvar ${t.turvar_id}`}
                  </option>
                ))}
              </select>
            )}
            <select value={year ?? ""} onChange={(e) => setYear(Number(e.target.value))} className={selectClass}>
              {dims?.years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
        )}
      </Panel>

      {!hasProvince && dims && (
        <Panel>
          <div className="text-sm text-ink-muted">
            This indicator has no provincial data to map. Pick a province-level indicator.
          </div>
        </Panel>
      )}

      {hasProvince && ranking && (
        <Panel>
          <SectionTitle hint={`${ranking.year} · ${ranking.unit || "value"}${loading ? " · loading…" : ""}`}>
            {ranking.name} by province
          </SectionTitle>
          <ChoroplethMap
            values={values}
            min={ranking.stats.min ?? 0}
            max={ranking.stats.max ?? 1}
            unit={ranking.unit}
          />
          <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
            {ranking.results.slice(0, 6).map((r) => (
              <div key={r.domain_id} className="flex items-baseline justify-between">
                <Link href={`/regions/${r.domain_id}`} className="truncate text-ink-accent hover:underline">
                  {r.rank}. {r.domain_name}
                </Link>
                <span className="tabular-nums text-ink-muted">{formatNumber(r.value)}</span>
              </div>
            ))}
          </div>
        </Panel>
      )}
    </div>
  );
}
