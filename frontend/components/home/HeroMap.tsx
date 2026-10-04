"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { formatDecimal, formatNumber, type DukcapilRankRow } from "@/lib/api";
import { useOutline } from "@/lib/outline";
import { provinceHref } from "@/lib/routes";

// Deep-sea panel ramp: dark sea for sparse provinces, cream for the densest,
// so Java "glows". Quantile classes — density spans 13 → 16,600 jiwa/km².
export const SEA_RAMP = ["#1A2E55", "#22417A", "#2B57A3", "#3F73CC", "#6B96E6", "#A3BEF0", "#F3ECDD"];

function quantiles(values: number[], n: number) {
  const s = [...values].sort((a, b) => a - b);
  return Array.from({ length: n }, (_, i) => s[Math.min(s.length - 1, Math.floor(((i + 1) * s.length) / n))]);
}

/** Interactive province density map for the home hero (dark sea surface). */
export function HeroMap({ density, population }: { density: DukcapilRankRow[]; population: DukcapilRankRow[] }) {
  const outline = useOutline("provinces");
  const router = useRouter();
  const box = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ c: string; x: number; y: number } | null>(null);

  const byCode = useMemo(() => {
    const m = new Map<string, { name: string; density: number; pop?: number }>();
    for (const r of density) m.set(r.domain_id, { name: r.domain_name, density: r.value });
    for (const r of population) {
      const e = m.get(r.domain_id);
      if (e) e.pop = r.value;
    }
    return m;
  }, [density, population]);

  const color = useMemo(() => {
    const cuts = quantiles(density.map((r) => r.value), SEA_RAMP.length);
    return (v: number | undefined) => {
      if (v === undefined) return "#2E3442";
      const i = cuts.findIndex((c) => v <= c);
      return SEA_RAMP[i === -1 ? SEA_RAMP.length - 1 : i];
    };
  }, [density]);

  const h = hover ? byCode.get(hover.c) : null;

  return (
    <div ref={box} className="relative">
      {outline ? (
        <svg viewBox={`0 0 ${outline.w} ${outline.h}`} className="block h-auto w-full" role="img" aria-label="Peta kepadatan penduduk per provinsi">
          {outline.items.map((it) => (
            <path
              key={it.c}
              d={it.d}
              fill={color(byCode.get(it.c)?.density)}
              stroke={hover?.c === it.c ? "#E9B54A" : "#0A1A33"}
              strokeWidth={hover?.c === it.c ? 2.2 : 0.8}
              strokeLinejoin="round"
              className="cursor-pointer transition-[fill] duration-150"
              tabIndex={0}
              role="link"
              aria-label={`${byCode.get(it.c)?.name ?? it.n}: ${formatDecimal(byCode.get(it.c)?.density ?? 0, 0)} jiwa per km²`}
              onMouseMove={(e) => {
                const r = box.current!.getBoundingClientRect();
                setHover({ c: it.c, x: e.clientX - r.left, y: e.clientY - r.top });
              }}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover({ c: it.c, x: 24, y: 24 })}
              onBlur={() => setHover(null)}
              onClick={() => router.push(provinceHref(it.c))}
              onKeyDown={(e) => e.key === "Enter" && router.push(provinceHref(it.c))}
            />
          ))}
        </svg>
      ) : (
        <div className="aspect-[1000/375] w-full animate-pulse rounded-xl bg-white/5" />
      )}
      {hover && h && (
        <div
          className="pointer-events-none absolute z-10 rounded-xl bg-kertas-50 px-3 py-2 text-[12.5px] text-laut-950 shadow-lift"
          style={{ left: Math.min(hover.x + 14, (box.current?.clientWidth ?? 400) - 200), top: hover.y + 14 }}
        >
          <div className="text-[13.5px] font-bold">{h.name}</div>
          <div className="tabular-nums">
            {h.pop !== undefined && <>{formatNumber(h.pop)} jiwa · </>}
            {formatDecimal(h.density, 1)} jiwa/km²
          </div>
          <div className="mt-0.5 text-[11px] text-laut-700">Klik untuk profil →</div>
        </div>
      )}
    </div>
  );
}
