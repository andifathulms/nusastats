"use client";

import { useEffect, useMemo, useState } from "react";
import { dukcapilApi, regionLabel, type DukcapilRegionRow } from "@/lib/api";
import { ErrorState, Panel, SectionTitle } from "@/components/ui";

// "Profil kabupaten" mode of /carousel: pick a kabupaten, preview its profile
// cards (the real /card routes, scaled down) and download them. PNGs come from
// the `cards` service (docker-compose; frontend/scripts/card/serve.mjs), which
// renders with the same headless Chromium as `npm run card`.

const CARDS = process.env.NEXT_PUBLIC_CARDS_BASE || "http://localhost:3012";
const SCALE = 0.25;
const SECONDS_PER_CARD = 4.5;

type Card = { id: string; label: string; needs: string[] };
// Posting order (same as PROFIL in scripts/card/shoot.mjs).
const CARDS_IN_ORDER: Card[] = [
  { id: "wilayah", label: "Wilayah administrasi", needs: [] },
  { id: "kepadatan", label: "Kepadatan per desa", needs: [] },
  { id: "cahaya", label: "Penduduk vs cahaya malam", needs: ["desa.json", "nightlights.json"] },
  { id: "kecamatan", label: "Per kecamatan", needs: [] },
  { id: "terrain", label: "Medan", needs: ["terrain.json"] },
  { id: "lowland", label: "Dataran rendah", needs: ["terrain.json"] },
  { id: "rendah", label: "Penduduk di dataran rendah", needs: ["desa.json", "terrain.json"] },
  { id: "relief", label: "Relief", needs: ["terrain.json"] },
  { id: "landcover", label: "Tutupan lahan", needs: ["landcover.json"] },
  { id: "nightlights", label: "Cahaya malam", needs: ["nightlights.json"] },
];
const INDICATORS = [
  { id: "median_age", label: "Usia median" },
  { id: "pct_elderly", label: "% lansia (65+)" },
  { id: "pct_productive", label: "% usia produktif" },
  { id: "sex_ratio", label: "Rasio jenis kelamin" },
  { id: "pct_sarjana", label: "% sarjana" },
  { id: "dependency_ratio", label: "Rasio ketergantungan" },
];

function missingReason(file: string, kode: string): string {
  if (file === "desa.json") return `Statistik desa belum dihitung (data/peta_wilayah: python -m desa --kode ${kode})`;
  return "Peta Wilayah belum dihitung untuk wilayah ini";
}

function slug(s: string) {
  return s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function ProfilTool({
  kode,
  indicator,
  onChange,
}: {
  kode: string;
  indicator: string;
  onChange: (patch: { kode?: string; indicator?: string }) => void;
}) {
  const [regencies, setRegencies] = useState<DukcapilRegionRow[]>([]);
  const [search, setSearch] = useState("");
  const [files, setFiles] = useState<Record<string, boolean> | null>(null);
  const [service, setService] = useState<"checking" | "up" | "down">("checking");
  const [busy, setBusy] = useState<{ started: number; total: number } | null>(null);
  const [now, setNow] = useState(Date.now());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    dukcapilApi.regions({ level: "regency" }).then(setRegencies).catch(() => setRegencies([]));
    fetch(`${CARDS}/health`)
      .then((r) => setService(r.ok ? "up" : "down"))
      .catch(() => setService("down"));
  }, []);

  // Which Peta outputs exist for this kabupaten (static files; a 404 = not computed).
  useEffect(() => {
    setFiles(null);
    if (!kode) return;
    const names = ["terrain.json", "landcover.json", "nightlights.json", "desa.json"];
    Promise.all(names.map((f) => fetch(`/peta/${kode}/${f}`, { method: "HEAD" }).then((r) => r.ok).catch(() => false))).then((ok) =>
      setFiles(Object.fromEntries(names.map((f, i) => [f, ok[i]])))
    );
  }, [kode]);

  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [busy]);

  const selected = regencies.find((r) => r.code === kode);
  const title = selected ? regionLabel(selected.name, selected.status) : kode;
  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return regencies
      .filter((r) => `${r.name} ${r.parent_name ?? ""} ${r.code}`.toLowerCase().includes(q))
      .slice(0, 8);
  }, [search, regencies]);

  const cards = CARDS_IN_ORDER.map((c) => {
    const missing = files ? c.needs.find((f) => !files[f]) : undefined;
    return { ...c, available: !!files && !missing, reason: missing ? missingReason(missing, kode) : null };
  });
  const available = cards.filter((c) => c.available);
  const path = (c: Card) => `/card/${c.id}/${kode}${c.id === "kecamatan" ? `?indicator=${indicator}` : ""}`;

  const downloadZip = async () => {
    setError(null);
    setBusy({ started: Date.now(), total: available.length });
    try {
      const q = new URLSearchParams({ kode, indicator, templates: available.map((c) => c.id).join(",") });
      const r = await fetch(`${CARDS}/zip?${q}`);
      if (!r.ok) throw new Error((await r.json().catch(() => null))?.error ?? `layanan kartu -> ${r.status}`);
      const url = URL.createObjectURL(await r.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = `${kode}-${slug(title)}-profil.zip`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      const skipped = Number(r.headers.get("x-cards-skipped") ?? 0);
      if (skipped) setError(`${skipped} kartu tidak dibuat; alasannya ada di TIDAK-DIBUAT.txt di dalam ZIP.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-6">
      <Panel>
        <div className="grid gap-4 sm:grid-cols-[1fr_260px]">
          <label className="relative block">
            <span className="mb-1 block text-xs font-semibold text-ink-muted">Kabupaten/kota</span>
            <input
              className="w-full rounded-lg border border-ink-border bg-ink-panel2 px-3 py-2 text-sm text-ink-text focus:border-ink-accent focus:outline-none"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={selected ? `${title} · ${selected.parent_name}` : "Cari: Barru, Makassar, 7311…"}
            />
            {matches.length > 0 && (
              <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-ink-border bg-ink-panel shadow-lift">
                {matches.map((r) => (
                  <li key={r.code}>
                    <button
                      type="button"
                      className="flex w-full items-baseline justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-ink-panel2"
                      onClick={() => {
                        onChange({ kode: r.code });
                        setSearch("");
                      }}
                    >
                      <span className="text-ink-text">{regionLabel(r.name, r.status)}</span>
                      <span className="text-xs text-ink-faint">
                        {r.parent_name} · {r.code}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-ink-muted">Kartu per kecamatan</span>
            <select
              className="w-full rounded-lg border border-ink-border bg-ink-panel2 px-3 py-2 text-sm text-ink-text focus:border-ink-accent focus:outline-none"
              value={indicator}
              onChange={(e) => onChange({ indicator: e.target.value })}
            >
              {INDICATORS.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </Panel>

      {kode && (
        <Panel>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-2xl font-medium text-ink-text">{title}</h2>
              <p className="text-sm text-ink-muted">
                {selected?.parent_name} · {files ? `${available.length} dari ${cards.length} kartu tersedia` : "memeriksa data…"}
              </p>
            </div>
            <button
              type="button"
              onClick={downloadZip}
              disabled={!files || !available.length || service !== "up" || !!busy}
              className="inline-flex h-11 items-center rounded-full bg-brand-gradient px-6 text-sm font-bold text-white shadow-glow transition-transform hover:-translate-y-0.5 disabled:opacity-50"
            >
              {busy
                ? `Membuat ${busy.total} kartu… ${Math.round((now - busy.started) / 1000)} / ~${Math.round(busy.total * SECONDS_PER_CARD)} dtk`
                : `Unduh semua (ZIP)`}
            </button>
          </div>
          {service === "down" && (
            <p className="mb-4 rounded-lg bg-ink-panel2 p-3 text-sm text-ink-muted">
              Layanan kartu belum jalan, jadi unduhan PNG/ZIP belum bisa. Jalankan{" "}
              <code className="font-mono text-xs">docker compose up -d cards</code>, lalu muat ulang halaman ini.
            </p>
          )}
          {error && <ErrorState message={error} />}
          <SectionTitle hint="1080×1920, urutan unggah">Kartu</SectionTitle>
          <div className="flex gap-4 overflow-x-auto pb-2">
            {cards.map((c, i) => (
              <figure key={c.id} className="shrink-0" style={{ width: 1080 * SCALE }}>
                {c.available ? (
                  <div className="overflow-hidden rounded-xl ring-1 ring-ink-border" style={{ width: 1080 * SCALE, height: 1920 * SCALE }}>
                    <iframe
                      src={path(c)}
                      title={c.label}
                      loading="lazy"
                      style={{ width: 1080, height: 1920, transform: `scale(${SCALE})`, transformOrigin: "0 0", border: 0 }}
                    />
                  </div>
                ) : (
                  <div
                    className="flex items-center justify-center rounded-xl border border-dashed border-ink-border p-5 text-center text-sm text-ink-muted"
                    style={{ height: 1920 * SCALE }}
                  >
                    {c.reason ?? "memeriksa…"}
                  </div>
                )}
                <figcaption className="mt-2 flex items-baseline justify-between gap-2 text-xs">
                  <span className="truncate text-ink-muted">
                    <span className="font-mono text-ink-faint">{String(i + 1).padStart(2, "0")}</span> {c.label}
                  </span>
                  {c.available && service === "up" && (
                    <a
                      className="shrink-0 font-semibold text-ink-accent hover:underline"
                      href={`${CARDS}/png?${new URLSearchParams({ template: c.id, kode, ...(c.id === "kecamatan" ? { indicator } : {}) })}`}
                    >
                      PNG
                    </a>
                  )}
                </figcaption>
              </figure>
            ))}
          </div>
        </Panel>
      )}
    </div>
  );
}
