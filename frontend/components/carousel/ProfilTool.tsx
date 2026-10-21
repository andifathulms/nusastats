"use client";

import { useEffect, useMemo, useState } from "react";
import { dukcapilApi, regionLabel, type DukcapilRegionRow } from "@/lib/api";
import { ErrorState, Panel, SectionTitle } from "@/components/ui";
import { profilCaption, type ProfilCaption } from "@/components/cards/caption";
import { TikTokText } from "./TikTokText";
import { CardLightbox } from "./CardLightbox";
import type { Tema } from "@/components/cards/brand";

// "Profil kabupaten" mode of /carousel: pick a kabupaten, preview its profile
// cards (the real /card routes, scaled down) and download them. PNGs come from
// the `cards` service (docker-compose; frontend/scripts/card/serve.mjs), which
// renders with the same headless Chromium as `npm run card`.

export const CARDS = process.env.NEXT_PUBLIC_CARDS_BASE || "http://localhost:3012";
const SCALE = 0.25;
const SECONDS_PER_CARD = 4.5;

type Card = { id: string; label: string; needs: string[] };
// Posting order (same as PROFIL in scripts/card/shoot.mjs): the hook first, the
// question last, each raster layer right before its population card.
const CARDS_IN_ORDER: Card[] = [
  { id: "kepadatan", label: "Hook: kepadatan per desa", needs: [] },
  { id: "wilayah", label: "Wilayah administrasi", needs: [] },
  { id: "desa", label: "Desa dan kelurahan", needs: [] },
  { id: "terrain", label: "Medan", needs: ["terrain.json"] },
  { id: "relief", label: "Relief", needs: ["terrain.json"] },
  { id: "lowland", label: "Dataran rendah", needs: ["terrain.json"] },
  { id: "rendah", label: "Penduduk di dataran rendah", needs: ["desa.json", "terrain.json"] },
  { id: "landcover", label: "Tutupan lahan", needs: ["landcover.json"] },
  { id: "nightlights", label: "Cahaya malam", needs: ["nightlights.json"] },
  { id: "cahaya", label: "Penduduk vs cahaya malam", needs: ["desa.json", "nightlights.json"] },
  { id: "kecamatan", label: "Per kecamatan", needs: [] },
  { id: "penutup", label: "Penutup: kabupaten berikutnya?", needs: [] },
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
  tema,
  onChange,
}: {
  kode: string;
  indicator: string;
  tema: Tema;
  onChange: (patch: { kode?: string; indicator?: string }) => void;
}) {
  const [regencies, setRegencies] = useState<DukcapilRegionRow[]>([]);
  const [search, setSearch] = useState("");
  const [files, setFiles] = useState<Record<string, boolean> | null>(null);
  const [service, setService] = useState<"checking" | "up" | "down">("checking");
  const [busy, setBusy] = useState<{ started: number; total: number } | null>(null);
  const [now, setNow] = useState(Date.now());
  const [error, setError] = useState<string | null>(null);
  const [caption, setCaption] = useState<ProfilCaption | null>(null);
  // A dense desa map spreads over several slides; the card says how many once it has laid out.
  const [desaPanels, setDesaPanels] = useState(1);
  const [zoom, setZoom] = useState<number | null>(null);
  // Admin maps: standard, or "tinggi penuh" (the map takes the whole height). Remembered in this browser.
  const [peta, setPeta] = useState<"standar" | "penuh">("standar");
  useEffect(() => {
    try {
      if (localStorage.getItem("nusastats:carousel:peta") === "penuh") setPeta("penuh");
    } catch {
      /* default */
    }
  }, []);
  const choosePeta = (p: "standar" | "penuh") => {
    setPeta(p);
    setDesaPanels(1);
    try {
      localStorage.setItem("nusastats:carousel:peta", p);
    } catch {
      /* not remembered */
    }
  };
  useEffect(() => setDesaPanels(1), [kode]);
  const [captionError, setCaptionError] = useState<string | null>(null);

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

  // TikTok title and description, from the same facts and guardrails as the cards.
  useEffect(() => {
    setCaption(null);
    setCaptionError(null);
    if (!kode) return;
    let live = true;
    // Slide numbers in the caption follow the slides below (a panorama counts once per slide).
    const only = files
      ? CARDS_IN_ORDER.filter((c) => !c.needs.some((f) => !files[f])).flatMap((c) => (c.id === "desa" ? Array(desaPanels).fill("desa") : [c.id]))
      : undefined;
    profilCaption(kode, indicator, only)
      .then((c) => live && setCaption(c))
      .catch((e) => live && setCaptionError(String(e.message ?? e)));
    return () => {
      live = false;
    };
  }, [kode, indicator, files, desaPanels]);

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
  const query = (c: Card, panel = 1) => ({
    tema,
    ...(c.id === "kecamatan" ? { indicator } : {}),
    ...(peta === "penuh" && (c.id === "wilayah" || c.id === "desa") ? { peta } : {}),
    ...(panel > 1 ? { panel: String(panel) } : {}),
  });
  const path = (c: Card, panel = 1) => `/card/${c.id}/${kode}?${new URLSearchParams(query(c, panel))}`;
  // One preview per slide: the desa map may be a panorama of 2-3 slides.
  const slides = cards.flatMap((c) =>
    c.id === "desa" && c.available && desaPanels > 1
      ? Array.from({ length: desaPanels }, (_, k) => ({ ...c, panel: k + 1, label: `${c.label} (${k + 1}/${desaPanels})` }))
      : [{ ...c, panel: 1 }]
  );
  // Read the panorama size from the rendered desa card (same origin), once it reports ready.
  const watchPanels = (frame: HTMLIFrameElement) => {
    let tries = 0;
    const t = setInterval(() => {
      const el = frame.contentDocument?.querySelector("#card");
      const n = Number(el?.getAttribute("data-card-panels"));
      if (n || el?.hasAttribute("data-card-error") || ++tries > 120) {
        clearInterval(t);
        if (n) setDesaPanels(n);
      }
    }, 500);
  };

  const downloadZip = async () => {
    setError(null);
    setBusy({ started: Date.now(), total: available.length + (desaPanels - 1) });
    try {
      const q = new URLSearchParams({ kode, indicator, tema, ...(peta === "penuh" ? { peta } : {}), templates: available.map((c) => c.id).join(",") });
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
          <div className="flex flex-wrap items-center justify-between gap-3">
            <SectionTitle hint="1080×1920, urutan unggah · klik untuk memperbesar">Kartu</SectionTitle>
            <div className="mb-3 inline-flex items-center gap-2 text-sm">
              <span className="text-xs font-semibold text-ink-muted">Peta wilayah &amp; desa</span>
              <div className="inline-flex rounded-full border border-ink-border p-0.5" role="radiogroup" aria-label="Tata letak peta">
                {(["standar", "penuh"] as const).map((p) => (
                  <button key={p} type="button" role="radio" aria-checked={peta === p} onClick={() => choosePeta(p)}
                    className={`rounded-full px-3 py-1 ${peta === p ? "bg-ink-accent/15 text-ink-accent" : "text-ink-muted hover:text-ink-text"}`}>
                    {p === "standar" ? "Standar" : "Tinggi penuh"}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="flex gap-4 overflow-x-auto pb-2">
            {slides.map((c, i) => (
              <figure key={`${c.id}-${c.panel}`} className="shrink-0" style={{ width: 1080 * SCALE }}>
                {c.available ? (
                  <div className="relative overflow-hidden rounded-xl ring-1 ring-ink-border" style={{ width: 1080 * SCALE, height: 1920 * SCALE }}>
                    <iframe
                      src={path(c, c.panel)}
                      title={c.label}
                      loading="lazy"
                      onLoad={c.id === "desa" && c.panel === 1 ? (e) => watchPanels(e.currentTarget) : undefined}
                      style={{ width: 1080, height: 1920, transform: `scale(${SCALE})`, transformOrigin: "0 0", border: 0 }}
                    />
                    {/* The iframe would swallow the click: a transparent button on top opens the zoom. */}
                    <button type="button" aria-label={`Perbesar ${c.label}`} className="absolute inset-0 cursor-zoom-in"
                      onClick={() => setZoom(slides.filter((x) => x.available).findIndex((x) => x.id === c.id && x.panel === c.panel))} />
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
                      href={`${CARDS}/png?${new URLSearchParams({ template: c.id, kode, ...query(c, c.panel) })}`}
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

      {zoom !== null && (
        <CardLightbox
          slides={slides.filter((x) => x.available).map((x) => ({ src: path(x, x.panel), label: x.label }))}
          index={zoom}
          onIndex={setZoom}
          onClose={() => setZoom(null)}
        />
      )}
      {kode &&
        (caption ? (
          <TikTokText title={caption.title} description={caption.description} hint="satu baris per slide; juga ada di ZIP" />
        ) : captionError ? (
          <ErrorState message={`Judul & deskripsi tidak dibuat: ${captionError}`} />
        ) : (
          <Panel>
            <p className="text-sm text-ink-muted">Menyusun judul & deskripsi TikTok…</p>
          </Panel>
        ))}
    </div>
  );
}
