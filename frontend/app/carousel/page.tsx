"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
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
import { ProfilTool } from "@/components/carousel/ProfilTool";

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
  allow_partial: string;
};

const FIELDS: (keyof Form)[] = ["source", "metric", "level", "period", "prov", "recipe", "bg", "turvar", "unit", "allow_partial"];
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
      <div className="inline-flex gap-1 rounded-full border border-ink-border p-1">
        {tab("peringkat", "Peringkat")}
        {tab("profil", "Profil kabupaten")}
      </div>
      {mode === "profil" ? (
        <ProfilTool
          kode={params.get("kode") ?? ""}
          indicator={params.get("indicator") ?? "median_age"}
          onChange={(patch) =>
            go({ mode: "profil", kode: patch.kode ?? params.get("kode") ?? "", indicator: patch.indicator ?? params.get("indicator") ?? "median_age" })
          }
        />
      ) : (
        <CarouselTool />
      )}
    </div>
  );
}

function CarouselTool() {
  const params = useSearchParams();
  const router = useRouter();
  const [form, setForm] = useState<Form>(() => formFrom(params));
  const [result, setResult] = useState<CarouselDeckResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [provinces, setProvinces] = useState<DukcapilRegionRow[]>([]);
  const [dukIndicators, setDukIndicators] = useState<DukcapilIndicatorGroups | null>(null);
  const [djpkAccounts, setDjpkAccounts] = useState<DjpkAccountGroups | null>(null);

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
    carouselApi
      .deck(q)
      .then(setResult)
      .catch((e) => {
        setResult(null);
        setError(e.message ?? String(e));
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
          <Field label="Peta tiap wilayah">
            <select className={input} value={form.bg} onChange={(e) => set({ bg: e.target.value })}>
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

      {error && (
        <Panel>
          <SectionTitle>Pack tidak dibuat</SectionTitle>
          <ErrorState message={error} />
        </Panel>
      )}
      {result && <Result result={result} form={form} />}
    </div>
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

function Result({ result, form }: { result: CarouselDeckResult; form: Form }) {
  const { pack, map } = result;
  const [copied, setCopied] = useState<string | null>(null);
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

      <Panel>
        <SectionTitle hint="1080×1920, nama file menempatkannya di antara slide deck">Kartu peta</SectionTitle>
        <div className="flex gap-4 overflow-x-auto pb-2">
          {result.cards.map((c) => (
            <figure key={c.file} className="shrink-0">
              <div className="overflow-hidden rounded-xl ring-1 ring-ink-border" style={{ width: 1080 * SCALE, height: 1920 * SCALE }}>
                <iframe
                  src={c.path}
                  title={c.file}
                  loading="lazy"
                  style={{ width: 1080, height: 1920, transform: `scale(${SCALE})`, transformOrigin: "0 0", border: 0 }}
                />
              </div>
              <figcaption className="mt-2 max-w-[270px] truncate font-mono text-[11px] text-ink-faint">{c.file}</figcaption>
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
          <SectionTitle hint="dari folder frontend; PNG masuk ke exports/carousels/">Simpan semua sebagai PNG</SectionTitle>
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

