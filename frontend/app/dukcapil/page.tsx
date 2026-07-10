"use client";

import { useEffect, useMemo, useState } from "react";
import {
  DUKCAPIL_LEVELS,
  dukcapilApi,
  formatNumber,
  type DukcapilCorrelation,
  type DukcapilIndicatorGroups,
  type DukcapilLevel,
  type DukcapilRank,
  type DukcapilRegionDetail,
  type DukcapilRegionRow,
  type DukcapilSummary,
} from "@/lib/api";
import { HorizontalBars, type BarDatum } from "@/components/HorizontalBars";
import { DukcapilMap } from "@/components/DukcapilMap";
import { Badge, Panel, SectionTitle, StatTile } from "@/components/ui";

const TOP_N = 25;
type View = "ranking" | "map";

export default function DukcapilPage() {
  const [summary, setSummary] = useState<DukcapilSummary | null>(null);
  const [catalog, setCatalog] = useState<DukcapilIndicatorGroups | null>(null);

  const [view, setView] = useState<View>("ranking");
  const [level, setLevel] = useState<DukcapilLevel>("province");
  const [indicator, setIndicator] = useState("jumlah_penduduk");
  const [order, setOrder] = useState<"desc" | "asc">("desc");

  // Cascading parent filters (province -> regency -> district).
  const [provinces, setProvinces] = useState<DukcapilRegionRow[]>([]);
  const [regencies, setRegencies] = useState<DukcapilRegionRow[]>([]);
  const [districts, setDistricts] = useState<DukcapilRegionRow[]>([]);
  const [selProv, setSelProv] = useState("");
  const [selReg, setSelReg] = useState("");
  const [selDist, setSelDist] = useState("");

  const [rankData, setRankData] = useState<DukcapilRank | null>(null);
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<DukcapilRegionDetail | null>(null);

  useEffect(() => {
    dukcapilApi.summary().then(setSummary);
    dukcapilApi.indicators().then(setCatalog);
    dukcapilApi.regions({ level: "province" }).then(setProvinces);
  }, []);

  // Load child options as parents are picked (by ancestor code, not
  // immediate parent — so a province lists all its regencies, etc.).
  useEffect(() => {
    if (!selProv) return setRegencies([]);
    dukcapilApi.regions({ level: "regency", prov: selProv }).then(setRegencies);
  }, [selProv]);
  useEffect(() => {
    if (!selReg) return setDistricts([]);
    dukcapilApi.regions({ level: "district", kab: selReg }).then(setDistricts);
  }, [selReg]);

  // Ancestor scope for the ranking: whichever ancestors are selected. The
  // backend applies the deepest one, so picking just a province — or
  // province+kabupaten — both narrow the results (adaptive filtering).
  const ancestor = useMemo(() => {
    const p: Record<string, string> = {};
    if (selProv) p.prov = selProv;
    if (selReg) p.kab = selReg;
    if (selDist) p.kec = selDist;
    return p;
  }, [selProv, selReg, selDist]);

  // Deep levels with no ancestor picked fall back to a nationwide top-N.
  const noFilter = (level === "district" || level === "village") && !selProv;

  useEffect(() => {
    setLoading(true);
    setDetail(null);
    dukcapilApi
      .rank({ indicator, level, order, limit: String(TOP_N), ...ancestor })
      .then(setRankData)
      .finally(() => setLoading(false));
  }, [indicator, level, order, ancestor]);

  const indUnit = rankData?.indicator.unit || "";
  const bars: BarDatum[] = (rankData?.results ?? []).map((r) => ({
    label: r.domain_name,
    value: r.value,
  }));

  const totals = summary?.national_totals ?? {};

  const selectedInd = useMemo(() => {
    for (const g of catalog?.groups ?? []) {
      const found = g.indicators.find((i) => i.field === indicator);
      if (found) return found;
    }
    return null;
  }, [catalog, indicator]);

  const indicatorSelect = (
    <div className="min-w-[220px] flex-1">
      <label className="mb-1.5 block text-xs uppercase tracking-wide text-ink-muted">Indikator</label>
      <select
        value={indicator}
        onChange={(e) => setIndicator(e.target.value)}
        className="w-full rounded-lg border border-ink-border bg-ink-panel px-3 py-2 text-sm text-ink-text focus:border-ink-accent/60 focus:outline-none"
      >
        {catalog?.groups.map((g) => (
          <optgroup key={g.group} label={g.group}>
            {g.indicators.map((i) => (
              <option key={i.field} value={i.field}>
                {i.label_id}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold text-ink-text">Dukcapil</h1>
            <Badge tone="accent">Sumber: Kemendagri / Ditjen Dukcapil</Badge>
          </div>
          <p className="mt-1 text-sm text-ink-muted">
            Data kependudukan administratif (semester berjalan) langsung dari GIS Dukcapil —
            terpisah dari data BPS. Setiap angka berasal dari respons ArcGIS yang direkam.
          </p>
        </div>
        {summary?.period && (
          <div className="text-right text-xs text-ink-muted">
            <div>
              Periode: <span className="font-medium text-ink-text">{summary.period}</span>
              {summary.periods.length > 1 && <span> (dari {summary.periods.length} snapshot)</span>}
            </div>
            {summary.last_fetched_at && (
              <div>Direkam: {new Date(summary.last_fetched_at).toLocaleDateString("id-ID")}</div>
            )}
          </div>
        )}
      </div>

      {/* View switch. */}
      <div className="inline-flex flex-wrap gap-1 rounded-xl border border-ink-border/80 bg-ink-panel/50 p-1">
        {([["ranking", "Peringkat"], ["map", "Peta"]] as [View, string][]).map(([v, label]) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${
              view === v
                ? "bg-brand-gradient text-white shadow-glow"
                : "text-ink-muted hover:bg-ink-panel2/70 hover:text-ink-text"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* National headline totals (summed from provinces). */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Jumlah Penduduk" value={totals.jumlah_penduduk ?? "–"} sub="jiwa (nasional)" />
        <StatTile label="Kepala Keluarga" value={totals.jumlah_kk ?? "–"} sub="KK" accent="accent2" />
        <StatTile label="Laki-laki" value={totals.pria ?? "–"} sub="jiwa" accent="good" />
        <StatTile label="Perempuan" value={totals.wanita ?? "–"} sub="jiwa" accent="warn" />
      </div>

      {/* Controls. In map view only the indicator matters (province geometry). */}
      {view === "map" ? (
        <Panel>
          <div className="flex flex-wrap items-end gap-4">{indicatorSelect}</div>
        </Panel>
      ) : (
      <Panel>
        <div className="flex flex-wrap items-end gap-4">
          {/* Level switch. */}
          <div>
            <label className="mb-1.5 block text-xs uppercase tracking-wide text-ink-muted">Tingkat</label>
            <div className="inline-flex flex-wrap gap-1 rounded-xl border border-ink-border/80 bg-ink-panel/50 p-1">
              {DUKCAPIL_LEVELS.map((l) => (
                <button
                  key={l.v}
                  onClick={() => {
                    setLevel(l.v);
                    // Reset parent selections deeper than the new level.
                    if (l.v === "province" || l.v === "regency") { setSelReg(""); setSelDist(""); }
                    if (l.v === "province") setSelProv("");
                    if (l.v !== "village") setSelDist("");
                  }}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                    level === l.v
                      ? "bg-brand-gradient text-white shadow-glow"
                      : "text-ink-muted hover:bg-ink-panel2/70 hover:text-ink-text"
                  }`}
                >
                  {l.label}
                </button>
              ))}
            </div>
          </div>

          {/* Cascading parent filters. */}
          {level !== "province" && (
            <Select
              label="Provinsi"
              value={selProv}
              onChange={(v) => { setSelProv(v); setSelReg(""); setSelDist(""); }}
              options={provinces}
              placeholder={level === "regency" ? "Semua provinsi" : "Pilih provinsi"}
            />
          )}
          {(level === "district" || level === "village") && (
            <Select
              label="Kabupaten/Kota"
              value={selReg}
              onChange={(v) => { setSelReg(v); setSelDist(""); }}
              options={regencies}
              disabled={!selProv}
              placeholder={level === "district" ? "Semua kab/kota" : "Pilih kab/kota"}
            />
          )}
          {level === "village" && (
            <Select
              label="Kecamatan"
              value={selDist}
              onChange={setSelDist}
              options={districts}
              disabled={!selReg}
              placeholder="Semua kecamatan"
            />
          )}

          {/* Indicator picker (grouped). */}
          {indicatorSelect}

          {/* Order toggle. */}
          <div>
            <label className="mb-1.5 block text-xs uppercase tracking-wide text-ink-muted">Urutan</label>
            <button
              onClick={() => setOrder((o) => (o === "desc" ? "asc" : "desc"))}
              className="rounded-lg border border-ink-border bg-ink-panel px-3 py-2 text-sm text-ink-text hover:border-ink-accent/60"
            >
              {order === "desc" ? "Tertinggi ↓" : "Terendah ↑"}
            </button>
          </div>
        </div>

        {noFilter && (
          <p className="mt-3 text-xs text-ink-muted">
            Menampilkan {TOP_N} teratas se-nasional. Pilih provinsi (dan kab/kota) di atas untuk memfokuskan.
          </p>
        )}
      </Panel>
      )}

      {view === "map" ? (
        selectedInd && (
          <DukcapilMap indicator={indicator} label={selectedInd.label_id} unit={selectedInd.unit} />
        )
      ) : (
      <>
      {/* Ranking. */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Panel className="lg:col-span-2">
          <SectionTitle hint={`${rankData?.level ?? level} · top ${TOP_N}`}>
            {rankData?.indicator.label_id ?? "Peringkat"} {indUnit && <span>({indUnit})</span>}
          </SectionTitle>
          {loading ? (
            <div className="flex h-40 items-center justify-center text-sm text-ink-muted">Memuat…</div>
          ) : (
            <HorizontalBars data={bars} unit={indUnit} />
          )}
        </Panel>

        <div className="space-y-4">
          <Panel>
            <SectionTitle>Sebaran</SectionTitle>
            {rankData?.stats && (
              <dl className="space-y-2 text-sm">
                <Stat row="Jumlah wilayah" value={formatNumber(rankData.stats.count)} />
                <Stat row="Maksimum" value={formatNumber(rankData.stats.max)} />
                <Stat row="Median" value={formatNumber(rankData.stats.median)} />
                <Stat row="Rata-rata" value={formatNumber(rankData.stats.mean)} />
                <Stat row="Minimum" value={formatNumber(rankData.stats.min)} />
              </dl>
            )}
          </Panel>
          <Panel>
            <SectionTitle hint="klik untuk profil lengkap">Peringkat</SectionTitle>
            <div className="max-h-72 space-y-1 overflow-y-auto scroll-thin">
              {(rankData?.results ?? []).map((r) => (
                <button
                  key={r.domain_id}
                  onClick={() => dukcapilApi.regionDetail(r.domain_id).then(setDetail)}
                  className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-sm hover:bg-ink-panel2"
                >
                  <span className="flex items-center gap-2 truncate">
                    <span className="w-6 shrink-0 text-xs tabular-nums text-ink-muted">{r.rank}</span>
                    <span className="truncate text-ink-text">{r.domain_name}</span>
                  </span>
                  <span className="shrink-0 tabular-nums text-ink-muted">{formatNumber(r.value)}</span>
                </button>
              ))}
            </div>
          </Panel>
        </div>
      </div>

      {detail && <RegionProfile detail={detail} onClose={() => setDetail(null)} />}
      </>
      )}
    </div>
  );
}

function Select({
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
        className="min-w-[160px] rounded-lg border border-ink-border bg-ink-panel px-3 py-2 text-sm text-ink-text focus:border-ink-accent/60 focus:outline-none disabled:opacity-40"
      >
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o.code} value={o.code}>
            {o.name}
          </option>
        ))}
      </select>
    </div>
  );
}

function Stat({ row, value }: { row: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-ink-muted">{row}</dt>
      <dd className="tabular-nums text-ink-text">{value}</dd>
    </div>
  );
}

function RegionProfile({ detail, onClose }: { detail: DukcapilRegionDetail; onClose: () => void }) {
  const r = detail.region;
  const scope = [r.nama_kec, r.nama_kab, r.nama_prop].filter(Boolean).join(", ");
  return (
    <Panel glow>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <SectionTitle hint={scope || undefined}>Profil: {r.name}</SectionTitle>
          <p className="text-xs text-ink-muted">
            Peringkat & persentil dihitung terhadap {detail.peer_scope}.
          </p>
        </div>
        <button
          onClick={onClose}
          className="rounded-lg border border-ink-border px-2 py-1 text-xs text-ink-muted hover:text-ink-text"
        >
          Tutup
        </button>
      </div>
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {detail.groups.map((g) => (
          <div key={g.group}>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-accent">{g.group}</div>
            <div className="space-y-1.5">
              {g.indicators.map((i) => (
                <div key={i.field} className="text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-ink-muted">{i.label_id}</span>
                    <span className="shrink-0 tabular-nums text-ink-text">{formatNumber(i.value)}</span>
                  </div>
                  {i.percentile !== null && (
                    <div className="mt-0.5 flex items-center gap-2">
                      <div className="h-1 flex-1 overflow-hidden rounded-full bg-ink-panel2">
                        <div className="h-full bg-brand-gradient" style={{ width: `${i.percentile}%` }} />
                      </div>
                      <span className="w-16 shrink-0 text-right text-[10px] text-ink-muted">
                        #{i.rank}/{i.of}
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}
