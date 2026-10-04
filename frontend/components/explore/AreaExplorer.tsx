"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  dukcapilApi,
  formatCompact,
  formatDecimal,
  formatNumber,
  regionLabel,
  type DukcapilRank,
} from "@/lib/api";
import { provinceHref, routes } from "@/lib/routes";
import { useIsDark } from "@/lib/theme";
import { OutlineMap, type OutlineValue } from "@/components/OutlineMap";
import { ErrorState, Skeleton } from "@/components/ui";

// Map colour layer choices — Dukcapil indicators (raw + derived) that read well
// on a map. Summable ones get group subtotals in the list.
const LAYERS = [
  { field: "jumlah_penduduk", label: "Jumlah penduduk", summable: true },
  { field: "pop_density_big", label: "Kepadatan penduduk", summable: false },
  { field: "median_age", label: "Usia median", summable: false },
  { field: "pct_elderly", label: "% Lansia (65+)", summable: false },
  { field: "pct_sarjana", label: "% Sarjana ke atas", summable: false },
  { field: "ktp_coverage", label: "Cakupan KTP-el", summable: false },
  { field: "sex_ratio", label: "Rasio jenis kelamin", summable: false },
];

const RAMP_LIGHT = ["#E3EBFA", "#CBDAF6", "#A3BEF0", "#6B96E6", "#3A72DB", "#1C4596", "#10264D"];
const RAMP_DARK = ["#1A2E55", "#22417A", "#2B57A3", "#3F73CC", "#6B96E6", "#A3BEF0", "#F3ECDD"];

// Island groups by Dukcapil 2-digit province code.
const ISLANDS: [string, RegExp][] = [
  ["Sumatera", /^(1\d|21)/],
  ["Jawa", /^3\d/],
  ["Bali & Nusa Tenggara", /^5\d/],
  ["Kalimantan", /^6\d/],
  ["Sulawesi", /^7\d/],
  ["Maluku", /^8\d/],
  ["Papua", /^9\d/],
];

function fmtValue(v: number, unit: string, compact = false): string {
  if (unit === "%") return `${formatDecimal(v, 1)}%`;
  if (unit === "jiwa") return compact ? formatCompact(v) : formatNumber(Math.round(v));
  if (unit.includes("km")) return `${formatDecimal(v, v < 100 ? 1 : 0)}`;
  return formatDecimal(v, 1);
}

type Row = { code: string; name: string; value: number; group: string; href: string | null };

export function AreaExplorer({ level }: { level: "province" | "regency" }) {
  const router = useRouter();
  const dark = useIsDark();
  const [layer, setLayer] = useState(LAYERS[0]);
  const [rank, setRank] = useState<DukcapilRank | null>(null);
  const [bpsOf, setBpsOf] = useState<Map<string, string> | null>(level === "province" ? new Map() : null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [hover, setHover] = useState<string | null>(null);

  useEffect(() => {
    setRank(null);
    dukcapilApi
      .rank({ indicator: layer.field, level, limit: "1000" })
      .then(setRank)
      .catch((e) => setError(String(e)));
  }, [layer, level]);

  // Kab/kota links go to the BPS profile, whose codes differ from Kemendagri's
  // in most provinces — resolve through the validated crosswalk, never by code.
  useEffect(() => {
    if (level !== "regency") return;
    dukcapilApi
      .regencyCrosswalk()
      .then((cw) => setBpsOf(new Map(cw.results.map((r) => [r.kemendagri_code, r.bps_domain_id]))))
      .catch(() => setBpsOf(new Map()));
  }, [level]);

  const unit = rank?.unit ?? "";

  const rows: Row[] = useMemo(() => {
    if (!rank || !bpsOf) return [];
    return rank.results.map((r) => {
      const name = level === "regency" ? regionLabel(r.domain_name, r.status) : r.domain_name;
      const group =
        level === "province"
          ? ISLANDS.find(([, re]) => re.test(r.domain_id))?.[0] ?? "Lainnya"
          : r.nama_prop
            ? r.nama_prop.toLowerCase().replace(/\b\w/g, (m) => m.toUpperCase()).replace(/^Dki\b/, "DKI").replace(/^Di\b/, "DI")
            : "—";
      const href =
        level === "province" ? provinceHref(r.domain_id) : bpsOf.has(r.domain_id) ? routes.region(bpsOf.get(r.domain_id)!) : null;
      return { code: r.domain_id, name, value: r.value, group, href };
    });
  }, [rank, bpsOf, level]);

  const values = useMemo(
    () =>
      new Map<string, OutlineValue>(
        rows.map((r) => [r.code, { name: r.name, value: r.value, lines: [`${fmtValue(r.value, unit)} ${unit}`.trim()] }]),
      ),
    [rows, unit],
  );

  const groups = useMemo(() => {
    const q = search.trim().toLowerCase();
    const m = new Map<string, Row[]>();
    for (const r of rows) {
      if (q && !r.name.toLowerCase().includes(q) && !r.group.toLowerCase().includes(q)) continue;
      m.set(r.group, [...(m.get(r.group) ?? []), r]);
    }
    const order = level === "province" ? ISLANDS.map(([n]) => n) : [...m.keys()].sort();
    return order.filter((g) => m.has(g)).map((g) => [g, m.get(g)!.sort((a, b) => b.value - a.value)] as const);
  }, [rows, search, level]);

  const max = Math.max(1, ...rows.map((r) => r.value));
  const sorted = [...rows].sort((a, b) => b.value - a.value);

  if (error) return <ErrorState message={error} />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <input
          id="explore-search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={level === "province" ? "Cari provinsi atau pulau…" : "Cari kabupaten/kota atau provinsi…"}
          aria-label="Cari wilayah"
          className="h-11 w-full rounded-full border border-ink-border bg-ink-panel px-5 text-sm text-ink-text placeholder:text-ink-faint focus:border-ink-accent focus:outline-none sm:w-80"
        />
        <label className="flex items-center gap-2 text-sm text-ink-muted">
          Warna peta
          <select
            id="explore-layer"
            value={layer.field}
            onChange={(e) => setLayer(LAYERS.find((l) => l.field === e.target.value)!)}
            className="h-11 rounded-full border border-ink-border bg-ink-panel px-4 text-sm font-semibold text-ink-text focus:border-ink-accent focus:outline-none"
          >
            {LAYERS.map((l) => (
              <option key={l.field} value={l.field}>
                {l.label}
              </option>
            ))}
          </select>
        </label>
        <span className="text-xs text-ink-faint sm:ml-auto">Sumber: Dukcapil{rank ? ` · ${rows.length} wilayah` : ""}</span>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_420px]">
        <div className="rounded-[20px] border border-ink-border bg-ink-panel p-4 shadow-panel sm:p-6">
          {rank && bpsOf ? (
            <OutlineMap
              kind={level === "province" ? "provinces" : "regencies"}
              values={values}
              ramp={dark ? RAMP_DARK : RAMP_LIGHT}
              noData={dark ? "#2E3442" : "#D6D3CA"}
              stroke={dark ? "#10213F" : "#FFFDF8"}
              highlight={hover}
              onHover={setHover}
              onSelect={(c) => {
                const r = rows.find((x) => x.code === c);
                if (r?.href) router.push(r.href);
              }}
              ariaLabel={`Peta ${layer.label.toLowerCase()} per ${level === "province" ? "provinsi" : "kabupaten/kota"}`}
            />
          ) : (
            <Skeleton className="aspect-[1000/375] w-full rounded-xl" />
          )}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 font-mono text-[11px] text-ink-muted">
            <span>{layer.label}{unit ? ` (${unit})` : ""} · kelas kuantil</span>
            <span className="flex h-2 w-48 overflow-hidden rounded-full">
              {(dark ? RAMP_DARK : RAMP_LIGHT).map((c) => (
                <span key={c} className="flex-1" style={{ background: c }} />
              ))}
            </span>
          </div>
          {sorted.length > 0 && (
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <Fact label="Tertinggi" name={sorted[0].name} value={`${fmtValue(sorted[0].value, unit)} ${unit}`} />
              <Fact label="Terendah" name={sorted[sorted.length - 1].name} value={`${fmtValue(sorted[sorted.length - 1].value, unit)} ${unit}`} />
              {layer.summable ? (
                <Fact label="Total" name={`${rows.length} wilayah`} value={`${formatCompact(rows.reduce((a, r) => a + r.value, 0))} ${unit}`} />
              ) : (
                <Fact label="Median" name={`${rows.length} wilayah`} value={`${fmtValue(rank?.stats.median ?? 0, unit)} ${unit}`} />
              )}
            </div>
          )}
        </div>

        <div className="scroll-thin max-h-[640px] overflow-y-auto rounded-[20px] border border-ink-border bg-ink-panel py-2 shadow-panel">
          {!rank || !bpsOf ? (
            <div className="space-y-3 p-5">
              {Array.from({ length: 12 }).map((_, i) => (
                <Skeleton key={i} className="h-5 w-full" />
              ))}
            </div>
          ) : groups.length === 0 ? (
            <div className="p-8 text-center text-sm text-ink-muted">Tidak ada wilayah yang cocok dengan “{search}”.</div>
          ) : (
            groups.map(([g, list]) => (
              <div key={g}>
                <div className="sticky top-0 z-[1] flex items-baseline justify-between gap-3 bg-ink-panel/95 px-5 pb-1.5 pt-3.5 backdrop-blur">
                  <span className="font-display text-[19px] font-semibold text-ink-text">{g}</span>
                  <span className="text-xs text-ink-muted">
                    {list.length} {level === "province" ? "provinsi" : "kab/kota"}
                    {layer.summable && ` · ${formatCompact(list.reduce((a, r) => a + r.value, 0))} ${unit}`}
                  </span>
                </div>
                {list.map((r) => {
                  const inner = (
                    <>
                      <span className="min-w-0 truncate">{r.name}</span>
                      <span className="h-1.5 overflow-hidden rounded-full bg-ink-panel2">
                        <span className="block h-full rounded-full bg-ink-accent" style={{ width: `${(r.value / max) * 100}%` }} />
                      </span>
                      <span className="text-right text-[13px] tabular-nums text-ink-muted">{fmtValue(r.value, unit, true)}</span>
                    </>
                  );
                  const cls = `grid grid-cols-[minmax(0,1fr)_96px_76px] items-center gap-3 px-5 py-1.5 text-sm text-ink-text transition-colors ${
                    hover === r.code ? "bg-ink-accent/10" : "hover:bg-ink-accent/[0.06]"
                  }`;
                  return r.href ? (
                    <Link key={r.code} href={r.href} className={cls} onMouseEnter={() => setHover(r.code)} onMouseLeave={() => setHover(null)}>
                      {inner}
                    </Link>
                  ) : (
                    <div key={r.code} className={cls} onMouseEnter={() => setHover(r.code)} onMouseLeave={() => setHover(null)}>
                      {inner}
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function Fact({ label, name, value }: { label: string; name: string; value: string }) {
  return (
    <div className="rounded-2xl bg-ink-bg2 px-4 py-3">
      <div className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-ink-warmText">{label}</div>
      <div className="mt-1 truncate text-[15px] font-bold text-ink-text">{name}</div>
      <div className="text-[13px] tabular-nums text-ink-muted">{value}</div>
    </div>
  );
}
