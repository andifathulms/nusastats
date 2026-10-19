"use client";

import { useEffect, useState } from "react";
import { TEMAS, TEMA_IDS, isTema, type Tema } from "@/components/cards/brand";

const KEY = "nusastats:carousel:tema";

/** The card palette chosen on /carousel, remembered in this browser. */
export function useTema(): [Tema, (t: Tema) => void] {
  const [tema, setTema] = useState<Tema>("malam");
  useEffect(() => {
    try {
      const t = localStorage.getItem(KEY);
      if (isTema(t)) setTema(t);
    } catch {
      /* storage blocked: keep the default */
    }
  }, []);
  const set = (t: Tema) => {
    setTema(t);
    try {
      localStorage.setItem(KEY, t);
    } catch {
      /* not remembered, still applied */
    }
  };
  return [tema, set];
}

/** Four palettes as swatches: the card background with its saffron and coral marks. */
export function TemaPicker({ tema, onChange }: { tema: Tema; onChange: (t: Tema) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Tema kartu">
      <span className="mr-1 text-xs font-semibold text-ink-muted">Tema kartu</span>
      {TEMA_IDS.map((id) => {
        const p = TEMAS[id];
        const on = id === tema;
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(id)}
            className={`inline-flex items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-sm transition-colors ${
              on ? "border-ink-accent text-ink-accent" : "border-ink-border text-ink-text hover:border-ink-accent"
            }`}
          >
            <span className="relative inline-block h-6 w-6 overflow-hidden rounded-full ring-1 ring-ink-border" style={{ background: p.bg }}>
              <span className="absolute bottom-1 left-1 h-1.5 w-1.5 rounded-full" style={{ background: p.sorot }} />
              <span className="absolute right-1 top-1 h-2 w-2 rounded-full" style={{ background: p.subject.penduduk }} />
            </span>
            {p.label}
          </button>
        );
      })}
    </div>
  );
}
