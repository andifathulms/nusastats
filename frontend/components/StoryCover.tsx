"use client";

import { useEffect, useRef, useState } from "react";
import { useOutline } from "@/lib/outline";

/**
 * Sorotan cover: the archipelago from real boundaries. A province is
 * highlighted (kunyit + dashed ring) only when the story itself names it —
 * otherwise the whole country is shown, never an invented focus.
 */
export function StoryCover({
  highlight = [],
  label,
  dark = false,
  className = "",
}: {
  highlight?: string[];
  label?: string;
  dark?: boolean;
  className?: string;
}) {
  const outline = useOutline("provinces");
  const svg = useRef<SVGSVGElement>(null);
  const [ring, setRing] = useState<{ x: number; y: number; r: number } | null>(null);

  useEffect(() => {
    if (!outline || !svg.current || highlight.length === 0) return;
    const els = [...svg.current.querySelectorAll<SVGPathElement>("path[data-hl]")];
    if (!els.length) return;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const el of els) {
      const b = el.getBBox();
      x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y);
      x1 = Math.max(x1, b.x + b.width); y1 = Math.max(y1, b.y + b.height);
    }
    setRing({ x: (x0 + x1) / 2, y: (y0 + y1) / 2, r: Math.max(x1 - x0, y1 - y0) / 2 + 18 });
  }, [outline, highlight.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  const base = dark ? "#22417A" : "rgb(var(--cover-land))";
  return (
    <div className={`relative grid place-items-center overflow-hidden ${dark ? "bg-laut-950" : "bg-ink-bg2"} ${className}`}>
      {outline && (
        <svg ref={svg} viewBox={`0 0 ${outline.w} ${outline.h}`} className="h-auto w-[90%]" aria-hidden>
          {outline.items.map((it) => {
            const hl = highlight.includes(it.c);
            return (
              <path
                key={it.c}
                d={it.d}
                data-hl={hl ? "" : undefined}
                fill={hl ? "#D69A2D" : base}
                stroke={dark ? "#0A1A33" : "rgb(var(--ink-bg2))"}
                strokeWidth={0.9}
              />
            );
          })}
          {ring && <circle cx={ring.x} cy={ring.y} r={ring.r} fill="none" stroke="#D69A2D" strokeWidth={3} strokeDasharray="5 5" />}
        </svg>
      )}
      {label && (
        <span
          className={`absolute bottom-2.5 left-3 rounded-md px-2 py-0.5 font-mono text-[10.5px] ${
            dark ? "text-kunyit-light" : "bg-ink-panel/90 text-ink-warmText"
          }`}
        >
          {label}
        </span>
      )}
    </div>
  );
}
