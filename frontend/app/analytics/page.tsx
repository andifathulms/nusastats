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
        <div className="font-mono text-[11.5px] font-medium uppercase tracking-[0.1em] text-ink-warmText">
          Badan Pusat Statistik
        </div>
        <h1 className="mt-2 font-display text-4xl font-medium leading-[1.02] tracking-[-0.02em] text-ink-text sm:text-5xl">Analitik</h1>
        <p className="mt-2 max-w-2xl text-sm text-ink-muted">
          Peringkatkan wilayah, lacak pertumbuhan dari waktu ke waktu, atau korelasikan dua indikator — semuanya dihitung dari data sebenarnya.
        </p>
      </header>

      <div className="inline-flex flex-wrap gap-1 rounded-full border border-ink-border bg-ink-bg2 p-1">
        {MODES.map((m) => (
          <button
            key={m.v}
            onClick={() => setMode(m.v)}
            title={m.hint}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
              mode === m.v
                ? "bg-laut-950 text-kertas-200 shadow-tile dark:bg-ink-accent dark:text-ink-onAccent"
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
