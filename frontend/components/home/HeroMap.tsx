"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { formatDecimal, formatNumber, type DukcapilRankRow } from "@/lib/api";
import { provinceHref } from "@/lib/routes";
import { OutlineMap, type OutlineValue } from "@/components/OutlineMap";

// Deep-sea panel ramp: dark sea for sparse provinces, cream for the densest,
// so Java "glows". Quantile classes — density spans 13 → 16,600 jiwa/km².
export const SEA_RAMP = ["#1A2E55", "#22417A", "#2B57A3", "#3F73CC", "#6B96E6", "#A3BEF0", "#F3ECDD"];

/** Interactive province density map for the home hero (dark sea surface). */
export function HeroMap({ density, population }: { density: DukcapilRankRow[]; population: DukcapilRankRow[] }) {
  const router = useRouter();
  const values = useMemo(() => {
    const pop = new Map(population.map((r) => [r.domain_id, r.value]));
    return new Map<string, OutlineValue>(
      density.map((r) => [
        r.domain_id,
        {
          name: r.domain_name,
          value: r.value,
          lines: [
            `${formatDecimal(r.value, 1)} jiwa/km²`,
            ...(pop.has(r.domain_id) ? [`${formatNumber(pop.get(r.domain_id)!)} jiwa`] : []),
          ],
        },
      ]),
    );
  }, [density, population]);

  return (
    <OutlineMap
      values={values}
      ramp={SEA_RAMP}
      noData="#2E3442"
      stroke="#0A1A33"
      onSelect={(c) => router.push(provinceHref(c))}
      ariaLabel="Peta kepadatan penduduk per provinsi"
    />
  );
}
