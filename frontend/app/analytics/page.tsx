"use client";

import { useState } from "react";
import { RankGrowthSection } from "@/components/RankGrowthSection";
import { CorrelationSection } from "@/components/CorrelationSection";
import { TrendSection } from "@/components/TrendSection";
import { MapSection } from "@/components/MapSection";

type Mode = "ranking" | "growth" | "trend" | "correlation" | "map";

const MODES: { v: Mode; label: string; hint: string }[] = [
  { v: "map", label: "Peta", hint: "peta koroplet per provinsi" },
  { v: "ranking", label: "Peringkat", hint: "peringkat wilayah menurut indikator" },
  { v: "growth", label: "Pertumbuhan", hint: "perubahan antar tahun per wilayah" },
  { v: "trend", label: "Tren nasional", hint: "lintasan nasional dari waktu ke waktu" },
  { v: "correlation", label: "Korelasi", hint: "hubungkan dua indikator" },
];

export default function AnalyticsPage() {
  const [mode, setMode] = useState<Mode>("map");

  return (
    <div className="space-y-6">
      <header className="border-b border-ink-border pb-5">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-ink-accent">
          <span className="h-1.5 w-1.5 rounded-full bg-ink-accent" />
          Badan Pusat Statistik
        </div>
        <h1 className="mt-2 font-display text-3xl font-medium tracking-tight text-ink-text sm:text-4xl">Analitik</h1>
        <p className="mt-2 max-w-2xl text-sm text-ink-muted">
          Peringkatkan wilayah, lacak pertumbuhan dari waktu ke waktu, atau korelasikan dua indikator — semuanya dihitung dari data sebenarnya.
        </p>
      </header>

      <div className="inline-flex flex-wrap gap-1 rounded-xl border border-ink-border/80 bg-ink-panel/50 p-1 backdrop-blur-sm">
        {MODES.map((m) => (
          <button
            key={m.v}
            onClick={() => setMode(m.v)}
            title={m.hint}
            className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${
              mode === m.v
                ? "bg-brand-gradient text-white shadow-glow"
                : "text-ink-muted hover:bg-ink-panel2/70 hover:text-ink-text"
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {mode === "map" && <MapSection />}
      {mode === "correlation" && <CorrelationSection />}
      {mode === "trend" && <TrendSection />}
      {(mode === "ranking" || mode === "growth") && <RankGrowthSection mode={mode} />}
    </div>
  );
}
