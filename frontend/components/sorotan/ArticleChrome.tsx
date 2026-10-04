"use client";

import { useEffect, useState } from "react";

/** Kunyit reading-progress line pinned under the top bar. */
export function ReadingProgress() {
  const [p, setP] = useState(0);
  useEffect(() => {
    const on = () => {
      const h = document.documentElement;
      const max = h.scrollHeight - h.clientHeight;
      setP(max > 0 ? Math.min(1, h.scrollTop / max) : 0);
    };
    on();
    window.addEventListener("scroll", on, { passive: true });
    window.addEventListener("resize", on);
    return () => {
      window.removeEventListener("scroll", on);
      window.removeEventListener("resize", on);
    };
  }, []);
  return (
    <div aria-hidden className="fixed inset-x-0 top-16 z-20 h-[3px] bg-transparent">
      <div className="h-full bg-kunyit" style={{ width: `${p * 100}%` }} />
    </div>
  );
}

/** Section index with scroll-spy. */
export function ArticleIndex({ sections }: { sections: [string, string][] }) {
  const [active, setActive] = useState(sections[0]?.[0]);
  useEffect(() => {
    const els = sections.map(([id]) => document.getElementById(id)).filter(Boolean) as HTMLElement[];
    const io = new IntersectionObserver(
      (entries) => {
        const vis = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (vis[0]) setActive(vis[0].target.id);
      },
      { rootMargin: "-80px 0px -60% 0px" },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [sections]);
  return (
    <nav aria-label="Di artikel ini" className="text-[13.5px]">
      <div className="mb-3 font-mono text-[11px] uppercase tracking-[0.1em] text-ink-warmText">Di artikel ini</div>
      {sections.map(([id, label]) => (
        <a
          key={id}
          href={`#${id}`}
          className={`block border-l-2 py-1.5 pl-3.5 transition-colors ${
            active === id ? "border-ink-accent font-semibold text-ink-text" : "border-ink-border text-ink-muted hover:text-ink-text"
          }`}
        >
          {label}
        </a>
      ))}
    </nav>
  );
}

/** Copies the article URL; falls back to selecting nothing if the clipboard is refused. */
export function CopyLink() {
  const [done, setDone] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard
          ?.writeText(window.location.href)
          .then(() => {
            setDone(true);
            setTimeout(() => setDone(false), 1800);
          })
          .catch(() => {});
      }}
      className="rounded-full border border-ink-borderStrong px-3.5 py-1 text-[13px] font-semibold text-ink-text transition-colors hover:border-ink-accent/60"
    >
      {done ? "Tautan disalin ✓" : "Salin tautan"}
    </button>
  );
}
