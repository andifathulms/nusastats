"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  CarouselRefusal,
  carouselApi,
  djpkApi,
  dukcapilApi,
  type CarouselDeckResult,
  type DjpkAccountGroups,
  type DukcapilIndicatorGroups,
  type DukcapilRegionRow,
} from "@/lib/api";
import { Badge, ErrorState, PageHeader, Panel, SectionTitle } from "@/components/ui";
import { routes } from "@/lib/routes";
import { TikTokText } from "@/components/carousel/TikTokText";
import { TemaPicker, useTema } from "@/components/carousel/TemaPicker";
import { CardLightbox } from "@/components/carousel/CardLightbox";
import type { Tema } from "@/components/cards/brand";
import { CARDS, ProfilTool } from "@/components/carousel/ProfilTool";

// /carousel — two ways to make a TikTok carousel (docs/CAROUSEL.md):
//   Peringkat (default): one ranking -> deck text for Carousel Press, the map
//     cards that go between its slides, and the command that saves them.
//   Profil kabupaten (?mode=profil&kode=7311): one kabupaten's map cards,
//     previewed and downloadable as PNG/ZIP from the `cards` service.
// The state lives in the URL, so links elsewhere can prefill it.

type Source = "bps" | "dukcapil" | "djpk";
type Form = {
  source: Source;
  metric: string;
  level: string;
  period: string;
  prov: string;
  recipe: string;
  bg: string;
  turvar: string;
  unit: string;
  label_metric: string;
  table: string; // rows in the ranking table: 10 | 20 | 50 (one card per 10)
  maps: string; // "0" = table only, no countdown maps
  allow_partial: string;
};

const FIELDS: (keyof Form)[] = ["source", "metric", "level", "period", "prov", "recipe", "bg", "turvar", "unit", "label_metric", "table", "maps", "allow_partial"];
const LEVELS: Record<Source, string[]> = { bps: ["provinsi", "kabupaten"], dukcapil: ["provinsi", "kabupaten", "kecamatan"], djpk: ["provinsi", "kabupaten"] };
const RECIPES = [
  { id: "top", label: "Hitung mundur ke #1" },
  { id: "gap", label: "Tertinggi vs terendah" },
  { id: "terendah", label: "Hitung mundur ke terendah" },
];
const BGS = [
  { id: "terrain", label: "Medan" },
  { id: "landcover", label: "Tutupan lahan" },
  { id: "none", label: "Siluet" },
];
const SCALE = 0.25;

// One-click rankings: each fills the form and builds. All checked against the
// live packs: kabupaten nationally and per province, provinsi nationally, and
// kecamatan in all 38 provinces (a preset refused in a few provinces says why).
// Kecamatan needs a province: across Indonesia 39 kecamatan have no values, so
// the pack may not be called the highest/lowest nationally.
type Level = "kabupaten" | "provinsi" | "kecamatan";
type Preset = {
  label: string;
  source: Source;
  metric: string;
  recipe: string;
  period?: string;
  unit?: string;
  label_metric?: string;
  levels?: Level[]; // default: all three (kecamatan only for Dukcapil)
};
const PRESET_LEVELS: { id: Level; label: string }[] = [
  { id: "kabupaten", label: "Kabupaten/kota" },
  { id: "provinsi", label: "Provinsi" },
  { id: "kecamatan", label: "Kecamatan" },
];
const presetLevels = (p: Preset): Level[] => p.levels ?? (p.source === "dukcapil" ? ["kabupaten", "provinsi", "kecamatan"] : ["kabupaten", "provinsi"]);
const IPM = { source: "bps", metric: "2205", period: "2025", unit: "indeks", label_metric: "Indeks Pembangunan Manusia" } as const;
const PRESETS: { group: string; items: Preset[] }[] = [
  {
    group: "Penduduk",
    items: [
      { label: "Penduduk terbanyak", source: "dukcapil", metric: "jumlah_penduduk", recipe: "top" },
      { label: "Paling padat", source: "dukcapil", metric: "pop_density_big", recipe: "top" },
      { label: "Paling lengang", source: "dukcapil", metric: "pop_density_big", recipe: "terendah" },
      { label: "Pria vs wanita", source: "dukcapil", metric: "sex_ratio", recipe: "gap" },
    ],
  },
  {
    group: "Usia & keluarga",
    items: [
      { label: "Warga paling tua", source: "dukcapil", metric: "median_age", recipe: "top" },
      { label: "Warga paling muda", source: "dukcapil", metric: "median_age", recipe: "terendah" },
      { label: "Lansia terbanyak", source: "dukcapil", metric: "pct_elderly", recipe: "top" },
      { label: "Beban tanggungan tertinggi", source: "dukcapil", metric: "dependency_ratio", recipe: "top" },
      { label: "Cerai tertinggi", source: "dukcapil", metric: "pct_divorced", recipe: "top" },
      { label: "Lajang terbanyak", source: "dukcapil", metric: "pct_unmarried", recipe: "top" },
    ],
  },
  {
    group: "Pendidikan & kesejahteraan",
    items: [
      { label: "Sarjana terbanyak", source: "dukcapil", metric: "pct_sarjana", recipe: "top" },
      { label: "Sarjana paling sedikit", source: "dukcapil", metric: "pct_sarjana", recipe: "terendah" },
      { label: "IPM tertinggi", ...IPM, recipe: "top" },
      { label: "IPM terendah", ...IPM, recipe: "terendah" },
      { label: "Sekolah paling lama", source: "bps", metric: "415", recipe: "top", period: "2025" },
      { label: "Umur harapan hidup", source: "bps", metric: "414", recipe: "top", period: "2024" },
      { label: "Pengeluaran per kapita", source: "bps", metric: "416", recipe: "top", period: "2025" },
    ],
  },
  {
    group: "Pekerjaan & budaya",
    items: [
      // 9–15% of kecamatan have no value: kabupaten and provinsi only.
      { label: "Nelayan terbanyak", source: "dukcapil", metric: "pct_fisher", recipe: "top", levels: ["kabupaten", "provinsi"] },
      { label: "Wiraswasta terbanyak", source: "dukcapil", metric: "pct_entrepreneur", recipe: "top" },
      { label: "Agama paling beragam", source: "dukcapil", metric: "religion_diversity", recipe: "top" },
      { label: "Golongan darah O", source: "dukcapil", metric: "pct_blood_o", recipe: "top" },
    ],
  },
  {
    group: "Keuangan daerah",
    items: [
      { label: "Paling mandiri", source: "djpk", metric: "rasio_kemandirian", recipe: "top", period: "2024" },
      { label: "Paling bergantung pusat", source: "djpk", metric: "rasio_kemandirian", recipe: "terendah", period: "2024" },
      { label: "PAD terbesar", source: "djpk", metric: "pad", recipe: "top", period: "2024" },
      { label: "Belanja pegawai tertinggi", source: "djpk", metric: "rasio_belanja_pegawai", recipe: "top", period: "2024" },
      { label: "Belanja modal tertinggi", source: "djpk", metric: "rasio_belanja_modal", recipe: "top", period: "2024" },
    ],
  },
];

/** A preset as a full form at one level, keeping the chosen province and map background. */
function presetForm(p: Preset, level: Level, prov: string, current: Form): Form {
  return {
    source: p.source,
    metric: p.metric,
    level,
    period: p.period ?? "",
    prov: level === "provinsi" ? "" : prov,
    recipe: p.recipe,
    bg: current.bg,
    turvar: "",
    unit: p.unit ?? "",
    label_metric: p.label_metric ?? "",
    table: current.table,
    maps: current.maps,
    allow_partial: "",
  };
}

const isPreset = (p: Preset, f: Form) =>
  f.source === p.source && f.metric === p.metric && f.recipe === p.recipe && f.period === (p.period ?? "");

const input =
  "w-full rounded-lg border border-ink-border bg-ink-panel2 px-3 py-2 text-sm text-ink-text focus:border-ink-accent focus:outline-none";

function formFrom(params: URLSearchParams): Form {
  const source = (["bps", "dukcapil", "djpk"].includes(params.get("source") ?? "") ? params.get("source") : "bps") as Source;
  return {
    source,
    metric: params.get("metric") ?? "",
    level: params.get("level") ?? "kabupaten",
    period: params.get("period") ?? "",
    prov: params.get("prov") ?? "",
    recipe: params.get("recipe") ?? "top",
    bg: params.get("bg") ?? "terrain",
    turvar: params.get("turvar") ?? "",
    unit: params.get("unit") ?? "",
    label_metric: params.get("label_metric") ?? "",
    table: params.get("table") ?? "",
    maps: params.get("maps") ?? "",
    allow_partial: params.get("allow_partial") ?? "",
  };
}

function queryOf(form: Form): string {
  const q = new URLSearchParams();
  for (const k of FIELDS) if (form[k]) q.set(k, form[k]);
  return q.toString();
}

function command(form: Form): string {
  const parts = ["npm run carousel --"];
  for (const k of FIELDS) {
    if (!form[k] || k === "allow_partial") continue;
    parts.push(`--${k.replace("_", "-")} ${/\s/.test(form[k]) ? `"${form[k]}"` : form[k]}`);
  }
  if (form.allow_partial) parts.push("--allow-partial");
  return parts.join(" ");
}

function download(name: string, text: string, type = "text/plain") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function CarouselPage() {
  return (
    <Suspense>
      <Modes />
    </Suspense>
  );
}

function Modes() {
  const params = useSearchParams();
  const router = useRouter();
  const mode = params.get("mode") === "profil" ? "profil" : "peringkat";
  const [tema, setTema] = useTema();
  const go = (q: Record<string, string>) => router.replace(`${routes.carousel}?${new URLSearchParams(q)}`, { scroll: false });
  const tab = (id: "peringkat" | "profil", label: string) => (
    <button
      type="button"
      onClick={() => go(id === "profil" ? { mode: "profil" } : {})}
      className={`rounded-full px-4 py-1.5 text-sm font-semibold ${
        mode === id ? "bg-laut-950 text-kertas-200 dark:bg-ink-accent dark:text-ink-onAccent" : "text-ink-muted hover:text-ink-text"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-8">
      <PageHeader eyebrow="Alat · TikTok" title="Buat carousel">
        {mode === "profil"
          ? "Satu kabupaten jadi rangkaian kartu peta: wilayah, kepadatan, medan, dataran rendah, tutupan lahan, cahaya malam dan lainnya, siap diunggah."
          : "Satu peringkat jadi carousel TikTok: teks deck untuk Carousel Press, kartu peta di antara slidenya, dan perintah untuk menyimpan semuanya sebagai PNG. Angka diambil dari satu sumber saja, apa adanya."}
      </PageHeader>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="inline-flex gap-1 rounded-full border border-ink-border p-1">
          {tab("peringkat", "Peringkat")}
          {tab("profil", "Profil kabupaten")}
        </div>
        <TemaPicker tema={tema} onChange={setTema} />
      </div>
      {mode === "profil" ? (
        <ProfilTool
          kode={params.get("kode") ?? ""}
          indicator={params.get("indicator") ?? "median_age"}
          tema={tema}
          onChange={(patch) =>
            go({ mode: "profil", kode: patch.kode ?? params.get("kode") ?? "", indicator: patch.indicator ?? params.get("indicator") ?? "median_age" })
          }
        />
      ) : (
        <CarouselTool tema={tema} />
      )}
    </div>
  );
}

function CarouselTool({ tema }: { tema: Tema }) {
  const params = useSearchParams();
  const router = useRouter();
  const [form, setForm] = useState<Form>(() => formFrom(params));
  const [result, setResult] = useState<CarouselDeckResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refusal, setRefusal] = useState<CarouselRefusal | null>(null);
  const [busy, setBusy] = useState(false);
  const [provinces, setProvinces] = useState<DukcapilRegionRow[]>([]);
  const [dukIndicators, setDukIndicators] = useState<DukcapilIndicatorGroups | null>(null);
  const [djpkAccounts, setDjpkAccounts] = useState<DjpkAccountGroups | null>(null);
  const [presetLevel, setPresetLevel] = useState<Level>(
    (["kabupaten", "provinsi", "kecamatan"].includes(form.level) ? form.level : "kabupaten") as Level
  );
  const [presetProv, setPresetProv] = useState(form.prov);
  const presetGroups = PRESETS.map((g) => ({ ...g, items: g.items.filter((p) => presetLevels(p).includes(presetLevel)) })).filter(
    (g) => g.items.length
  );

  useEffect(() => {
    dukcapilApi.regions({ level: "province" }).then(setProvinces).catch(() => setProvinces([]));
  }, []);
  useEffect(() => {
    if (form.source === "dukcapil" && !dukIndicators) dukcapilApi.indicators().then(setDukIndicators).catch(() => null);
    if (form.source === "djpk" && !djpkAccounts) djpkApi.accounts().then(setDjpkAccounts).catch(() => null);
  }, [form.source, dukIndicators, djpkAccounts]);

  const set = (patch: Partial<Form>) => setForm((f) => ({ ...f, ...patch }));
  const build = (f: Form) => {
    if (!f.metric) return;
    const q = queryOf(f);
    router.replace(`${routes.carousel}?${q}`, { scroll: false });
    setBusy(true);
    setError(null);
    setRefusal(null);
    carouselApi
      .deck(q)
      .then(setResult)
      .catch((e) => {
        setResult(null);
        if (e instanceof CarouselRefusal) setRefusal(e);
        else setError(e.message ?? String(e));
      })
      .finally(() => setBusy(false));
  };

  // A prefilled link ("Buat carousel" elsewhere) builds right away.
  useEffect(() => {
    if (form.metric) build(form);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-8">
      <Panel>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <SectionTitle>Pilih cepat</SectionTitle>
          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex rounded-full border border-ink-border p-0.5">
              {PRESET_LEVELS.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => setPresetLevel(l.id)}
                  className={`rounded-full px-3 py-1 text-sm transition-colors ${
                    presetLevel === l.id ? "bg-ink-accent/15 text-ink-accent" : "text-ink-muted hover:text-ink-text"
                  }`}
                >
                  {l.label}
                </button>
              ))}
            </div>
            <select
              className="rounded-full border border-ink-border bg-ink-panel2 px-3 py-1 text-sm text-ink-text focus:border-ink-accent focus:outline-none disabled:opacity-50"
              value={presetLevel === "provinsi" ? "" : presetProv}
              onChange={(e) => setPresetProv(e.target.value)}
              disabled={presetLevel === "provinsi"}
              aria-label="Cakupan"
            >
              <option value="">{presetLevel === "kecamatan" ? "Pilih provinsi…" : "Seluruh Indonesia"}</option>
              {provinces.map((p) => (
                <option key={p.code} value={p.code}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        {presetLevel === "kecamatan" && !presetProv && (
          <p className="mb-3 text-sm text-ink-muted">
            Peringkat kecamatan dibuat per provinsi: se-Indonesia, 39 dari 7.285 kecamatan tidak punya nilai.
          </p>
        )}
        <div className="space-y-3">
          {presetGroups.map((g) => (
            <div key={g.group} className="flex flex-col gap-2 sm:flex-row sm:items-baseline">
              <span className="text-xs font-semibold text-ink-muted sm:w-48 sm:shrink-0">{g.group}</span>
              <div className="flex flex-wrap gap-2">
                {g.items.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    disabled={busy || (presetLevel === "kecamatan" && !presetProv)}
                    onClick={() => {
                      const f = presetForm(p, presetLevel, presetProv, form);
                      setForm(f);
                      build(f);
                    }}
                    className={`rounded-full border px-3 py-1 text-sm transition-colors disabled:opacity-50 ${
                      isPreset(p, form) && form.level === presetLevel && (presetLevel === "provinsi" || form.prov === presetProv)
                        ? "border-ink-accent bg-ink-accent/15 text-ink-accent"
                        : "border-ink-border text-ink-text hover:border-ink-accent hover:text-ink-accent"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Panel>

      <Panel>
        <form
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
          onSubmit={(e) => {
            e.preventDefault();
            build(form);
          }}
        >
          <Field label="Sumber">
            <select className={input} value={form.source} onChange={(e) => set({ source: e.target.value as Source, metric: "", turvar: "", unit: "" })}>
              <option value="bps">BPS</option>
              <option value="dukcapil">Dukcapil (Kemendagri)</option>
              <option value="djpk">DJPK (Kemenkeu)</option>
            </select>
          </Field>
          <Field label="Indikator" hint={form.source === "bps" ? "variable_id BPS" : undefined}>
            {form.source === "bps" ? (
              <input className={input} value={form.metric} onChange={(e) => set({ metric: e.target.value.trim() })} placeholder="mis. 415" />
            ) : (
              <select className={input} value={form.metric} onChange={(e) => set({ metric: e.target.value })}>
                <option value="">Pilih indikator…</option>
                {form.source === "dukcapil"
                  ? dukIndicators?.groups.map((g) => (
                      <optgroup key={g.group} label={g.group}>
                        {g.indicators.map((i) => (
                          <option key={i.field} value={i.field}>
                            {i.label_id}
                          </option>
                        ))}
                      </optgroup>
                    ))
                  : djpkAccounts?.groups.map((g) => (
                      <optgroup key={g.group} label={g.group}>
                        {g.accounts.map((a) => (
                          <option key={a.akun_key} value={a.akun_key}>
                            {a.label_id}
                          </option>
                        ))}
                      </optgroup>
                    ))}
              </select>
            )}
          </Field>
          <Field label="Tingkat">
            <select className={input} value={form.level} onChange={(e) => set({ level: e.target.value })}>
              {LEVELS[form.source].map((l) => (
                <option key={l} value={l}>
                  {l === "kabupaten" ? "kabupaten/kota" : l}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Periode" hint={form.source === "dukcapil" ? "kosong = snapshot terbaru" : "tahun"}>
            <input className={input} value={form.period} onChange={(e) => set({ period: e.target.value.trim() })} placeholder={form.source === "dukcapil" ? "YYYY-MM" : "mis. 2025"} />
          </Field>
          <Field label="Cakupan">
            <select className={input} value={form.prov} onChange={(e) => set({ prov: e.target.value })} disabled={form.level === "provinsi"}>
              <option value="">Seluruh Indonesia</option>
              {provinces.map((p) => (
                <option key={p.code} value={p.code}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Resep">
            <select className={input} value={form.recipe} onChange={(e) => set({ recipe: e.target.value })}>
              {RECIPES.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Tabel peringkat" hint={form.recipe === "gap" ? "tidak untuk resep ini" : "10 baris per slide"}>
            <select className={input} value={form.table} onChange={(e) => set({ table: e.target.value })} disabled={form.recipe === "gap"}>
              <option value="">Top 10</option>
              <option value="20">Top 20</option>
              <option value="50">Top 50</option>
            </select>
          </Field>
          <Field label="Hitung mundur peta" hint={form.recipe === "gap" ? "tidak untuk resep ini" : undefined}>
            <select className={input} value={form.maps} onChange={(e) => set({ maps: e.target.value })} disabled={form.recipe === "gap"}>
              <option value="">Ya, peta top 5 lalu tabel</option>
              <option value="0">Tidak, tabel saja</option>
            </select>
          </Field>
          <Field label="Peta tiap wilayah" hint={form.maps === "0" ? "tidak dipakai (tabel saja)" : undefined}>
            <select className={input} value={form.bg} onChange={(e) => set({ bg: e.target.value })} disabled={form.maps === "0"}>
              {BGS.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.label}
                </option>
              ))}
            </select>
          </Field>
          {form.source === "bps" && (
            <Field label="Rincian & satuan" hint="bila diminta">
              <div className="flex gap-2">
                <input className={input} value={form.turvar} onChange={(e) => set({ turvar: e.target.value.trim() })} placeholder="turvar" />
                <input className={input} value={form.unit} onChange={(e) => set({ unit: e.target.value })} placeholder="satuan" />
              </div>
            </Field>
          )}
          <div className="flex flex-wrap items-center gap-4 sm:col-span-2 lg:col-span-4">
            <button
              type="submit"
              disabled={busy || !form.metric}
              className="inline-flex h-11 items-center rounded-full bg-brand-gradient px-6 text-sm font-bold text-white shadow-glow transition-transform hover:-translate-y-0.5 disabled:opacity-50"
            >
              {busy ? "Membuat…" : "Buat carousel"}
            </button>
            <label className="inline-flex items-center gap-2 text-sm text-ink-muted">
              <input type="checkbox" checked={!!form.allow_partial} onChange={(e) => set({ allow_partial: e.target.checked ? "1" : "" })} />
              Izinkan cakupan tidak lengkap (catatan &ldquo;n = X dari Y&rdquo; ditulis)
            </label>
          </div>
        </form>
      </Panel>

      {refusal && (
        <Refused
          refusal={refusal}
          busy={busy}
          onPartial={() => {
            const f = { ...form, allow_partial: "1" };
            setForm(f);
            build(f);
          }}
        />
      )}
      {error && (
        <Panel>
          <SectionTitle>Pack tidak dibuat</SectionTitle>
          <ErrorState message={error} />
        </Panel>
      )}
      {result && <Result result={result} form={form} tema={tema} />}
    </div>
  );
}

/** A pack the backend refused to build: its reason in full, the regions without a value,
 * and (when only coverage is the problem) a one-click build with the "n = X dari Y" note. */
function Refused({ refusal, busy, onPartial }: { refusal: CarouselRefusal; busy: boolean; onPartial: () => void }) {
  const p = refusal.partial;
  const reason = p ? refusal.message.split(" Tanpa nilai:")[0] : refusal.message;
  return (
    <Panel>
      <SectionTitle>Pack tidak dibuat</SectionTitle>
      <p className="text-base text-ink-text">{reason}</p>
      {p && (
        <>
          <p className="mt-3 text-sm text-ink-muted">
            Tanpa nilai: {p.missing.join(", ")}
            {p.more > 0 ? ` dan ${p.more.toLocaleString("id-ID")} lainnya` : ""}.
          </p>
          <p className="mt-1 text-sm text-ink-muted">
            Kalau tetap dibuat, peringkatnya dari {p.n.toLocaleString("id-ID")} wilayah dan catatan &ldquo;n ={" "}
            {p.n.toLocaleString("id-ID")} dari {p.total.toLocaleString("id-ID")}&rdquo; ditulis di deck.
          </p>
          <button
            type="button"
            onClick={onPartial}
            disabled={busy}
            className="mt-4 inline-flex h-10 items-center rounded-full border border-ink-accent px-5 text-sm font-semibold text-ink-accent transition-colors hover:bg-ink-accent/10 disabled:opacity-50"
          >
            Tetap buat, dengan catatan n = {p.n.toLocaleString("id-ID")} dari {p.total.toLocaleString("id-ID")}
          </button>
        </>
      )}
    </Panel>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 flex items-baseline justify-between gap-2 text-xs font-semibold text-ink-muted">
        {label}
        {hint && <span className="font-normal text-ink-faint">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

const SECONDS_PER_CARD = 1.5;

function Result({ result, form, tema }: { result: CarouselDeckResult; form: Form; tema: Tema }) {
  const { pack, map } = result;
  const [copied, setCopied] = useState<string | null>(null);
  const [service, setService] = useState<"checking" | "up" | "down">("checking");
  const [zipping, setZipping] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [zipError, setZipError] = useState<string | null>(null);
  const [zoom, setZoom] = useState<number | null>(null);

  useEffect(() => {
    fetch(`${CARDS}/health`)
      .then((r) => setService(r.ok ? "up" : "down"))
      .catch(() => setService("down"));
  }, []);
  useEffect(() => {
    if (zipping === null) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [zipping]);

  // The map cards as PNGs plus the deck and TikTok text, rendered by the `cards` service.
  const downloadZip = async () => {
    setZipError(null);
    setZipping(Date.now());
    try {
      const r = await fetch(`${CARDS}/deck-zip?${queryOf(form)}&tema=${tema}`);
      if (!r.ok) throw new Error((await r.json().catch(() => null))?.error ?? `layanan kartu -> ${r.status}`);
      const url = URL.createObjectURL(await r.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = `${pack.id}.zip`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      const skipped = Number(r.headers.get("x-cards-skipped") ?? 0);
      if (skipped) setZipError(`${skipped} kartu tidak dibuat; alasannya ada di TIDAK-DIBUAT.txt di dalam ZIP.`);
    } catch (e) {
      setZipError(e instanceof Error ? e.message : String(e));
    } finally {
      setZipping(null);
    }
  };
  const cmd = useMemo(() => command(form), [form]);
  const copy = (key: string, text: string) =>
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(null), 1500);
    });

  return (
    <div className="space-y-6">
      <Panel>
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <div className="font-mono text-xs text-ink-faint">{pack.id}</div>
            <h2 className="mt-1 font-display text-2xl font-medium text-ink-text">{map.title}</h2>
            <p className="mt-1 text-sm text-ink-muted">{pack.source}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge tone="accent">
              n = {map.n.toLocaleString("id-ID")} dari {map.expected.toLocaleString("id-ID")}
            </Badge>
            <Badge>{map.period_label}</Badge>
            {map.prov_name && <Badge>{map.prov_name}</Badge>}
          </div>
        </div>
        <p className="mt-4 text-sm leading-relaxed text-ink-muted">{pack.notes}</p>
        {result.warnings.length > 0 && (
          <ul className="mt-4 space-y-1 text-sm text-ink-warmText">
            {result.warnings.map((w) => (
              <li key={w}>! {w}</li>
            ))}
          </ul>
        )}
        {map.unmatched.length > 0 && (
          <p className="mt-3 text-sm text-ink-muted">
            Tanpa kode peta (tidak digambar): {map.unmatched.map((u) => u.label).join(", ")}
          </p>
        )}
      </Panel>

      {zoom !== null && (
        <CardLightbox
          slides={result.cards.map((c) => ({ src: `${c.path}&tema=${tema}`, label: c.file }))}
          index={zoom}
          onIndex={setZoom}
          onClose={() => setZoom(null)}
        />
      )}
      <TikTokText title={result.tiktok.title} description={result.tiktok.description} />

      <Panel>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <SectionTitle hint="1080×1920, nama file menempatkannya di antara slide deck · klik untuk memperbesar">Kartu peta</SectionTitle>
          <button
            type="button"
            onClick={downloadZip}
            disabled={service !== "up" || zipping !== null}
            className="inline-flex h-11 items-center rounded-full bg-brand-gradient px-6 text-sm font-bold text-white shadow-glow transition-transform hover:-translate-y-0.5 disabled:opacity-50"
          >
            {zipping !== null
              ? `Membuat ${result.cards.length} kartu… ${Math.round((now - zipping) / 1000)} / ~${Math.ceil(result.cards.length * SECONDS_PER_CARD)} dtk`
              : "Unduh semua (ZIP)"}
          </button>
        </div>
        {service === "down" && (
          <p className="mb-4 rounded-lg bg-ink-panel2 p-3 text-sm text-ink-muted">
            Layanan kartu belum jalan, jadi unduhan PNG/ZIP belum bisa. Jalankan{" "}
            <code className="font-mono text-xs">docker compose up -d cards</code>, lalu muat ulang halaman ini.
          </p>
        )}
        {zipError && <ErrorState message={zipError} />}
        <p className="mb-4 text-sm text-ink-muted">
          ZIP berisi semua kartu peta (PNG) ditambah deck.txt, tiktok.txt, README.md, pack.json, provenance.json dan
          tautan Carousel Press. Slide teksnya dibuat di Carousel Press.
        </p>
        <div className="flex gap-4 overflow-x-auto pb-2">
          {result.cards.map((c, i) => (
            <figure key={c.file} className="shrink-0">
              <div className="relative overflow-hidden rounded-xl ring-1 ring-ink-border" style={{ width: 1080 * SCALE, height: 1920 * SCALE }}>
                <iframe
                  src={`${c.path}&tema=${tema}`}
                  aria-label={c.file}
                  loading="lazy"
                  style={{ width: 1080, height: 1920, transform: `scale(${SCALE})`, transformOrigin: "0 0", border: 0 }}
                />
                <button type="button" aria-label={`Perbesar ${c.file}`} className="absolute inset-0 cursor-zoom-in" onClick={() => setZoom(i)} />
              </div>
              <figcaption className="mt-2 flex max-w-[270px] items-baseline justify-between gap-2">
                <span className="truncate font-mono text-[11px] text-ink-faint">{c.file}</span>
                {service === "up" && (
                  <a
                    className="shrink-0 text-xs font-semibold text-ink-accent hover:underline"
                    href={`${CARDS}/shot?${new URLSearchParams({ path: `${c.path}&tema=${tema}`, name: c.file })}`}
                  >
                    PNG
                  </a>
                )}
              </figcaption>
            </figure>
          ))}
        </div>
      </Panel>

      <Panel>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <SectionTitle hint="tempel di Carousel Press; ubah kalimat sampul saja">Teks deck</SectionTitle>
          <div className="flex flex-wrap gap-2">
            <a
              href={result.carousel_press_url}
              target="_blank"
              rel="noreferrer"
              className="rounded-full bg-brand-gradient px-4 py-1.5 text-sm font-semibold text-white shadow-glow hover:opacity-90"
            >
              Buka di Carousel Press
            </a>
            <Action onClick={() => copy("deck", result.deck)}>{copied === "deck" ? "Tersalin" : "Salin"}</Action>
            <Action onClick={() => download("deck.txt", result.deck)}>deck.txt</Action>
            <Action onClick={() => download("pack.json", JSON.stringify(pack, null, 2) + "\n", "application/json")}>pack.json</Action>
            <Action onClick={() => download("provenance.json", JSON.stringify(result.provenance, null, 2) + "\n", "application/json")}>
              provenance.json
            </Action>
          </div>
        </div>
        <pre className="max-h-[480px] overflow-auto rounded-lg bg-ink-panel2 p-4 font-mono text-[12.5px] leading-relaxed text-ink-text">{result.deck}</pre>
      </Panel>

      <Panel>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <SectionTitle hint="tanpa layanan kartu; dari folder frontend, PNG masuk ke exports/carousels/">Lewat terminal</SectionTitle>
          <Action onClick={() => copy("cmd", cmd)}>{copied === "cmd" ? "Tersalin" : "Salin perintah"}</Action>
        </div>
        <pre className="overflow-x-auto rounded-lg bg-ink-panel2 p-4 font-mono text-[12.5px] text-ink-text">{cmd}</pre>
        <p className="mt-3 text-sm text-ink-muted">
          Lalu buka deck di Carousel Press (tombol di atas), unduh ZIP-nya ke folder yang sama, dan unggah semua PNG ke TikTok
          sesuai urutan nama. Panduan lengkap: <code className="font-mono text-xs">docs/CAROUSEL.md</code>.
        </p>
      </Panel>
    </div>
  );
}

function Action({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full border border-ink-border px-4 py-1.5 text-sm text-ink-text transition-colors hover:border-ink-accent hover:text-ink-accent"
    >
      {children}
    </button>
  );
}

