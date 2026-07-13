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
import { Panel, SectionTitle } from "@/components/ui";
import { Field, Segmented, GROUP_LABEL, MEASURES } from "@/components/keuangan/controls";

type Tab = "rank";

export default function KeuanganAnalyticsPage() {
  const [summary, setSummary] = useState<DjpkSummary | null>(null);
  const [catalog, setCatalog] = useState<DjpkAccountGroups | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Shared scope.
  const [tahun, setTahun] = useState<number | null>(null);
  const [level, setLevel] = useState<DjpkRegionLevel>("province");
  const [measure, setMeasure] = useState<DjpkMeasure>("realisasi");
  const [akun, setAkun] = useState("pad");
  const [tab] = useState<Tab>("rank");

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
          <Field label="Ukuran">
            <Segmented options={MEASURES.map((m) => ({ v: m.v, label: m.label }))} value={measure} onChange={(v) => setMeasure(v as DjpkMeasure)} />
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

      {tab === "rank" && tahun !== null && (
        <RankView akun={akun} level={level} measure={measure} tahun={tahun} />
      )}
    </div>
  );
}

function RankView({ akun, level, measure, tahun }: { akun: string; level: DjpkRegionLevel; measure: DjpkMeasure; tahun: number }) {
  const [data, setData] = useState<DjpkRank | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    djpkApi
      .rank({ akun, measure, level, tahun: String(tahun), limit: "60" })
      .then(setData)
      .finally(() => setLoading(false));
  }, [akun, measure, level, tahun]);

  const isPct = measure === "persentase";
  const maxVal = useMemo(() => Math.max(1, ...(data?.results ?? []).map((r) => Math.abs(r.value))), [data]);
  const fmt = (v: number) => (isPct ? `${v.toLocaleString("id-ID", { maximumFractionDigits: 1 })}%` : formatRupiah(v));

  return (
    <Panel>
      <SectionTitle hint={data ? `${data.total} wilayah · ${data.account.label_id}` : ""}>
        Peringkat {level === "province" ? "provinsi" : "kabupaten/kota"}
      </SectionTitle>
      {loading && <div className="text-sm text-ink-muted">Memuat…</div>}
      {!loading && data && (
        <div className="space-y-1.5">
          {data.results.map((r) => {
            const w = Math.round((Math.abs(r.value) / maxVal) * 100);
            return (
              <div key={r.domain_id} className="flex items-center gap-3">
                <div className="w-6 shrink-0 text-right text-xs tabular-nums text-ink-muted">{r.rank}</div>
                <div className="w-44 shrink-0 truncate text-sm text-ink-text" title={r.domain_name}>{r.domain_name}</div>
                <div className="relative h-5 flex-1 overflow-hidden rounded bg-ink-panel2">
                  <div className="h-full rounded" style={{ width: `${w}%`, background: isPct ? PCT_COLOR(Math.min(100, r.value)) : "#1E4585" }} />
                </div>
                <div className="w-28 shrink-0 text-right text-sm tabular-nums text-ink-text">{fmt(r.value)}</div>
              </div>
            );
          })}
          {data.results.length === 0 && <div className="text-sm text-ink-muted">Tidak ada data untuk akun/tahun ini.</div>}
        </div>
      )}
    </Panel>
  );
}
