"use client";

import { useEffect, useMemo, useState } from "react";
import {
  djpkApi,
  formatRupiah,
  DJPK_LEVELS,
  PCT_COLOR,
  type DjpkAccountGroups,
  type DjpkMeasure,
  type DjpkRank,
  type DjpkRegionLevel,
  type DjpkSummary,
} from "@/lib/api";
import { Badge, Panel, SectionTitle, StatTile } from "@/components/ui";

const MEASURES: { v: DjpkMeasure; label: string }[] = [
  { v: "realisasi", label: "Realisasi" },
  { v: "anggaran", label: "Anggaran" },
  { v: "persentase", label: "% Serapan" },
];

const GROUP_LABEL: Record<string, string> = {
  pendapatan: "Pendapatan",
  belanja: "Belanja",
  pembiayaan: "Pembiayaan",
};

export default function KeuanganDaerahPage() {
  const [summary, setSummary] = useState<DjpkSummary | null>(null);
  const [catalog, setCatalog] = useState<DjpkAccountGroups | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Controls.
  const [tahun, setTahun] = useState<number | null>(null);
  const [level, setLevel] = useState<DjpkRegionLevel>("province");
  const [measure, setMeasure] = useState<DjpkMeasure>("realisasi");
  const [akun, setAkun] = useState("pad");

  const [rankData, setRankData] = useState<DjpkRank | null>(null);
  const [loadingRank, setLoadingRank] = useState(false);

  // Bootstrap: summary (years, national totals) + account catalog.
  useEffect(() => {
    djpkApi.summary().then((s) => {
      setSummary(s);
      setTahun(s.scope.tahun);
    }).catch((e) => setError(String(e)));
    djpkApi.accounts().then(setCatalog).catch((e) => setError(String(e)));
  }, []);

  // Fetch ranking whenever a control changes.
  useEffect(() => {
    if (tahun === null) return;
    setLoadingRank(true);
    djpkApi
      .rank({ akun, measure, level, tahun: String(tahun), limit: "40" })
      .then(setRankData)
      .catch((e) => setError(String(e)))
      .finally(() => setLoadingRank(false));
  }, [akun, measure, level, tahun]);

  const totals = summary?.national_totals ?? {};
  const maxVal = useMemo(
    () => Math.max(1, ...(rankData?.results ?? []).map((r) => Math.abs(r.value))),
    [rankData],
  );

  if (error) return <div className="text-ink-muted">Gagal memuat: {error}</div>;
  if (!summary) return <div className="text-ink-muted">Memuat…</div>;

  const isPct = measure === "persentase";
  const fmt = (v: number) => (isPct ? `${v.toLocaleString("id-ID", { maximumFractionDigits: 1 })}%` : formatRupiah(v));

  return (
    <div className="space-y-10">
      <section className="relative overflow-hidden rounded-3xl border border-ink-border/70 bg-ink-panel/60 p-8 shadow-panel sm:p-12">
        <div className="pointer-events-none absolute inset-0 bg-brand-radial" />
        <div className="relative">
          <Badge tone="accent">Sumber: Kemenkeu / DJPK–SIKD</Badge>
          <h1 className="mt-4 max-w-2xl font-display text-4xl font-medium leading-[1.1] tracking-tight text-ink-text sm:text-5xl">
            Keuangan daerah: APBD &amp; PAD per wilayah
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-ink-muted sm:text-base">
            Realisasi APBD tiap provinsi dan kabupaten/kota — Pendapatan Asli Daerah, transfer,
            belanja, dan pembiayaan. Setiap angka berasal dari ekspor resmi portal SIKD DJPK,
            terpisah dari data BPS dan Dukcapil.
          </p>
          <div className="mt-5 text-xs text-ink-muted">
            Tahun anggaran <span className="font-medium text-ink-text">{summary.scope.tahun}</span>
            {" · "}realisasi s/d bulan {summary.scope.periode}
            {summary.last_fetched_at && (
              <span> · direkam {new Date(summary.last_fetched_at).toLocaleDateString("id-ID")}</span>
            )}
          </div>
        </div>
      </section>

      {/* National headline totals (summed from provinces). */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Pendapatan Daerah" value={formatRupiah(totals.pendapatan_daerah)} sub="realisasi provinsi (nasional)" accent="accent" />
        <StatTile label="PAD" value={formatRupiah(totals.pad)} sub="Pendapatan Asli Daerah" accent="good" />
        <StatTile label="Belanja Daerah" value={formatRupiah(totals.belanja_daerah)} sub="realisasi" accent="accent2" />
        <StatTile label="Pembiayaan" value={formatRupiah(totals.pembiayaan_daerah)} sub="netto" accent="warn" />
      </div>

      {/* Controls */}
      <Panel>
        <div className="flex flex-wrap items-end gap-4">
          <Field label="Akun">
            <select
              value={akun}
              onChange={(e) => setAkun(e.target.value)}
              className="min-w-[16rem] rounded-lg border border-ink-border bg-ink-panel px-3 py-2 text-sm text-ink-text"
            >
              {catalog?.groups.map((g) => (
                <optgroup key={g.group} label={GROUP_LABEL[g.group] ?? g.group}>
                  {g.accounts.map((a) => (
                    <option key={a.akun_key} value={a.akun_key}>
                      {a.parent_key ? "— " : ""}
                      {a.label_id}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </Field>

          <Field label="Tingkat">
            <Segmented
              options={DJPK_LEVELS.map((l) => ({ v: l.v, label: l.label }))}
              value={level}
              onChange={(v) => setLevel(v as DjpkRegionLevel)}
            />
          </Field>

          <Field label="Ukuran">
            <Segmented
              options={MEASURES.map((m) => ({ v: m.v, label: m.label }))}
              value={measure}
              onChange={(v) => setMeasure(v as DjpkMeasure)}
            />
          </Field>

          <Field label="Tahun">
            <select
              value={tahun ?? ""}
              onChange={(e) => setTahun(Number(e.target.value))}
              className="rounded-lg border border-ink-border bg-ink-panel px-3 py-2 text-sm text-ink-text"
            >
              {summary.years.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </Field>
        </div>
      </Panel>

      {/* Ranked list */}
      <Panel>
        <SectionTitle hint={rankData ? `${rankData.total} wilayah · ${rankData.account.label_id}` : ""}>
          Peringkat {level === "province" ? "provinsi" : "kabupaten/kota"}
        </SectionTitle>
        {loadingRank && <div className="text-sm text-ink-muted">Memuat peringkat…</div>}
        {!loadingRank && rankData && (
          <div className="space-y-1.5">
            {rankData.results.map((r) => {
              const w = Math.round((Math.abs(r.value) / maxVal) * 100);
              return (
                <div key={r.domain_id} className="flex items-center gap-3">
                  <div className="w-6 shrink-0 text-right text-xs tabular-nums text-ink-muted">{r.rank}</div>
                  <div className="w-44 shrink-0 truncate text-sm text-ink-text" title={r.domain_name}>
                    {r.domain_name}
                  </div>
                  <div className="relative h-5 flex-1 overflow-hidden rounded bg-ink-panel2">
                    <div
                      className="h-full rounded"
                      style={{
                        width: `${w}%`,
                        background: isPct ? PCT_COLOR(Math.min(100, r.value)) : "#1E4585",
                      }}
                    />
                  </div>
                  <div className="w-28 shrink-0 text-right text-sm tabular-nums text-ink-text">{fmt(r.value)}</div>
                </div>
              );
            })}
            {rankData.results.length === 0 && (
              <div className="text-sm text-ink-muted">Tidak ada data untuk akun/tahun ini.</div>
            )}
          </div>
        )}
      </Panel>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] font-medium uppercase tracking-wider text-ink-muted">{label}</span>
      {children}
    </label>
  );
}

function Segmented({
  options,
  value,
  onChange,
}: {
  options: { v: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="inline-flex rounded-lg border border-ink-border bg-ink-panel2/50 p-0.5">
      {options.map((o) => (
        <button
          key={o.v}
          onClick={() => onChange(o.v)}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            value === o.v ? "bg-brand-gradient text-white shadow-glow" : "text-ink-muted hover:text-ink-text"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
