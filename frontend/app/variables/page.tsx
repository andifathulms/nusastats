"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { api, formatNumber, type Paginated, type Summary, type VariableRow } from "@/lib/api";
import { routes } from "@/lib/routes";
import { EmptyState, Eyebrow, Loadable, Skeleton, SkeletonRows } from "@/components/ui";

const LEVELS = [
  { v: "national", label: "Nasional", short: "N" },
  { v: "province", label: "Provinsi", short: "P" },
  { v: "regency", label: "Kabupaten/Kota", short: "K" },
];
const RECENCY = [
  { v: "", label: "Semua" },
  { v: "2015", label: "≥ 2015" },
  { v: "2020", label: "≥ 2020" },
  { v: "2024", label: "≥ 2024" },
];
const SORTS = [
  { v: "", label: "Kategori, A–Z" },
  { v: "data", label: "Data terbanyak" },
  { v: "recent", label: "Data terbaru" },
  { v: "name", label: "Nama, A–Z" },
];
// Shared axis for every row's year bar, so coverage can be compared at a glance.
const AXIS_FROM = 1950;
const AXIS_TO = 2035;
const PAGE_SIZE = 50;

export default function VariablesPage() {
  return (
    <Suspense>
      <Catalog />
    </Suspense>
  );
}

function Catalog() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  // All filter state lives in the URL so a filtered view can be shared.
  const category = params.get("kategori") ?? "";
  const levels = (params.get("tingkat") ?? "").split(",").filter(Boolean);
  const since = params.get("sejak") ?? "";
  const sort = params.get("urut") ?? "";
  const page = Number(params.get("hal") ?? "1") || 1;
  const q = params.get("q") ?? "";

  const [keyword, setKeyword] = useState(q);
  const [data, setData] = useState<Paginated<VariableRow> | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(false);
  const [showFilters, setShowFilters] = useState(false); // phones: facets collapse behind a button

  const setParams = (patch: Record<string, string>, keepPage = false) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) (v ? next.set(k, v) : next.delete(k));
    if (!keepPage) next.delete("hal");
    const s = next.toString();
    router.replace(s ? `${pathname}?${s}` : pathname, { scroll: false });
  };

  useEffect(() => {
    api.summary().then(setSummary).catch(() => {});
  }, []);

  // Debounce typing into the URL.
  useEffect(() => {
    if (keyword === q) return;
    const t = setTimeout(() => setParams({ q: keyword }), 300);
    return () => clearTimeout(t);
  }, [keyword]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setLoading(true);
    const p: Record<string, string> = { page: String(page) };
    if (q) p.keyword = q;
    if (category) p.category = category;
    if (levels.length) p.admin_level = levels.join(",");
    if (since) p.min_year_max = since;
    if (sort) p.sort = sort;
    api
      .variables(p)
      .then(setData)
      .finally(() => setLoading(false));
  }, [params.toString()]); // eslint-disable-line react-hooks/exhaustive-deps

  const totalPages = data ? Math.max(1, Math.ceil(data.count / PAGE_SIZE)) : 1;
  const active = [category, levels.length ? "x" : "", since].filter(Boolean).length + (q ? 1 : 0);

  return (
    <div className="space-y-8">
      <header className="border-b border-ink-border pb-6">
        <Eyebrow>Badan Pusat Statistik</Eyebrow>
        <h1 className="mt-3 font-display text-4xl font-medium leading-none tracking-[-0.02em] text-ink-text sm:text-[54px]">Katalog indikator</h1>
        <div className="mt-3 text-[15px] text-ink-muted">
          {data ? (
            <b className="font-bold text-ink-text">{formatNumber(data.count)}</b>
          ) : (
            <Skeleton className="inline-block h-4 w-12 align-middle" />
          )}{" "}
          <span>indikator dengan data riil{active ? " cocok dengan saringan Anda" : ""}. Klik untuk grafik deret waktu.</span>
        </div>
      </header>

      <div className="grid gap-8 lg:grid-cols-[250px_minmax(0,1fr)]">
        {/* ── Facets ── */}
        <aside className="space-y-6 lg:sticky lg:top-24 lg:self-start">
          <input
            id="catalog-search"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="Cari indikator…"
            aria-label="Cari indikator BPS"
            className="h-11 w-full rounded-full border border-ink-border bg-ink-panel px-5 text-sm text-ink-text placeholder:text-ink-faint focus:border-ink-accent focus:outline-none"
          />
          <button
            onClick={() => setShowFilters((v) => !v)}
            aria-expanded={showFilters}
            className="flex w-full items-center justify-between rounded-full border border-ink-border bg-ink-panel px-5 py-2.5 text-sm font-semibold text-ink-text lg:hidden"
          >
            Saring{active ? ` (${active} aktif)` : ""}
            <span aria-hidden>{showFilters ? "▴" : "▾"}</span>
          </button>
          <div className={`space-y-6 ${showFilters ? "block" : "hidden"} lg:block`}>
          <Facet title="Kategori">
            <Radio name="kategori" checked={!category} onChange={() => setParams({ kategori: "" })} label="Semua kategori" count={summary?.variables_with_data} />
            {summary?.by_category.map((c) => (
              <Radio
                key={c.category}
                name="kategori"
                checked={category === c.category}
                onChange={() => setParams({ kategori: c.category })}
                label={c.category}
                count={c.with_data}
              />
            ))}
          </Facet>
          <Facet title="Tersedia di tingkat">
            {LEVELS.map((l) => (
              <label key={l.v} className="flex cursor-pointer items-center gap-2.5 py-1 text-sm text-ink-text">
                <input
                  type="checkbox"
                  checked={levels.includes(l.v)}
                  onChange={(e) =>
                    setParams({ tingkat: (e.target.checked ? [...levels, l.v] : levels.filter((x) => x !== l.v)).join(",") })
                  }
                  className="h-4 w-4 rounded accent-[rgb(var(--ink-accent))]"
                />
                <span className="grid h-5 w-6 place-items-center rounded-md border border-ink-border bg-ink-panel2 font-mono text-[10.5px] font-semibold text-ink-muted">{l.short}</span>
                {l.label}
              </label>
            ))}
            <p className="mt-1 text-xs text-ink-faint">Centang beberapa = harus ada di semuanya.</p>
          </Facet>
          <Facet title="Data hingga tahun">
            <div className="flex flex-wrap gap-1.5">
              {RECENCY.map((r) => (
                <button
                  key={r.v}
                  onClick={() => setParams({ sejak: r.v })}
                  aria-pressed={since === r.v}
                  className={`rounded-full border px-3 py-1 text-[13px] font-semibold transition-colors ${
                    since === r.v ? "border-ink-accent bg-ink-accent text-ink-onAccent" : "border-ink-border text-ink-text hover:border-ink-accent/50"
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </Facet>
          {active > 0 && (
            <button
              onClick={() => {
                setKeyword("");
                router.replace(pathname, { scroll: false });
              }}
              className="text-sm font-semibold text-ink-accent hover:underline"
            >
              Hapus semua saringan
            </button>
          )}
          </div>
        </aside>

        {/* ── Results ── */}
        <div className="min-w-0 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-ink-muted">
            <span aria-live="polite">{loading ? "Memuat…" : `Halaman ${formatNumber(page)} dari ${formatNumber(totalPages)}`}</span>
            <label className="flex items-center gap-2">
              Urutkan
              <select
                id="catalog-sort"
                value={sort}
                onChange={(e) => setParams({ urut: e.target.value })}
                className="h-9 rounded-full border border-ink-border bg-ink-panel px-3.5 text-sm font-semibold text-ink-text focus:border-ink-accent focus:outline-none"
              >
                {SORTS.map((s) => (
                  <option key={s.v} value={s.v}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <Loadable
            first={!data}
            loading={loading}
            fallback={
              <div className="rounded-[20px] border border-ink-border bg-ink-panel p-5">
                <SkeletonRows rows={10} />
              </div>
            }
          >
            <div className="overflow-hidden rounded-[20px] border border-ink-border bg-ink-panel shadow-panel">
              <div className="hidden grid-cols-[minmax(0,1fr)_104px_240px_72px] gap-5 border-b border-ink-border bg-ink-bg2 px-5 py-2.5 font-mono text-[10.5px] font-medium uppercase tracking-[0.08em] text-ink-muted md:grid">
                <span>Indikator</span>
                <span title="N = Nasional · P = Provinsi · K = Kabupaten/Kota">Tingkat</span>
                <span>
                  Cakupan tahun · {AXIS_FROM}–{AXIS_TO}
                </span>
                <span className="text-right">Titik</span>
              </div>
              {data?.results.map((v) => (
                <Link
                  key={v.id}
                  href={routes.variable(v.variable_id)}
                  className="group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-5 gap-y-2 border-b border-ink-border/60 px-5 py-3.5 transition-colors last:border-0 hover:bg-ink-accent/[0.05] md:grid-cols-[minmax(0,1fr)_104px_240px_72px]"
                >
                  <div className="col-span-2 min-w-0 md:col-span-1">
                    <div className="font-semibold leading-snug text-ink-text group-hover:text-ink-accent">{v.name}</div>
                    <div className="mt-0.5 truncate text-[12.5px] text-ink-muted">
                      {[v.unit, v.subject_category].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    {LEVELS.map((l) => {
                      const on = (v.admin_levels ?? []).includes(l.v);
                      return (
                        <span
                          key={l.v}
                          title={`${l.label}: ${on ? "ada data" : "tidak ada"}`}
                          className={`grid h-6 w-7 place-items-center rounded-md border font-mono text-[10.5px] font-semibold ${
                            on ? "border-ink-accent/30 bg-ink-accent/10 text-ink-accent" : "border-ink-border text-ink-faint/70"
                          }`}
                        >
                          {l.short}
                        </span>
                      );
                    })}
                  </div>
                  <YearBar from={v.year_min} to={v.year_max} />
                  <div className="hidden text-right font-bold tabular-nums text-ink-text md:block">{formatNumber(v.data_point_count)}</div>
                </Link>
              ))}
              {data && data.results.length === 0 && (
                <div className="p-6">
                  <EmptyState title="Tidak ada indikator yang cocok" hint="Coba kata kunci lain, atau longgarkan saringan kategori/tingkat/tahun." />
                </div>
              )}
            </div>
          </Loadable>

          <div className="flex justify-end gap-2 text-sm">
            <button
              disabled={page <= 1}
              onClick={() => setParams({ hal: String(page - 1) }, true)}
              className="rounded-full border border-ink-border px-4 py-1.5 font-semibold text-ink-text hover:bg-ink-panel disabled:opacity-40"
            >
              ← Sebelumnya
            </button>
            <button
              disabled={page >= totalPages}
              onClick={() => setParams({ hal: String(page + 1) }, true)}
              className="rounded-full border border-ink-border px-4 py-1.5 font-semibold text-ink-text hover:bg-ink-panel disabled:opacity-40"
            >
              Berikutnya →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function YearBar({ from, to }: { from: number | null; to: number | null }) {
  if (!from || !to) return <span className="text-xs text-ink-faint">–</span>;
  const pos = (y: number) => ((Math.min(AXIS_TO, Math.max(AXIS_FROM, y)) - AXIS_FROM) / (AXIS_TO - AXIS_FROM)) * 100;
  const left = pos(from);
  const width = Math.max(1.2, pos(to) - left);
  return (
    <div className="flex items-center gap-3 md:block">
      <div className="relative h-[22px] w-40 shrink-0 md:w-full">
        <div className="absolute inset-x-0 top-[10px] h-0.5 rounded-full bg-ink-panel3" />
        <div className="absolute top-[6px] h-2.5 rounded-full bg-ink-accent" style={{ left: `${left}%`, width: `${width}%` }} />
      </div>
      <span className="font-mono text-[11px] tabular-nums text-ink-muted">
        {from}–{to}
      </span>
    </div>
  );
}

function Facet({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset>
      <legend className="mb-2 text-[11px] font-bold uppercase tracking-[0.08em] text-ink-muted">{title}</legend>
      {children}
    </fieldset>
  );
}

function Radio({ name, checked, onChange, label, count }: { name: string; checked: boolean; onChange: () => void; label: string; count?: number }) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 py-1 text-sm text-ink-text">
      <input type="radio" name={name} checked={checked} onChange={onChange} className="h-4 w-4 accent-[rgb(var(--ink-accent))]" />
      <span className="min-w-0 flex-1 leading-snug">{label}</span>
      {count !== undefined && <span className="text-xs tabular-nums text-ink-faint">{formatNumber(count)}</span>}
    </label>
  );
}
