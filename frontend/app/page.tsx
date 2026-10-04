"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  api,
  djpkApi,
  dukcapilApi,
  formatCompact,
  formatNumber,
  type DjpkSummary,
  type DukcapilRank,
  type DukcapilSummary,
  type Summary,
} from "@/lib/api";
import { POSTS } from "@/lib/posts";
import { routes } from "@/lib/routes";
import { useCountUp } from "@/lib/useCountUp";
import { ErrorState, Eyebrow, Skeleton } from "@/components/ui";
import { HeroMap, SEA_RAMP } from "@/components/home/HeroMap";
import { StoryCover } from "@/components/StoryCover";
import { openSearch, SearchIcon } from "@/components/CommandPalette";

const POPULAR = ["Jawa Barat", "Kemiskinan", "Indeks Pembangunan Manusia", "Makassar"];

export default function HomePage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [duk, setDuk] = useState<DukcapilSummary | null>(null);
  const [djpk, setDjpk] = useState<DjpkSummary | null>(null);
  const [density, setDensity] = useState<DukcapilRank | null>(null);
  const [pop, setPop] = useState<DukcapilRank | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.summary(), dukcapilApi.summary()])
      .then(([s, d]) => {
        setSummary(s);
        setDuk(d);
      })
      .catch((e) => setError(String(e)));
    // Secondary blocks fail soft: the page still works without them.
    djpkApi.summary().then(setDjpk).catch(() => {});
    dukcapilApi.rank({ indicator: "pop_density_big", level: "province", limit: "100" }).then(setDensity).catch(() => {});
    dukcapilApi.rank({ indicator: "jumlah_penduduk", level: "province", limit: "100" }).then(setPop).catch(() => {});
  }, []);

  const people = useCountUp(duk?.national_totals?.jumlah_penduduk ?? null);

  if (error) return <ErrorState message={error} />;

  const levels = Object.fromEntries((duk?.by_level ?? []).map((l) => [l.level, l.regions]));
  const [lead, ...rest] = POSTS;

  return (
    <div className="space-y-16 sm:space-y-20">
      {/* ── Hero: thesis + search on the left, the country on the right ── */}
      <section className="grid items-stretch gap-8 pt-2 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-10">
        <div className="flex flex-col justify-center">
          <span className="inline-flex w-fit items-center gap-2 rounded-full bg-ink-accent/10 px-3 py-1 text-xs font-semibold text-ink-accent">
            <span className="h-1.5 w-1.5 rounded-full bg-ink-accent" />
            Data resmi{duk?.period ? ` · Dukcapil ${duk.period}` : ""}
          </span>
          <h1 className="mt-5 font-display text-[44px] font-medium leading-[1.0] tracking-[-0.025em] text-ink-text sm:text-6xl lg:text-[66px]">
            Indonesia, dibaca dari <em className="text-ink-accent">angka resminya.</em>
          </h1>
          <p className="mt-5 max-w-xl text-[17px] leading-relaxed text-ink-muted">
            BPS, Dukcapil, dan Kemenkeu dalam satu tempat — dari nasional hingga desa. Setiap angka bisa ditelusuri ke
            respons sumbernya.
          </p>
          <button
            onClick={() => openSearch()}
            className="mt-7 flex h-14 w-full max-w-xl items-center gap-3 rounded-2xl border-[1.5px] border-ink-accent bg-ink-panel px-5 text-left text-[15px] text-ink-faint shadow-[0_0_0_5px_rgb(var(--ink-accent)/0.08)] transition-shadow hover:shadow-[0_0_0_7px_rgb(var(--ink-accent)/0.12)]"
          >
            <SearchIcon className="h-5 w-5 shrink-0 text-ink-accent" />
            <span className="truncate">Cari: Makassar, IPM, kemiskinan…</span>
            <kbd className="ml-auto hidden rounded-md border border-ink-border bg-ink-panel2 px-1.5 py-0.5 font-mono text-[11px] text-ink-muted sm:block">
              ⌘K
            </kbd>
          </button>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-[13px] text-ink-muted">
            Populer:
            {POPULAR.map((p) => (
              <button
                key={p}
                onClick={() => openSearch(p)}
                className="rounded-full border border-ink-border bg-ink-panel px-3 py-1 text-ink-text transition-colors hover:border-ink-accent/50"
              >
                {p}
              </button>
            ))}
          </div>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href={routes.explore}
              className="inline-flex h-12 items-center rounded-full bg-brand-gradient px-6 text-[15px] font-bold text-white shadow-glow transition-transform hover:-translate-y-0.5"
            >
              Jelajahi peta →
            </Link>
            <Link
              href={routes.sorotan}
              className="inline-flex h-12 items-center rounded-full border border-ink-borderStrong px-6 text-[15px] font-bold text-ink-text transition-colors hover:bg-ink-panel"
            >
              Baca Sorotan
            </Link>
          </div>
        </div>

        <div className="relative flex flex-col overflow-hidden rounded-[28px] bg-coal-bg p-5 text-coal-text shadow-lift ring-1 ring-white/5 sm:p-7">
          <div className="pointer-events-none absolute inset-0 bg-royal-weave opacity-60" />
          <div className="relative flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="whitespace-nowrap text-[34px] font-extrabold leading-none tracking-[-0.03em] tabular-nums sm:text-[46px]">
                {people !== null ? formatNumber(people) : <Skeleton className="h-11 w-72 !bg-white/10" />}
              </div>
              <div className="mt-2 text-[13px] text-coal-muted">penduduk tercatat · Dukcapil{duk?.period ? `, ${duk.period}` : ""}</div>
            </div>
            <div className="flex items-center gap-2 font-mono text-[10.5px] text-coal-muted">
              <span>jiwa/km²</span>
              <span className="flex h-2 w-36 overflow-hidden rounded-full">
                {SEA_RAMP.map((c) => (
                  <span key={c} className="flex-1" style={{ background: c }} />
                ))}
              </span>
            </div>
          </div>
          <div className="relative mt-3 flex flex-1 flex-col justify-center">
            {density && pop ? (
              <HeroMap density={density.results} population={pop.results} />
            ) : (
              <div className="aspect-[1000/375] w-full animate-pulse rounded-xl bg-white/5" />
            )}
          </div>
          <div className="relative mt-4 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-white/10 pt-4 text-[13px] text-coal-muted sm:grid-cols-4">
            {[
              ["province", "provinsi"],
              ["regency", "kab/kota"],
              ["district", "kecamatan"],
              ["village", "desa/kelurahan"],
            ].map(([k, l]) => (
              <div key={k}>
                <b className="block text-base font-bold tabular-nums text-coal-text">{levels[k] ? formatNumber(levels[k]) : "–"}</b>
                {l}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Three sources ── */}
      <section>
        <SectionHead eyebrow="Tiga sumber resmi" title="Satu tempat, sumber tetap terpisah" />
        <div className="grid gap-4 md:grid-cols-3">
          <SourceCard
            name="Badan Pusat Statistik"
            tag="BPS WebAPI"
            stats={[
              [summary ? formatCompact(summary.total_data_points) : null, "titik data"],
              [summary ? formatNumber(summary.variables_with_data) : null, "indikator"],
            ]}
            href={routes.variables}
            cta="Katalog indikator"
          />
          <SourceCard
            name="Ditjen Dukcapil"
            tag="Kemendagri"
            stats={[
              [duk?.national_totals?.jumlah_penduduk ? formatCompact(duk.national_totals.jumlah_penduduk) : null, "jiwa"],
              [duk?.national_totals?.jumlah_kk ? formatCompact(duk.national_totals.jumlah_kk) : null, "kepala keluarga"],
            ]}
            href={routes.dukcapil}
            cta="Profil kependudukan"
          />
          <SourceCard
            name="Ditjen Perimbangan Keuangan"
            tag="Kemenkeu"
            stats={[
              [djpk?.years?.length ? `${Math.min(...djpk.years)}–${Math.max(...djpk.years)}` : null, "realisasi APBD"],
              [djpk ? formatNumber(djpk.by_level.reduce((a, l) => a + l.regions, 0)) : null, "pemerintah daerah"],
            ]}
            href={routes.keuangan}
            cta="Keuangan daerah"
          />
        </div>
      </section>

      {/* ── Latest Sorotan ── */}
      <section>
        <SectionHead
          eyebrow="Analisis pilihan"
          title="Sorotan terbaru"
          action={<Link href={routes.sorotan} className="text-sm font-bold text-ink-accent hover:underline">Semua {POSTS.length} analisis →</Link>}
        />
        <div className="grid gap-5 lg:grid-cols-[1.35fr_1fr_1fr]">
          {[lead, ...rest.slice(0, 2)].map((p, i) => (
            <Link
              key={p.slug}
              href={routes.post(p.slug)}
              className="group flex flex-col overflow-hidden rounded-[20px] border border-ink-border bg-ink-panel shadow-tile transition-all hover:-translate-y-1 hover:shadow-lift"
            >
              <StoryCover highlight={p.cover?.prov} label={p.cover?.label ?? "Nasional"} className="aspect-[16/9]" />
              <div className="flex flex-1 flex-col gap-2 p-5">
                <Eyebrow>
                  {p.tag} · {p.source}
                </Eyebrow>
                <h3 className={`font-display font-medium leading-[1.1] tracking-[-0.01em] text-ink-text group-hover:text-ink-accent ${i === 0 ? "text-[30px]" : "text-2xl"}`}>
                  {p.title}
                </h3>
                <p className="text-sm leading-relaxed text-ink-muted">{p.subtitle}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* ── Ways in by theme ── */}
      <section>
        <SectionHead eyebrow="Mulai dari tema" title="Apa yang ingin Anda ketahui?" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Theme dark href={routes.dukcapil} title="Kependudukan" sub="Dukcapil · prov → desa" icon={<PeopleIcon />} />
          {(summary?.by_category ?? []).map((c) => (
            <Theme
              key={c.category}
              href={`${routes.variables}?kategori=${encodeURIComponent(c.category)}`}
              title={c.category.replace(" dan ", " & ")}
              sub={`${formatNumber(c.with_data)} indikator BPS`}
              icon={c.category.startsWith("Ekonomi") ? <ChartIcon /> : c.category.startsWith("Sosial") ? <BookIcon /> : <LeafIcon />}
            />
          ))}
          <Theme href={routes.keuangan} title="Keuangan daerah" sub="APBD & PAD · DJPK" icon={<WalletIcon />} />
          <Theme href={routes.explore} title="Wilayah" sub="Peta & profil daerah" icon={<PinIcon />} />
        </div>
      </section>

      {/* ── Coverage: how complete the BPS data is (the project's core claim) ── */}
      {summary && (
        <section className="grid gap-6 rounded-[24px] border border-ink-border bg-ink-panel p-6 shadow-panel sm:p-8 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <Eyebrow>Cakupan data BPS</Eyebrow>
            <h2 className="mt-2 font-display text-3xl font-medium leading-tight text-ink-text">
              {formatNumber(summary.variables_with_data)} dari {formatNumber(summary.total_variables)} indikator punya data riil.
            </h2>
            <p className="mt-3 text-[15px] leading-relaxed text-ink-muted">
              Ketersediaan dikonfirmasi dari respons BPS WebAPI yang tersimpan, bukan dari klaim metadata. Rentang tahun{" "}
              {summary.year_min}–{summary.year_max} (termasuk proyeksi).
            </p>
          </div>
          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <div className="text-xs font-bold uppercase tracking-[0.08em] text-ink-muted">Titik data per tingkat</div>
              <div className="mt-3 space-y-3">
                {summary.by_admin_level.map((l) => {
                  const max = Math.max(...summary.by_admin_level.map((x) => x.data_points));
                  const label = { national: "Nasional", province: "Provinsi", regency: "Kab/Kota" }[l.admin_level] ?? l.label;
                  return (
                    <Bar key={l.admin_level} label={label} value={formatCompact(l.data_points)} pct={(l.data_points / max) * 100} />
                  );
                })}
              </div>
            </div>
            <div>
              <div className="text-xs font-bold uppercase tracking-[0.08em] text-ink-muted">Indikator dengan data</div>
              <div className="mt-3 space-y-3">
                {summary.by_category.map((c) => (
                  <Bar
                    key={c.category}
                    label={c.category.replace(" dan ", " & ")}
                    value={`${formatNumber(c.with_data)} / ${formatNumber(c.variables)}`}
                    pct={c.variables ? (c.with_data / c.variables) * 100 : 0}
                  />
                ))}
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

function SectionHead({ eyebrow, title, action }: { eyebrow: string; title: string; action?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <Eyebrow>{eyebrow}</Eyebrow>
        <h2 className="mt-2 font-display text-3xl font-medium tracking-[-0.015em] text-ink-text sm:text-[38px]">{title}</h2>
      </div>
      {action}
    </div>
  );
}

function SourceCard({
  name,
  tag,
  stats,
  href,
  cta,
}: {
  name: string;
  tag: string;
  stats: [string | null, string][];
  href: string;
  cta: string;
}) {
  return (
    <Link
      href={href}
      className="group flex flex-col gap-5 rounded-[20px] border border-ink-border bg-ink-panel p-6 shadow-tile transition-all hover:-translate-y-0.5 hover:border-ink-accent/40 hover:shadow-panel"
    >
      <div className="flex items-start justify-between gap-3">
        <span className="text-[15px] font-bold text-ink-text">{name}</span>
        <span className="shrink-0 rounded-full border border-ink-border bg-ink-panel2 px-2.5 py-0.5 text-[11px] font-semibold text-ink-muted">{tag}</span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {stats.map(([v, l]) => (
          <div key={l}>
            {v ? (
              <div className="whitespace-nowrap text-[26px] font-extrabold leading-none tracking-[-0.02em] text-ink-text tabular-nums">{v}</div>
            ) : (
              <Skeleton className="h-7 w-24" />
            )}
            <div className="mt-1.5 text-[12.5px] text-ink-muted">{l}</div>
          </div>
        ))}
      </div>
      <span className="mt-auto text-sm font-bold text-ink-accent">
        {cta} <span className="inline-block transition-transform group-hover:translate-x-1">→</span>
      </span>
    </Link>
  );
}

function Theme({ title, sub, href, icon, dark = false }: { title: string; sub: string; href: string; icon: React.ReactNode; dark?: boolean }) {
  return (
    <Link
      href={href}
      className={`group flex min-h-[132px] flex-col justify-between rounded-[18px] border p-4 transition-all hover:-translate-y-0.5 hover:shadow-panel ${
        dark ? "border-transparent bg-laut-800 text-kertas-200" : "border-ink-border bg-ink-panel text-ink-text"
      }`}
    >
      <span className={`h-7 w-7 ${dark ? "text-kunyit-light" : "text-ink-accent"}`}>{icon}</span>
      <span>
        <span className="block text-[15px] font-bold leading-snug">{title}</span>
        <span className={`mt-0.5 block text-[12.5px] ${dark ? "text-laut-200" : "text-ink-muted"}`}>{sub}</span>
      </span>
    </Link>
  );
}

function Bar({ label, value, pct }: { label: string; value: string; pct: number }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="truncate text-ink-text">{label}</span>
        <span className="shrink-0 tabular-nums text-ink-muted">{value}</span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-ink-panel2">
        <div className="h-full rounded-full bg-ink-accent" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

const ic = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, className: "h-full w-full" };
const PeopleIcon = () => (<svg {...ic}><circle cx="9" cy="8" r="3" /><path d="M3.5 19a5.5 5.5 0 0 1 11 0M16 6.2a3 3 0 0 1 0 5.6M17.5 19a5.5 5.5 0 0 0-2.7-4.7" /></svg>);
const ChartIcon = () => (<svg {...ic}><path d="M4 19V9M10 19V5M16 19v-7M22 19H2" /></svg>);
const BookIcon = () => (<svg {...ic}><path d="m2 9 10-5 10 5-10 5z" /><path d="M6 11v5c3 2 9 2 12 0v-5" /></svg>);
const LeafIcon = () => (<svg {...ic}><path d="M5 19c0-8 5-13 14-14-1 9-6 14-14 14Z" /><path d="M5 19 13 11" /></svg>);
const WalletIcon = () => (<svg {...ic}><rect x="3" y="6" width="18" height="13" rx="2" /><path d="M3 10h18M16 14.5h2" /></svg>);
const PinIcon = () => (<svg {...ic}><path d="M12 21s7-6.1 7-11.5A7 7 0 0 0 5 9.5C5 14.9 12 21 12 21Z" /><circle cx="12" cy="9.5" r="2.4" /></svg>);
