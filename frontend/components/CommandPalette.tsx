"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { regionLabel, searchApi, type SearchResults } from "@/lib/api";
import { POSTS } from "@/lib/posts";
import { routes } from "@/lib/routes";

// Global search palette (⌘K / Ctrl+K, or any element that calls openSearch()).
// Regions and indicators come from /api/search/; Sorotan posts are local config.

const OPEN_EVENT = "nusastats:open-search";

/** Open the palette from anywhere (top bar, hero search box, mobile nav). */
export function openSearch(initial = "") {
  window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: initial }));
}

type Item = { key: string; group: string; title: string; meta: string; href: string };

const QUICK: Item[] = [
  { key: "q-explore", group: "Mulai dari", title: "Jelajahi wilayah", meta: "Peta & daftar provinsi", href: routes.explore },
  { key: "q-sorotan", group: "Mulai dari", title: "Sorotan", meta: "15 cerita data", href: routes.sorotan },
  { key: "q-vars", group: "Mulai dari", title: "Katalog indikator BPS", meta: "1.692 indikator", href: routes.variables },
  { key: "q-duk", group: "Mulai dari", title: "Kependudukan (Dukcapil)", meta: "Ringkasan nasional", href: routes.dukcapil },
  { key: "q-keu", group: "Mulai dari", title: "Keuangan daerah (DJPK)", meta: "APBD & PAD", href: routes.keuangan },
];

function regionTitle(name: string, label: string) {
  if (label === "Provinsi" || label === "Nasional" || label === "Kecamatan" || label === "Distrik") return name;
  return regionLabel(name, label);
}

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [res, setRes] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Open on ⌘K / Ctrl+K / "/" and on the custom event.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target as HTMLElement)?.tagName ?? "");
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing)) {
        e.preventDefault();
        setOpen(true);
      }
    };
    const onOpen = (e: Event) => {
      setQ(((e as CustomEvent).detail as string) || "");
      setOpen(true);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_EVENT, onOpen);
    };
  }, []);

  useEffect(() => {
    if (open) {
      setActive(0);
      requestAnimationFrame(() => inputRef.current?.focus());
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
  }, [open]);

  // Debounced server search.
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setRes(null);
      return;
    }
    setLoading(true);
    let cancelled = false;
    const t = setTimeout(() => {
      searchApi
        .search(term)
        .then((r) => !cancelled && setRes(r))
        .catch(() => !cancelled && setRes({ q: term, regions: [], subregions: [], variables: [] }))
        .finally(() => !cancelled && setLoading(false));
    }, 160);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q]);

  const items: Item[] = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (term.length < 2) return QUICK;
    const posts = POSTS.filter((p) => `${p.title} ${p.subtitle} ${p.tag}`.toLowerCase().includes(term))
      .slice(0, 4)
      .map((p) => ({ key: `p-${p.slug}`, group: "Sorotan", title: p.title, meta: p.tag, href: routes.post(p.slug) }));
    const regions = [...(res?.regions ?? []), ...(res?.subregions ?? [])].map((r) => ({
      key: `r-${r.source}-${r.code}`,
      group: "Wilayah",
      title: regionTitle(r.name, r.label),
      meta: [r.label, r.context].filter(Boolean).join(" · "),
      href: routes.region(r.code),
    }));
    const vars = (res?.variables ?? []).map((v) => ({
      key: `v-${v.code}`,
      group: "Indikator BPS",
      title: v.name,
      meta: [v.unit, v.years[0] && v.years[1] ? `${v.years[0]}–${v.years[1]}` : ""].filter(Boolean).join(" · "),
      href: routes.variable(v.code),
    }));
    return [...regions, ...vars, ...posts];
  }, [q, res]);

  useEffect(() => setActive(0), [items.length]);

  useEffect(() => {
    listRef.current?.querySelector(`[data-idx="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  if (!open) return null;

  const go = (it: Item | undefined) => {
    if (!it) return;
    setOpen(false);
    setQ("");
    router.push(it.href);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") setOpen(false);
    else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(items.length - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      go(items[active]);
    }
  };

  const term = q.trim();
  let lastGroup = "";

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[12vh]" role="presentation">
      <button
        aria-label="Tutup pencarian"
        className="absolute inset-0 cursor-default bg-laut-950/45 backdrop-blur-[2px]"
        onClick={() => setOpen(false)}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Cari"
        className="relative w-full max-w-xl animate-fade-up overflow-hidden rounded-2xl border border-ink-border bg-ink-panel shadow-lift"
        onKeyDown={onKeyDown}
      >
        <div className="flex items-center gap-3 border-b border-ink-border px-4">
          <SearchIcon className="h-5 w-5 shrink-0 text-ink-accent" />
          <input
            ref={inputRef}
            id="global-search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cari wilayah, indikator, atau analisis…"
            aria-label="Cari wilayah, indikator, atau analisis"
            aria-controls="global-search-list"
            aria-activedescendant={items[active] ? `gs-${items[active].key}` : undefined}
            role="combobox"
            aria-expanded="true"
            className="h-14 w-full bg-transparent text-[15px] text-ink-text placeholder:text-ink-faint focus:outline-none"
          />
          {loading && <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-ink-border border-t-ink-accent" />}
          <kbd className="hidden shrink-0 rounded-md border border-ink-border bg-ink-panel2 px-1.5 py-0.5 font-mono text-[11px] text-ink-muted sm:block">
            Esc
          </kbd>
        </div>
        <div ref={listRef} id="global-search-list" role="listbox" className="scroll-thin max-h-[56vh] overflow-y-auto py-2">
          {items.length === 0 && term.length >= 2 && !loading && (
            <div className="px-5 py-10 text-center">
              <div className="text-sm font-medium text-ink-text">Tidak ada hasil untuk “{term}”</div>
              <p className="mt-1 text-sm text-ink-muted">Coba nama wilayah (mis. “Bone”) atau kata kunci indikator (mis. “kemiskinan”).</p>
            </div>
          )}
          {items.map((it, i) => {
            const header = it.group !== lastGroup ? it.group : null;
            lastGroup = it.group;
            return (
              <div key={it.key}>
                {header && (
                  <div className="px-4 pb-1 pt-3 font-mono text-[10.5px] font-medium uppercase tracking-[0.1em] text-ink-warmText">
                    {header}
                  </div>
                )}
                <button
                  id={`gs-${it.key}`}
                  data-idx={i}
                  role="option"
                  aria-selected={i === active}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => go(it)}
                  className={`flex w-full items-baseline justify-between gap-4 px-4 py-2 text-left text-sm ${
                    i === active ? "bg-ink-accent/10" : ""
                  }`}
                >
                  <span className="min-w-0 truncate font-medium text-ink-text">{it.title}</span>
                  <span className="shrink-0 truncate text-xs text-ink-muted" style={{ maxWidth: "45%" }}>
                    {it.meta}
                  </span>
                </button>
              </div>
            );
          })}
        </div>
        <div className="flex items-center gap-4 border-t border-ink-border bg-ink-panel2/60 px-4 py-2 text-[11.5px] text-ink-muted">
          <span>
            <kbd className="font-mono">↑↓</kbd> pilih
          </span>
          <span>
            <kbd className="font-mono">Enter</kbd> buka
          </span>
          <span className="ml-auto">Sumber: BPS · Dukcapil</span>
        </div>
      </div>
    </div>
  );
}

export function SearchIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={className} aria-hidden>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}
