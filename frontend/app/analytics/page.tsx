"use client";

import { useState } from "react";
import { RankGrowthSection } from "@/components/RankGrowthSection";
import { CorrelationSection } from "@/components/CorrelationSection";
import { TrendSection } from "@/components/TrendSection";
import { MapSection } from "@/components/MapSection";

type Mode = "ranking" | "growth" | "trend" | "correlation" | "map";

const MODES: { v: Mode; label: string; hint: string }[] = [
  { v: "map", label: "Map", hint: "choropleth by province" },
  { v: "ranking", label: "Ranking", hint: "rank regions by an indicator" },
  { v: "growth", label: "Growth", hint: "year-over-year change per region" },
  { v: "trend", label: "National trend", hint: "national trajectory over time" },
  { v: "correlation", label: "Correlation", hint: "relate two indicators" },
];

export default function AnalyticsPage() {
  const [mode, setMode] = useState<Mode>("map");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink-text">Analytics</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Rank regions, track growth over time, or correlate two indicators — all computed from the real data.
        </p>
      </div>

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
