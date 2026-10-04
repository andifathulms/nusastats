"use client";

import { useEffect, useState } from "react";

/** Eases a number up to `target` once (≈1.4s). Reduced motion shows it at rest. */
export function useCountUp(target: number | null | undefined, ms = 1400): number | null {
  const [v, setV] = useState<number | null>(null);
  useEffect(() => {
    if (target === null || target === undefined) return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setV(target);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / ms);
      setV(Math.round(target * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}
