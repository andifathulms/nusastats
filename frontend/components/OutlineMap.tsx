"use client";

import { useMemo, useRef, useState } from "react";
import { useOutline } from "@/lib/outline";

export type OutlineValue = { name: string; value: number; lines?: string[] };

function quantileCuts(values: number[], n: number) {
  const s = [...values].sort((a, b) => a - b);
  return Array.from({ length: n }, (_, i) => s[Math.min(s.length - 1, Math.floor(((i + 1) * s.length) / n))]);
}

/**
 * Lightweight province/kab choropleth from the pre-projected outlines
 * (quantile classes over `ramp`). Hover/focus shows a tooltip, click calls
 * `onSelect`. `highlight` lets a linked list light a region up from outside.
 */
export function OutlineMap({
  kind = "provinces",
  values,
  ramp,
  noData,
  stroke,
  highlight,
  onHover,
  onSelect,
  ariaLabel,
  hint = "Klik untuk profil →",
}: {
  kind?: "provinces" | "regencies";
  values: Map<string, OutlineValue>;
  ramp: string[];
  noData: string;
  stroke: string;
  highlight?: string | null;
  onHover?: (code: string | null) => void;
  onSelect?: (code: string) => void;
  ariaLabel: string;
  hint?: string;
}) {
  const outline = useOutline(kind);
  const box = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<{ c: string; x: number; y: number } | null>(null);

  const color = useMemo(() => {
    const cuts = quantileCuts([...values.values()].map((v) => v.value), ramp.length);
    return (v: number | undefined) => {
      if (v === undefined) return noData;
      const i = cuts.findIndex((c) => v <= c);
      return ramp[i === -1 ? ramp.length - 1 : i];
    };
  }, [values, ramp, noData]);

  const active = tip?.c ?? highlight ?? null;
  const hv = tip ? values.get(tip.c) : null;
  // Draw the active region last so its outline sits on top of its neighbours.
  const items = outline ? [...outline.items].sort((a, b) => Number(a.c === active) - Number(b.c === active)) : [];

  const enter = (c: string, x: number, y: number) => {
    setTip({ c, x, y });
    onHover?.(c);
  };
  const leave = () => {
    setTip(null);
    onHover?.(null);
  };

  return (
    <div ref={box} className="relative">
      {outline ? (
        <svg viewBox={`0 0 ${outline.w} ${outline.h}`} className="block h-auto w-full" role="img" aria-label={ariaLabel}>
          {items.map((it) => {
            const v = values.get(it.c);
            const on = it.c === active;
            return (
              <path
                key={it.c}
                d={it.d}
                fill={color(v?.value)}
                stroke={on ? "#D69A2D" : stroke}
                strokeWidth={on ? 2.4 : 0.8}
                strokeLinejoin="round"
                className={onSelect ? "cursor-pointer outline-none" : "outline-none"}
                tabIndex={onSelect ? 0 : -1}
                role={onSelect ? "link" : undefined}
                aria-label={v ? `${v.name}: ${v.lines?.[0] ?? v.value}` : it.n}
                onMouseMove={(e) => {
                  const r = box.current!.getBoundingClientRect();
                  enter(it.c, e.clientX - r.left, e.clientY - r.top);
                }}
                onMouseLeave={leave}
                onFocus={() => enter(it.c, 24, 24)}
                onBlur={leave}
                onClick={() => onSelect?.(it.c)}
                onKeyDown={(e) => e.key === "Enter" && onSelect?.(it.c)}
              />
            );
          })}
        </svg>
      ) : (
        <div className="aspect-[1000/375] w-full animate-pulse rounded-xl bg-ink-panel2/60" />
      )}
      {tip && hv && (
        <div
          className="pointer-events-none absolute z-10 rounded-xl border border-kertas-300 bg-kertas-50 px-3 py-2 text-[12.5px] text-laut-950 shadow-lift"
          style={{ left: Math.max(0, Math.min(tip.x + 14, (box.current?.clientWidth ?? 400) - 210)), top: tip.y + 14 }}
        >
          <div className="text-[13.5px] font-bold">{hv.name}</div>
          {hv.lines?.map((l) => (
            <div key={l} className="tabular-nums">
              {l}
            </div>
          ))}
          {onSelect && <div className="mt-0.5 text-[11px] text-laut-700">{hint}</div>}
        </div>
      )}
    </div>
  );
}
