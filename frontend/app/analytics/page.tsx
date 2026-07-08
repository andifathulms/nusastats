"use client";

import { useState } from "react";
import { RankGrowthSection } from "@/components/RankGrowthSection";
import { CorrelationSection } from "@/components/CorrelationSection";
import { TrendSection } from "@/components/TrendSection";

type Mode = "ranking" | "growth" | "trend" | "correlation";

const MODES: { v: Mode; label: string; hint: string }[] = [
  { v: "ranking", label: "Ranking", hint: "rank regions by an indicator" },
  { v: "growth", label: "Growth", hint: "year-over-year change per region" },
  { v: "trend", label: "National trend", hint: "national trajectory over time" },
  { v: "correlation", label: "Correlation", hint: "relate two indicators" },
];

export default function AnalyticsPage() {
  const [mode, setMode] = useState<Mode>("ranking");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink-text">Analytics</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Rank regions, track growth over time, or correlate two indicators — all computed from the real data.
        </p>
      </div>

      <div className="inline-flex flex-wrap gap-1 rounded-lg border border-ink-border p-1">
        {MODES.map((m) => (
          <button
            key={m.v}
            onClick={() => setMode(m.v)}
            title={m.hint}
            className={`rounded-md px-4 py-1.5 text-sm ${
              mode === m.v ? "bg-ink-accent text-white" : "text-ink-muted hover:text-ink-text"
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {mode === "correlation" && <CorrelationSection />}
      {mode === "trend" && <TrendSection />}
      {(mode === "ranking" || mode === "growth") && <RankGrowthSection mode={mode} />}
    </div>
  );
}
