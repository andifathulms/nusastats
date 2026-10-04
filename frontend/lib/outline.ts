"use client";

import { useEffect, useState } from "react";

// Pre-projected SVG outlines (scripts/build_outline_paths.py) for overview maps,
// story covers and region silhouettes. Fetched once per session and shared.
export type Outline = { w: number; h: number; items: { c: string; n: string; d: string }[] };
type Kind = "provinces" | "regencies";

const cache: Partial<Record<Kind, Promise<Outline>>> = {};

export function loadOutline(kind: Kind): Promise<Outline> {
  cache[kind] ??= fetch(`/outline-${kind}.json`).then((r) => {
    if (!r.ok) throw new Error(`outline ${kind} -> ${r.status}`);
    return r.json();
  });
  return cache[kind]!;
}

export function useOutline(kind: Kind): Outline | null {
  const [o, setO] = useState<Outline | null>(null);
  useEffect(() => {
    let live = true;
    loadOutline(kind).then((v) => live && setO(v)).catch(() => {});
    return () => {
      live = false;
    };
  }, [kind]);
  return o;
}
