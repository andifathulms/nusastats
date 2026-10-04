"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useOutline } from "@/lib/outline";
import { Skeleton } from "@/components/ui";

export type Crumb = { label: string; href?: string };
export type HeroFact = { value: string | null; label: string; chip?: string | null };

/** Breadcrumb trail: Indonesia › Sulawesi Selatan › Kota Makassar … */
export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Lokasi" className="flex flex-wrap items-center gap-1.5 text-[13.5px] text-ink-muted">
      {items.map((c, i) => (
        <span key={`${c.label}-${i}`} className="flex items-center gap-1.5">
          {i > 0 && <span aria-hidden className="text-ink-faint">›</span>}
          {c.href && i < items.length - 1 ? (
            <Link href={c.href} className="transition-colors hover:text-ink-accent">
              {c.label}
            </Link>
          ) : (
            <span className={i === items.length - 1 ? "font-semibold text-ink-text" : ""} aria-current={i === items.length - 1 ? "page" : undefined}>
              {c.label}
            </span>
          )}
        </span>
      ))}
    </nav>
  );
}

/** The region's real outline, framed to its own bounding box. */
function Silhouette({ kind, code }: { kind: "provinces" | "regencies"; code: string }) {
  const outline = useOutline(kind);
  const path = useRef<SVGPathElement>(null);
  const [box, setBox] = useState<string | null>(null);
  const item = outline?.items.find((it) => it.c === code);

  useEffect(() => {
    if (!path.current) return;
    const b = path.current.getBBox();
    const m = Math.max(b.width, b.height) * 0.06;
    setBox(`${b.x - m} ${b.y - m} ${b.width + 2 * m} ${b.height + 2 * m}`);
  }, [item]);

  if (!item) return null;
  return (
    <svg viewBox={box ?? `0 0 ${outline!.w} ${outline!.h}`} className={`h-full w-full transition-opacity duration-300 ${box ? "opacity-100" : "opacity-0"}`} aria-hidden>
      <path ref={path} d={item.d} fill="#6B96E6" stroke="#A3BEF0" strokeWidth={0.5} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}

/** Dark sea profile band: eyebrow, name, tags, headline facts with rank chips, silhouette. */
export function RegionHero({
  eyebrow,
  name,
  tags,
  code,
  facts,
  silhouette,
}: {
  eyebrow: string;
  name: string;
  tags: string[];
  code: string;
  facts: HeroFact[];
  silhouette?: { kind: "provinces" | "regencies"; code: string } | null;
}) {
  return (
    <section className="relative grid overflow-hidden rounded-[28px] bg-coal-bg text-coal-text shadow-lift ring-1 ring-white/5 md:grid-cols-[minmax(0,1fr)_300px]">
      <div className="pointer-events-none absolute inset-0 bg-royal-weave opacity-50" />
      <div className="relative p-6 sm:p-9">
        <div className="font-mono text-[11.5px] uppercase tracking-[0.1em] text-ink-gold">{eyebrow}</div>
        <h1 className="mt-3 font-display text-[40px] font-medium leading-[1.02] tracking-[-0.02em] sm:text-6xl">{name}</h1>
        <div className="mt-4 flex flex-wrap gap-2">
          {tags.map((t) => (
            <span key={t} className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold">
              {t}
            </span>
          ))}
          <span className="rounded-full bg-white/5 px-3 py-1 font-mono text-xs text-coal-muted">kode {code}</span>
        </div>
        {facts.length > 0 && (
          <div className="mt-7 grid grid-cols-2 gap-y-5 border-t border-white/10 pt-5 lg:grid-cols-4">
            {facts.map((f) => (
              <div key={f.label} className="pr-4">
                {f.value === null ? (
                  <Skeleton className="h-8 w-24 !bg-white/10" />
                ) : (
                  <div className="whitespace-nowrap text-[26px] font-extrabold leading-tight tracking-[-0.02em] tabular-nums sm:text-[30px]">{f.value}</div>
                )}
                <div className="text-[12.5px] text-coal-muted">{f.label}</div>
                {f.chip && (
                  <span className="mt-2 inline-block rounded-full bg-kunyit-light px-2.5 py-0.5 font-mono text-[11px] font-semibold text-laut-950">
                    {f.chip}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      {silhouette && (
        <div className="relative hidden place-items-center bg-[radial-gradient(circle_at_60%_40%,#163570,transparent_70%)] p-8 md:grid">
          <div className="h-64 w-full">
            <Silhouette kind={silhouette.kind} code={silhouette.code} />
          </div>
        </div>
      )}
    </section>
  );
}

/** Underline tab bar that sticks under the top bar while scrolling the profile. */
export function StickyTabs<T extends string>({ tabs, value, onChange }: { tabs: [T, string][]; value: T; onChange: (t: T) => void }) {
  return (
    <div className="sticky top-16 z-20 -mx-4 border-b border-ink-border bg-ink-bg/90 px-4 backdrop-blur-md sm:-mx-5 sm:px-5 lg:-mx-8 lg:px-8">
      <div role="tablist" className="scroll-thin flex gap-1 overflow-x-auto">
        {tabs.map(([v, label]) => (
          <button
            key={v}
            role="tab"
            aria-selected={value === v}
            onClick={() => {
              onChange(v);
              // Keep the tab bar in view when switching from far down the page.
              const el = document.getElementById("profile-body");
              if (el && el.getBoundingClientRect().top < 0) el.scrollIntoView({ behavior: "smooth" });
            }}
            className={`-mb-px shrink-0 border-b-2 px-4 py-3 text-sm font-semibold transition-colors ${
              value === v ? "border-ink-accent text-ink-accent" : "border-transparent text-ink-muted hover:text-ink-text"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
