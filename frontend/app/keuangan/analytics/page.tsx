"use client";

import { useEffect, useState } from "react";
import {
  djpkApi,
  formatByUnit,
  DJPK_LEVELS,
  PCT_COLOR,
  type DjpkAccount,
  type DjpkAccountGroups,
  type DjpkMeasure,
  type DjpkRank,
  type DjpkRegionLevel,
  type DjpkSummary,
} from "@/lib/api";
import { Panel, SectionTitle } from "@/components/ui";
import { Field, Segmented, Pager, GROUP_LABEL, MEASURES } from "@/components/keuangan/controls";
import { KeuanganMap } from "@/components/keuangan/KeuanganMap";
import { KeuanganCorrelation } from "@/components/keuangan/KeuanganCorrelation";
import { KeuanganGrowth } from "@/components/keuangan/KeuanganGrowth";
import { KeuanganRegionProfile } from "@/components/keuangan/KeuanganRegionProfile";

type Tab = "rank" | "map" | "correlate" | "growth";
const TABS: { v: Tab; label: string }[] = [
  { v: "rank", label: "Peringkat" },
  { v: "map", label: "Peta" },
  { v: "correlate", label: "Korelasi" },
  { v: "growth", label: "Pertumbuhan" },
];

export default function KeuanganAnalyticsPage() {
  const [summary, setSummary] = useState<DjpkSummary | null>(null);
  const [catalog, setCatalog] = useState<DjpkAccountGroups | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Shared scope.
  const [tahun, setTahun] = useState<number | null>(null);
  const [level, setLevel] = useState<DjpkRegionLevel>("province");
  const [measure, setMeasure] = useState<DjpkMeasure>("realisasi");
  const [akun, setAkun] = useState("pad");
  const [tab, setTab] = useState<Tab>("rank");

  const selAcc: DjpkAccount | undefined = catalog?.groups.flatMap((g) => g.accounts).find((a) => a.akun_key === akun);
  const akunLabel = selAcc?.label_id ?? akun;
  const isDerived = !!selAcc?.derived;

  useEffect(() => {
    djpkApi.summary().then((s) => {
      setSummary(s);
      setTahun(s.scope.tahun);
    }).catch((e) => setError(String(e)));
    djpkApi.accounts().then(setCatalog).catch((e) => setError(String(e)));
  }, []);

  if (error) return <div className="text-ink-muted">Gagal memuat: {error}</div>;
  if (!summary) return <div className="text-ink-muted">Memuat…</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-medium tracking-tight text-ink-text">Analitik keuangan daerah</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Peringkat APBD antar-wilayah — pilih akun, tingkat, ukuran, dan tahun.
        </p>
      </div>

      {/* Shared scope controls */}
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
            <Segmented options={DJPK_LEVELS.map((l) => ({ v: l.v, label: l.label }))} value={level} onChange={(v) => setLevel(v as DjpkRegionLevel)} />
          </Field>
          {!isDerived && (
            <Field label="Ukuran">
              <Segmented options={MEASURES.map((m) => ({ v: m.v, label: m.label }))} value={measure} onChange={(v) => setMeasure(v as DjpkMeasure)} />
            </Field>
          )}
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
        {isDerived && selAcc?.desc && (
          <p className="mt-3 rounded-lg border border-ink-border/70 bg-ink-panel2/40 px-3 py-2 text-xs leading-relaxed text-ink-muted">
            <span className="font-medium text-ink-text">Rasio.</span> {selAcc.desc}
          </p>
        )}
      </Panel>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 border-b border-ink-border">
        {TABS.map((t) => (
          <button
            key={t.v}
            onClick={() => setTab(t.v)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
              tab === t.v ? "border-ink-accent text-ink-accent" : "border-transparent text-ink-muted hover:text-ink-text"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tahun !== null && tab === "rank" && (
        <RankView akun={akun} level={level} measure={measure} tahun={tahun} />
      )}
      {tahun !== null && tab === "map" && (
        <KeuanganMap akun={akun} label={akunLabel} level={level} measure={measure} tahun={tahun} />
      )}
      {tahun !== null && tab === "correlate" && (
        <KeuanganCorrelation xKey={akun} xLabel={akunLabel} level={level} measure={measure} tahun={tahun} catalog={catalog} />
      )}
      {tab === "growth" && (
        <KeuanganGrowth akun={akun} label={akunLabel} level={level} measure={measure} years={summary.years} />
      )}
    </div>
  );
}

const PER_PAGE = 20;

function RankView({ akun, level, measure, tahun }: { akun: string; level: DjpkRegionLevel; measure: DjpkMeasure; tahun: number }) {
  const [data, setData] = useState<DjpkRank | null>(null);
  const [loading, setLoading] = useState(false);
  const [openCode, setOpenCode] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [order, setOrder] = useState<"desc" | "asc">("desc");

  // Reset to the first page whenever the query (not the page) changes.
  useEffect(() => { setPage(0); }, [akun, level, measure, tahun, order]);

  useEffect(() => {
    setLoading(true);
    djpkApi
      .rank({ akun, measure, level, tahun: String(tahun), order, limit: String(PER_PAGE), offset: String(page * PER_PAGE) })
      .then(setData)
      .finally(() => setLoading(false));
  }, [akun, measure, level, tahun, order, page]);

  const isPct = data?.unit === "%";
  // Scale bars by the GLOBAL max/min (from stats) so widths stay comparable
  // across pages — not by the current page's own max.
  const maxVal = Math.max(1, Math.abs(data?.stats?.max ?? 0), Math.abs(data?.stats?.min ?? 0));
  const fmt = (v: number) => formatByUnit(v, data?.unit);
  const total = data?.total ?? 0;
  const shown = data?.results.length ?? 0;
  const offset = data?.offset ?? 0;

  return (
    <Panel>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <SectionTitle hint={data ? `${total} wilayah · klik baris untuk rincian` : ""}>
          Peringkat {level === "province" ? "provinsi" : "kabupaten/kota"}
        </SectionTitle>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setOrder((o) => (o === "desc" ? "asc" : "desc"))}
            className="rounded-md border border-ink-border px-2 py-1 text-xs text-ink-text hover:border-ink-accent/60"
            title="Balik urutan"
          >
            {order === "desc" ? "Tertinggi ↓" : "Terendah ↑"}
          </button>
          {data && total > 0 && (
            <Pager
              offset={offset}
              shown={shown}
              total={total}
              onPrev={() => setPage((p) => Math.max(0, p - 1))}
              onNext={() => setPage((p) => p + 1)}
            />
          )}
        </div>
      </div>
      {loading && <div className="text-sm text-ink-muted">Memuat…</div>}
      {!loading && data && (
        <div className="space-y-1.5">
          {data.results.map((r) => {
            const w = Math.round((Math.abs(r.value) / maxVal) * 100);
            return (
              <button
                key={r.domain_id}
                onClick={() => setOpenCode(r.domain_id)}
                className="flex w-full items-center gap-3 rounded-md px-1 py-0.5 text-left transition-colors hover:bg-ink-panel2/60"
              >
                <div className="w-8 shrink-0 text-right text-xs tabular-nums text-ink-muted">{r.rank}</div>
                <div className="w-44 shrink-0 truncate text-sm text-ink-text" title={r.domain_name}>{r.domain_name}</div>
                <div className="relative h-5 flex-1 overflow-hidden rounded bg-ink-panel2">
                  <div className="h-full rounded" style={{ width: `${w}%`, background: isPct ? PCT_COLOR(Math.min(100, r.value)) : "#1E4585" }} />
                </div>
                <div className="w-28 shrink-0 text-right text-sm tabular-nums text-ink-text">{fmt(r.value)}</div>
              </button>
            );
          })}
          {data.results.length === 0 && <div className="text-sm text-ink-muted">Tidak ada data untuk akun/tahun ini.</div>}
        </div>
      )}
      {openCode && <KeuanganRegionProfile code={openCode} tahun={tahun} onClose={() => setOpenCode(null)} />}
    </Panel>
  );
}
