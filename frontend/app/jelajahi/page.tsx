"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { dukcapilApi, formatNumber, regionLabel, type DukcapilRegionRow } from "@/lib/api";
import { routes } from "@/lib/routes";
import { EmptyState, Eyebrow, Panel, Skeleton } from "@/components/ui";
import { AreaExplorer } from "@/components/explore/AreaExplorer";

// Five levels. Provinsi/Kab-Kota browse on a Dukcapil map + list and link to
// the BPS-keyed profile (via provinceHref / the regency crosswalk); Kecamatan/
// Desa are Dukcapil-only and reached through a cascading parent filter.
type Level = "national" | "province" | "regency" | "district" | "village";
const LEVELS: { v: Level; label: string }[] = [
  { v: "national", label: "Nasional" },
  { v: "province", label: "Provinsi" },
  { v: "regency", label: "Kab/Kota" },
  { v: "district", label: "Kecamatan" },
  { v: "village", label: "Desa/Kel" },
];

export default function ExplorePage() {
  const [level, setLevel] = useState<Level>("province");
  const [counts, setCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    dukcapilApi
      .summary()
      .then((s) => setCounts(Object.fromEntries(s.by_level.map((l) => [l.level, l.regions]))))
      .catch(() => {});
  }, []);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-5 border-b border-ink-border pb-6">
        <div>
          <Eyebrow>
            {counts.province
              ? `${formatNumber(counts.province)} provinsi · ${formatNumber(counts.regency)} kab/kota · ${formatNumber(counts.district)} kecamatan · ${formatNumber(counts.village)} desa/kel`
              : "Nasional hingga desa/kelurahan"}
          </Eyebrow>
          <h1 className="mt-3 font-display text-4xl font-medium leading-none tracking-[-0.02em] text-ink-text sm:text-[54px]">
            Jelajahi wilayah
          </h1>
          <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-ink-muted">
            Pilih lewat peta atau daftar. Setiap profil menggabungkan indikator BPS dan data kependudukan Dukcapil bila
            tersedia.
          </p>
        </div>
        <div role="tablist" aria-label="Tingkat wilayah" className="flex flex-wrap rounded-full border border-ink-border bg-ink-bg2 p-1">
          {LEVELS.map((l) => (
            <button
              key={l.v}
              role="tab"
              aria-selected={level === l.v}
              onClick={() => setLevel(l.v)}
              className={`rounded-full px-3.5 py-1.5 text-[13.5px] font-semibold transition-colors ${
                level === l.v ? "bg-ink-panel text-ink-text shadow-tile" : "text-ink-muted hover:text-ink-text"
              }`}
            >
              {l.label}
            </button>
          ))}
        </div>
      </header>

      {level === "province" || level === "regency" ? (
        <AreaExplorer key={level} level={level} />
      ) : level === "national" ? (
        <NationalCard />
      ) : (
        <DukcapilBrowser level={level as "district" | "village"} />
      )}
    </div>
  );
}

function NationalCard() {
  return (
    <Link
      href={routes.region("0000")}
      className="group block overflow-hidden rounded-[24px] bg-coal-bg p-8 text-coal-text shadow-lift transition-transform hover:-translate-y-0.5 sm:p-10"
    >
      <Eyebrow className="!text-ink-gold">Profil nasional</Eyebrow>
      <div className="mt-3 font-display text-4xl font-medium sm:text-5xl">Indonesia</div>
      <p className="mt-3 max-w-xl text-coal-muted">
        Semua indikator BPS tingkat nasional, dengan deret waktu dan perbandingan antarprovinsi.
      </p>
      <span className="mt-6 inline-block font-bold text-laut-300">Buka profil nasional <span className="inline-block transition-transform group-hover:translate-x-1">→</span></span>
    </Link>
  );
}

// --- Dukcapil-only levels: kecamatan / desa --------------------------------

function DukcapilBrowser({ level }: { level: "district" | "village" }) {
  const [provinces, setProvinces] = useState<DukcapilRegionRow[]>([]);
  const [regencies, setRegencies] = useState<DukcapilRegionRow[]>([]);
  const [districts, setDistricts] = useState<DukcapilRegionRow[]>([]);
  const [selProv, setSelProv] = useState("");
  const [selReg, setSelReg] = useState("");
  const [selDist, setSelDist] = useState("");
  const [rows, setRows] = useState<DukcapilRegionRow[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    dukcapilApi.regions({ level: "province" }).then(setProvinces);
  }, []);
  useEffect(() => {
    setSelReg("");
    setSelDist("");
    if (!selProv) return setRegencies([]);
    dukcapilApi.regions({ level: "regency", prov: selProv }).then(setRegencies);
  }, [selProv]);
  useEffect(() => {
    setSelDist("");
    if (!selReg) return setDistricts([]);
    dukcapilApi.regions({ level: "district", kab: selReg }).then(setDistricts);
  }, [selReg]);

  // The list needs a parent: kecamatan needs a kab/kota; desa needs a kecamatan.
  const ready = level === "district" ? !!selReg : !!selDist;
  useEffect(() => {
    if (!ready) return setRows([]);
    setLoading(true);
    const params: Record<string, string> = { level };
    if (level === "district") params.kab = selReg;
    else params.kec = selDist;
    dukcapilApi
      .regions({ ...params, limit: "2000" })
      .then(setRows)
      .finally(() => setLoading(false));
  }, [ready, level, selReg, selDist]);

  const filtered = useMemo(
    () => rows.filter((r) => !search || r.name.toLowerCase().includes(search.toLowerCase())),
    [rows, search]
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <Picker label="Provinsi" value={selProv} onChange={setSelProv} options={provinces} placeholder="Pilih provinsi" />
        <Picker
          label="Kabupaten/Kota"
          value={selReg}
          onChange={setSelReg}
          options={regencies}
          disabled={!selProv}
          placeholder="Pilih kab/kota"
        />
        {level === "village" && (
          <Picker
            label="Kecamatan"
            value={selDist}
            onChange={setSelDist}
            options={districts}
            disabled={!selReg}
            placeholder="Pilih kecamatan"
          />
        )}
        {ready && (
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari nama…"
            className="min-w-[180px] flex-1 rounded-lg border border-ink-border bg-ink-panel px-4 py-2 text-sm text-ink-text placeholder:text-ink-muted focus:border-ink-accent focus:outline-none"
          />
        )}
      </div>

      {!ready ? (
        <p className="text-sm text-ink-muted">
          Pilih {level === "district" ? "provinsi dan kabupaten/kota" : "provinsi, kabupaten/kota, dan kecamatan"} untuk
          menampilkan daftar.
        </p>
      ) : loading ? (
        <RegionCardsSkeleton />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="Tidak ada wilayah yang cocok"
          hint={search ? `Tidak ada nama yang mengandung “${search}”.` : "Wilayah ini belum punya data tercatat."}
        />
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {filtered.map((r) => (
            <RegionCard key={r.code} code={r.code} label={regionLabel(r.name, r.status)} small />
          ))}
        </div>
      )}
    </div>
  );
}

function Picker({
  label,
  value,
  onChange,
  options,
  placeholder,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: DukcapilRegionRow[];
  placeholder: string;
  disabled?: boolean;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-xs uppercase tracking-wide text-ink-muted">{label}</label>
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="min-w-[170px] rounded-lg border border-ink-border bg-ink-panel px-3 py-2 text-sm text-ink-text focus:border-ink-accent/60 focus:outline-none disabled:opacity-40"
      >
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o.code} value={o.code}>
            {regionLabel(o.name, o.status)}
          </option>
        ))}
      </select>
    </div>
  );
}

function RegionCard({ code, label, sub, small }: { code: string; label: string; sub?: string; small?: boolean }) {
  return (
    <Link href={routes.region(code)}>
      <Panel className={`transition-colors hover:border-ink-accent/60 ${small ? "p-3" : ""}`}>
        <div className={`font-medium text-ink-text ${small ? "text-sm" : ""}`}>{label}</div>
        {sub && <div className="mt-0.5 text-xs text-ink-muted">{sub}</div>}
      </Panel>
    </Link>
  );
}

/** A grid of card-shaped placeholders — the region list is always a card grid. */
function RegionCardsSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {Array.from({ length: 12 }).map((_, i) => (
        <div key={i} className="rounded-2xl border border-ink-border bg-ink-panel p-5 shadow-panel">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="mt-2 h-3 w-16" />
        </div>
      ))}
    </div>
  );
}
