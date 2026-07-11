"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api, formatNumber, type VariableRow } from "@/lib/api";

export type PickedVariable = { variable_id: string; name: string; unit: string };

export function IndicatorPicker({
  value,
  onPick,
}: {
  value: PickedVariable | null;
  onPick: (v: PickedVariable) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<VariableRow[]>([]);
  const [rect, setRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      api.variables(q ? { keyword: q } : {}).then((d) => setRows(d.results));
    }, 250);
    return () => clearTimeout(t);
  }, [q, open]);

  // Position the portalled dropdown against the trigger button, and keep it
  // pinned while the page scrolls or resizes.
  useEffect(() => {
    if (!open) return;
    const place = () => {
      const r = boxRef.current?.getBoundingClientRect();
      if (r) setRect({ top: r.bottom + 4, left: r.left, width: r.width });
    };
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (boxRef.current?.contains(t)) return;
      if (panelRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <div ref={boxRef} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full rounded-lg border border-ink-border bg-ink-panel px-4 py-2.5 text-left text-sm text-ink-text hover:border-ink-accent/60"
      >
        {value ? (
          <span>
            {value.name} {value.unit && <span className="text-ink-muted">({value.unit})</span>}
          </span>
        ) : (
          <span className="text-ink-muted">Pilih indikator…</span>
        )}
      </button>
      {open &&
        rect &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={panelRef}
            className="fixed z-50 rounded-lg border border-ink-border bg-ink-panel shadow-xl shadow-black/50"
            style={{ top: rect.top, left: rect.left, width: rect.width }}
          >
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Cari indikator…"
              className="w-full rounded-t-lg border-b border-ink-border bg-ink-panel2 px-3 py-2 text-sm text-ink-text placeholder:text-ink-muted focus:outline-none"
            />
            <div className="max-h-72 overflow-y-auto scroll-thin">
              {rows.map((r) => (
                <button
                  key={r.id}
                  onClick={() => {
                    onPick({ variable_id: r.variable_id, name: r.name, unit: r.unit });
                    setOpen(false);
                    setQ("");
                  }}
                  className="block w-full px-3 py-2 text-left text-sm text-ink-text hover:bg-ink-panel2"
                >
                  <div className="truncate">{r.name}</div>
                  <div className="text-xs text-ink-muted">
                    {r.subject_category} · {formatNumber(r.data_point_count)} titik data
                  </div>
                </button>
              ))}
              {rows.length === 0 && <div className="px-3 py-4 text-sm text-ink-muted">Tidak ada yang cocok.</div>}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
