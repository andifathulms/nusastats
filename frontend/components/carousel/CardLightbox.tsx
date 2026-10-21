"use client";

import { useEffect, useState } from "react";

export type LightboxSlide = { src: string; label: string };

/** A card preview at full size: click a thumbnail to open, ←/→ (or the arrows) to page, Esc to close. */
export function CardLightbox({ slides, index, onClose, onIndex }: { slides: LightboxSlide[]; index: number; onClose: () => void; onIndex: (i: number) => void }) {
  const [size, setSize] = useState({ w: 1080, h: 1920 });
  useEffect(() => {
    const fit = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight" && index < slides.length - 1) onIndex(index + 1);
      if (e.key === "ArrowLeft" && index > 0) onIndex(index - 1);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [index, slides.length, onClose, onIndex]);
  const slide = slides[index];
  if (!slide) return null;
  const scale = Math.min((size.h - 96) / 1920, (size.w - 160) / 1080);
  const arrow = "absolute top-1/2 -translate-y-1/2 rounded-full bg-white/10 px-4 py-3 text-2xl text-white hover:bg-white/20 disabled:opacity-30";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85" onClick={onClose} role="dialog" aria-modal="true" aria-label={slide.label}>
      <div className="relative" onClick={(e) => e.stopPropagation()} style={{ width: 1080 * scale, height: 1920 * scale }}>
        <div className="relative overflow-hidden rounded-xl ring-1 ring-white/20" style={{ width: 1080 * scale, height: 1920 * scale }}>
          {/* Shows until the card draws over it (large desa maps take a few seconds). */}
          <div className="absolute inset-0 flex items-center justify-center text-sm text-white/60">Memuat kartu…</div>
          <iframe
            key={slide.src}
            src={slide.src}
            title={slide.label}
            className="relative"
            style={{ width: 1080, height: 1920, transform: `scale(${scale})`, transformOrigin: "0 0", border: 0 }}
          />
        </div>
        <div className="absolute -bottom-9 left-0 right-0 text-center text-sm text-white/80">
          {index + 1} / {slides.length} · {slide.label}
        </div>
      </div>
      <button type="button" aria-label="Sebelumnya" className={`${arrow} left-4`} disabled={index === 0}
        onClick={(e) => { e.stopPropagation(); onIndex(index - 1); }}>←</button>
      <button type="button" aria-label="Berikutnya" className={`${arrow} right-4`} disabled={index === slides.length - 1}
        onClick={(e) => { e.stopPropagation(); onIndex(index + 1); }}>→</button>
      <button type="button" aria-label="Tutup" className="absolute right-4 top-4 rounded-full bg-white/10 px-4 py-2 text-white hover:bg-white/20" onClick={onClose}>
        Tutup ✕
      </button>
    </div>
  );
}
