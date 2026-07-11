"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  api,
  bpsRegencyStatus,
  dukcapilApi,
  regionLabel,
  type Region,
  type DukcapilRegionRow,
} from "@/lib/api";
import { Panel } from "@/components/ui";

// Five levels across both sources. Nasional/Provinsi/Kab-Kota come from BPS
// (canonical domain_id, keeps ?region= links working); Kecamatan/Desa are
// Dukcapil-only and reached through a cascading parent filter.
type Level = "national" | "province" | "regency" | "district" | "village";
const LEVELS: { v: Level; label: string; src: "bps" | "dukcapil" }[] = [
  { v: "national", label: "Nasional", src: "bps" },
  { v: "province", label: "Provinsi", src: "bps" },
  { v: "regency", label: "Kab/Kota", src: "bps" },
  { v: "district", label: "Kecamatan", src: "dukcapil" },
  { v: "village", label: "Desa/Kelurahan", src: "dukcapil" },
];

export default function RegionsPage() {
  const [level, setLevel] = useState<Level>("province");
  const src = LEVELS.find((l) => l.v === level)!.src;

  return (
    <div className="space-y-5">
      <header className="border-b border-ink-border pb-5">
        <h1 className="font-display text-3xl font-medium tracking-tight text-ink-text sm:text-4xl">Wilayah</h1>
        <p className="mt-2 max-w-2xl text-sm text-ink-muted">
          Telusuri wilayah dari tingkat nasional hingga desa/kelurahan. Setiap profil menggabungkan
          indikator BPS dan data kependudukan Dukcapil bila tersedia.
        </p>
      </header>

      <div className="inline-flex flex-wrap gap-1 rounded-xl border border-ink-border/80 bg-ink-panel/50 p-1 backdrop-blur-sm">
        {LEVELS.map((l) => (
          <button
            key={l.v}
            onClick={() => setLevel(l.v)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              level === l.v ? "bg-brand-gradient text-white shadow-glow" : "text-ink-muted hover:text-ink-text"
            }`}
          >
            {l.label}
          </button>
        ))}
      </div>

      {src === "bps" ? <BpsBrowser level={level} /> : <DukcapilBrowser level={level as "district" | "village"} />}
    </div>
  );
}

// --- BPS levels: nasional / provinsi / kab-kota ----------------------------

function BpsBrowser({ level }: { level: Level }) {
  const [regions, setRegions] = useState<Region[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setSearch("");
    api
      .regions({ admin_level: level })
      .then(setRegions)
      .finally(() => setLoading(false));
  }, [level]);

  const filtered = useMemo(
    () => regions.filter((r) => !search || r.domain_name.toLowerCase().includes(search.toLowerCase())),
    [regions, search]
  );

  // Group kabupaten/kota under their province for readability.
  const grouped = useMemo(() => {
    if (level !== "regency") return null;
    const byProv = new Map<string, Region[]>();
    for (const r of filtered) {
      const key = r.parent_province_name || "—";
      byProv.set(key, [...(byProv.get(key) ?? []), r]);
    }
    return [...byProv.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered, level]);

  if (loading) return <div className="text-ink-muted">Memuat…</div>;

  return (
    <div className="space-y-4">
      {level !== "national" && (
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cari nama wilayah…"
          className="w-full rounded-lg border border-ink-border bg-ink-panel px-4 py-2 text-sm text-ink-text placeholder:text-ink-muted focus:border-ink-accent focus:outline-none"
        />
      )}

      {level === "regency" && grouped ? (
        <div className="space-y-6">
          {grouped.map(([prov, list]) => (
            <div key={prov}>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">{prov}</div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                {list.map((r) => (
                  <RegionCard key={r.domain_id} code={r.domain_id} label={cardLabel(r)} small />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {filtered.map((r) => (
            <RegionCard key={r.domain_id} code={r.domain_id} label={cardLabel(r)} sub={`kode ${r.domain_id}`} />
          ))}
        </div>
      )}
    </div>
  );
}

function cardLabel(r: Region): string {
  return r.admin_level === "regency"
    ? regionLabel(r.domain_name, bpsRegencyStatus(r.domain_id))
    : r.domain_name;
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
        <div className="text-ink-muted">Memuat…</div>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {filtered.map((r) => (
            <RegionCard key={r.code} code={r.code} label={regionLabel(r.name, r.status)} small />
          ))}
          {filtered.length === 0 && <div className="text-sm text-ink-muted">Tidak ada wilayah.</div>}
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
    <Link href={`/regions/${code}`}>
      <Panel className={`transition-colors hover:border-ink-accent/60 ${small ? "p-3" : ""}`}>
        <div className={`font-medium text-ink-text ${small ? "text-sm" : ""}`}>{label}</div>
        {sub && <div className="mt-0.5 text-xs text-ink-muted">{sub}</div>}
      </Panel>
    </Link>
  );
}
