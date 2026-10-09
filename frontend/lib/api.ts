// The browser calls the Django backend directly (CORS is configured on the
// backend for this origin). Base URL is overridable at build time via
// NEXT_PUBLIC_API_BASE; default is the local docker-mapped backend port.
const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8010";

export type Summary = {
  total_variables: number;
  confirmed_variables: number;
  variables_with_data: number;
  total_data_points: number;
  total_domains: number;
  subject_categories: number;
  year_min: number | null;
  year_max: number | null;
  by_admin_level: { admin_level: string; label: string; domains: number; data_points: number }[];
  by_category: { category: string; variables: number; with_data: number }[];
};

export type VariableRow = {
  id: number;
  variable_id: string;
  name: string;
  unit: string;
  subject_name: string;
  subject_category: string;
  data_point_count: number;
  year_min: number | null;
  year_max: number | null;
  admin_levels?: string[];
};

export type RegionVariables = {
  region: Region;
  total_variables: number;
  total_data_points: number;
  year_min: number | null;
  year_max: number | null;
  results: {
    variable_id: string;
    name: string;
    unit: string;
    subject_category: string;
    data_point_count: number;
    year_min: number | null;
    year_max: number | null;
  }[];
};

export type Paginated<T> = { count: number; next: string | null; previous: string | null; results: T[] };

export type Dimensions = {
  variable_id: string;
  name: string;
  unit: string;
  years: number[];
  admin_levels: string[];
  vervars: { vervar_id: string; vervar_label: string }[];
  turvars: { turvar_id: string; turvar_label: string }[];
};

export type DataPoint = {
  domain_id: string;
  domain_name: string;
  admin_level: string;
  year: number | null;
  vervar_id: string;
  vervar_label: string;
  turvar_id: string;
  turvar_label: string;
  value: number;
};

export type Series = {
  variable_id: string;
  name: string;
  unit: string;
  count: number;
  // The backend caps a series at 10,000 rows; `truncated` says the cap was hit
  // and `total` is the full match count, so a chart never silently drops data.
  total: number;
  truncated: boolean;
  results: DataPoint[];
};

export type Ranking = {
  variable_id: string;
  name: string;
  unit: string;
  admin_level: string;
  year: number | null;
  turvar_id: string | null;
  stats: { count: number; min: number | null; max: number | null; mean: number | null; median: number | null };
  total: number;
  offset: number;
  results: { domain_id: string; domain_name: string; value: number; rank: number }[];
};

export type RegionProfile = {
  region: Region;
  count: number;
  results: {
    variable_id: string;
    name: string;
    unit: string;
    subject_category: string;
    year: number;
    value: number;
    rank: number | null;
    of: number;
    percentile: number | null;
  }[];
};

export type Trend = {
  variable_id: string;
  name: string;
  unit: string;
  has_national: boolean;
  change_pct: number | null;
  cagr_pct: number | null;
  results: {
    year: number;
    national: number | null;
    prov_mean: number | null;
    prov_min: number | null;
    prov_max: number | null;
  }[];
};

export type Correlation = {
  x: { variable_id: string; name: string; unit: string };
  y: { variable_id: string; name: string; unit: string };
  admin_level: string;
  year: number | null;
  n: number;
  r: number | null;
  results: { domain_id: string; domain_name: string; x: number; y: number }[];
};

export type Growth = {
  variable_id: string;
  name: string;
  unit: string;
  admin_level: string;
  year_from: number | null;
  year_to: number | null;
  turvar_id: string | null;
  results: {
    domain_id: string;
    domain_name: string;
    value_from: number;
    value_to: number;
    change: number;
    change_pct: number | null;
    rank: number;
  }[];
};

export type Region = {
  domain_id: string;
  domain_name: string;
  admin_level: string;
  parent_province_id: string | null;
  parent_province_name?: string | null;
};

// Identical GETs already in flight share one network request. The browser HTTP
// cache (the backend sends Cache-Control + ETag) covers repeats once a response
// has landed; this covers the moment several components on one page ask for the
// same thing at once (crosswalk, bridge, province lists), which the HTTP cache
// can't merge. Each caller parses its own copy, since some mutate results.
const inflight = new Map<string, Promise<string>>();

async function get<T>(path: string): Promise<T> {
  const url = `${API_BASE}/api${path}`;
  let body = inflight.get(url);
  if (!body) {
    body = fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`API ${path} -> ${res.status}`);
        return res.text();
      })
      .finally(() => inflight.delete(url));
    inflight.set(url, body);
  }
  return JSON.parse(await body) as T;
}

// Fetch a series for many domain_id/vervar_id values in a few batched requests
// (instead of one per value), merged into one result. Batches keep each
// response under the backend's 10k-row series cap.
async function seriesBatched(
  variableId: string,
  key: "domain_id" | "vervar_id",
  values: string[],
  params: Record<string, string> = {},
  batchSize = 8
): Promise<Series> {
  const batches: string[][] = [];
  for (let i = 0; i < values.length; i += batchSize) batches.push(values.slice(i, i + batchSize));
  const parts = await Promise.all(batches.map((b) => api.series(variableId, { ...params, [key]: b })));
  const results = parts.flatMap((p) => p.results);
  const first = parts[0];
  return {
    variable_id: first?.variable_id ?? variableId,
    name: first?.name ?? "",
    unit: first?.unit ?? "",
    count: results.length,
    total: parts.reduce((n, p) => n + p.total, 0),
    truncated: parts.some((p) => p.truncated),
    results,
  };
}

export const api = {
  summary: () => get<Summary>("/stats/summary/"),
  variables: (params: Record<string, string> = {}) => {
    const q = new URLSearchParams(params).toString();
    return get<Paginated<VariableRow>>(`/stats/variables/${q ? `?${q}` : ""}`);
  },
  dimensions: (variableId: string) => get<Dimensions>(`/stats/variables/${variableId}/dimensions/`),
  series: (variableId: string, params: Record<string, string | string[]> = {}) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (Array.isArray(v)) v.forEach((x) => q.append(k, x));
      else q.append(k, v);
    }
    const qs = q.toString();
    return get<Series>(`/stats/variables/${variableId}/series/${qs ? `?${qs}` : ""}`);
  },
  seriesBatched,
  regions: (params: Record<string, string> = {}) => {
    const q = new URLSearchParams(params).toString();
    return get<Region[]>(`/stats/regions/${q ? `?${q}` : ""}`);
  },
  regionVariables: (domainId: string, params: Record<string, string> = {}) => {
    const q = new URLSearchParams(params).toString();
    return get<RegionVariables>(`/stats/regions/${domainId}/variables/${q ? `?${q}` : ""}`);
  },
  regionProfile: (domainId: string, params: Record<string, string> = {}) => {
    const q = new URLSearchParams(params).toString();
    return get<RegionProfile>(`/stats/regions/${domainId}/profile/${q ? `?${q}` : ""}`);
  },
  ranking: (variableId: string, params: Record<string, string> = {}) => {
    const q = new URLSearchParams(params).toString();
    return get<Ranking>(`/stats/variables/${variableId}/ranking/${q ? `?${q}` : ""}`);
  },
  growth: (variableId: string, params: Record<string, string> = {}) => {
    const q = new URLSearchParams(params).toString();
    return get<Growth>(`/stats/variables/${variableId}/growth/${q ? `?${q}` : ""}`);
  },
  correlate: (params: Record<string, string>) => {
    const q = new URLSearchParams(params).toString();
    return get<Correlation>(`/stats/correlate/?${q}`);
  },
  trend: (variableId: string, params: Record<string, string> = {}) => {
    const q = new URLSearchParams(params).toString();
    return get<Trend>(`/stats/variables/${variableId}/trend/${q ? `?${q}` : ""}`);
  },
};

// --- Kemendagri / Dukcapil source -----------------------------------------
// A separate data source from BPS (different region codes, different origin).
// Kept under its own `dukcapilApi` object and `/api/dukcapil/` paths so the
// two sources never get mixed up in the UI.

export type DukcapilLevel = "province" | "regency" | "district" | "village";

export const DUKCAPIL_LEVELS: { v: DukcapilLevel; label: string }[] = [
  { v: "province", label: "Provinsi" },
  { v: "regency", label: "Kabupaten/Kota" },
  { v: "district", label: "Kecamatan" },
  { v: "village", label: "Desa/Kelurahan" },
];

export type DukcapilSummary = {
  source: string;
  period: string | null;
  periods: string[];
  by_level: { level: DukcapilLevel; label: string; regions: number }[];
  national_totals: Record<string, number>;
  last_fetched_at: string | null;
};

export type DukcapilIndicator = {
  field: string;
  label_id: string;
  group: string;
  unit: string;
  is_string: boolean;
  sort: number;
  derived?: boolean;
};

export type DukcapilIndicatorGroups = {
  count: number;
  groups: { group: string; indicators: DukcapilIndicator[] }[];
};

export type DukcapilRegionRow = {
  code: string;
  level: DukcapilLevel;
  name: string;
  status: string;
  parent_code: string;
  parent_name: string | null;
};

// "Kota Bogor" / "Kab. Bogor" / "Bogor" — keeps the Kota vs Kabupaten
// distinction visible; other levels show the plain name.
export function regionLabel(name: string, status?: string): string {
  if (status === "Kota") return `Kota ${name}`;
  if (status === "Kabupaten") return `Kab. ${name}`;
  if (status === "Kota Administrasi") return `Kota Adm. ${name}`;
  if (status === "Kabupaten Administrasi") return `Kab. Adm. ${name}`;
  if (status === "Kelurahan") return `Kel. ${name}`;
  if (status === "Desa") return `Desa ${name}`;
  // Regional village designations (Aceh / Sumatera Barat / Papua / Maluku) —
  // used as their own prefix, same as "Desa X".
  if (status === "Gampong") return `Gampong ${name}`;
  if (status === "Kute") return `Kute ${name}`;
  if (status === "Nagari") return `Nagari ${name}`;
  if (status === "Kampung") return `Kampung ${name}`;
  if (status === "Kampung Adat") return `Kampung Adat ${name}`;
  if (status === "Negeri") return `Negeri ${name}`;
  if (status === "Ohoi") return `Ohoi ${name}`;
  // Provinces (incl. Daerah Istimewa/Khusus) and districts (Kecamatan/Distrik/
  // Kapanewon/Kemantren) show as the plain name in rankings/maps; their status
  // is a detail-page badge, not a prefix.
  return name;
}

// Deterministic distinct-ish colour for a grouping key (e.g. a province or
// kabupaten code) — used to colour ranking bars / scatter points by ancestor.
export function groupColor(key: string): string {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `hsl(${Math.abs(h) % 360}, 52%, 45%)`;
}

const _KEEP_UPPER = new Set(["DKI", "DIY", "DI"]);
// Title-case a raw UPPERCASE name (for geojson fallbacks / breadcrumb scope).
export function titleCase(s: string): string {
  return (s || "")
    .split(" ")
    .map((w) =>
      _KEEP_UPPER.has(w.toUpperCase())
        ? w.toUpperCase()
        : w.replace(/[A-Za-z']+/g, (m) => m[0].toUpperCase() + m.slice(1).toLowerCase())
    )
    .join(" ");
}

export type DukcapilRank = {
  indicator: DukcapilIndicator;
  level: DukcapilLevel;
  scope: Record<string, string>;
  order: string;
  percent_of: string | null;
  unit: string;
  stats: { count: number; min: number | null; max: number | null; mean: number | null; median: number | null };
  total: number;
  offset: number;
  results: DukcapilRankRow[];
};

export type DukcapilRankRow = {
  domain_id: string;
  domain_name: string;
  status: string;
  value: number;
  rank: number;
  // Denormalized ancestor names (present per level; empty where not applicable).
  nama_prop?: string;
  nama_kab?: string;
  nama_kec?: string;
  // For small-ratio derived indicators (e.g. density), the labelled operand
  // values behind the number (population, area) for the tooltip.
  components?: { field: string; value: number; label: string; unit: string }[];
};

/** One-line "Penduduk: 12,345 · Luas Wilayah (BIG): 0.42 km²" for a ratio's
 * operands, or undefined when there are none. */
export function componentsText(
  components?: { value: number; label: string; unit: string }[]
): string | undefined {
  if (!components?.length) return undefined;
  return components
    .map((c) => `${c.label}: ${formatNumber(c.value)}${c.unit ? ` ${c.unit}` : ""}`)
    .join(" · ");
}

export type DukcapilRegionDetail = {
  region: {
    code: string;
    level: DukcapilLevel;
    name: string;
    status: string;
    parent_code: string;
    parent_name: string | null;
    nama_prop: string;
    nama_kab: string;
    nama_kec: string;
  };
  peer_scope: string;
  groups: {
    group: string;
    indicators: {
      field: string;
      label_id: string;
      unit: string;
      value: number;
      rank: number | null;
      of: number;
      percentile: number | null;
      derived?: boolean;
    }[];
  }[];
};

export type DukcapilCorrelation = {
  x: DukcapilIndicator;
  y: DukcapilIndicator;
  level: DukcapilLevel;
  n: number;
  r: number | null;
  results: { domain_id: string; domain_name: string; status?: string; x: number; y: number }[];
};

export type RegencyCrosswalk = {
  bps_domain_id: string;
  kemendagri_code: string;
  prov_code: string;
  prov_name: string;
};

export type DukcapilBridge = {
  bps_domain_id: string;
  dukcapil:
    | { code: string; name: string; status: string; population: number | null; district_count: number; village_count: number }
    | null;
  districts: { code: string; name: string; status: string; population: number | null; village_count: number }[];
};

// BPS regency domain_id encodes Kota vs Kabupaten the same way as Dukcapil:
// the kab-number (3rd-4th digit) >= 71 means Kota.
export function bpsRegencyStatus(domainId: string): string {
  const kab = parseInt(domainId.slice(2, 4), 10);
  return isNaN(kab) ? "" : kab >= 71 ? "Kota" : "Kabupaten";
}

// A BPS regency's display name with a Kota/Kab. prefix derived from its code —
// so "Tangerang" disambiguates into "Kota Tangerang" vs "Kab. Tangerang". Any
// prefix already in the source name is stripped first to avoid doubling.
export function bpsRegionLabel(name: string, domainId: string): string {
  const stripped = name.replace(/^(Kota|Kabupaten|Kab\.?)\s+/i, "");
  return regionLabel(stripped, bpsRegencyStatus(domainId));
}

// DKI Jakarta's administrative cities/regency, by code — so an ancestry label
// is consistent ("Kota Adm. Jakarta Barat") regardless of how the raw nama_kab
// is spelled in each layer (kecamatan says "KOTA JAKARTA BARAT", desa says
// "KOTA ADM. JAKARTA BARAT").
const JKT_KOTA: Record<string, string> = {
  "3171": "Jakarta Pusat", "3172": "Jakarta Utara", "3173": "Jakarta Barat",
  "3174": "Jakarta Selatan", "3175": "Jakarta Timur",
};

// Kecamatan / Distrik / Kapanewon / Kemantren from a 6-digit code (mirrors the
// backend dukcapil.normalize rules): Distrik across Papua (prov 91-96);
// Kemantren in Kota Yogyakarta (3471), Kapanewon elsewhere in DIY (prov 34).
function districtStatusFromCode(code: string): string {
  const prov = code.slice(0, 2);
  const kab = code.slice(0, 4);
  if (["91", "92", "93", "94", "95", "96"].includes(prov)) return "Distrik";
  if (prov === "34") return kab === "3471" ? "Kemantren" : "Kapanewon";
  return "Kecamatan";
}
const KEC_PREFIX: Record<string, string> = {
  Kecamatan: "Kec.", Distrik: "Distrik", Kapanewon: "Kapanewon", Kemantren: "Kemantren",
};

// Label a kabupaten/kota ancestor from a (kec/desa) code + raw nama_kab. DKI is
// resolved canonically by code; elsewhere the source `nama_kab` is inconsistent
// — some already carry the "KOTA"/"KABUPATEN" prefix, others don't — so only add
// a Kota/Kab. prefix (from the kab-number) when it isn't already there.
function kabAncestorLabel(code: string, namaKab: string): string {
  const kab = code.slice(0, 4);
  if (JKT_KOTA[kab]) return `Kota Adm. ${JKT_KOTA[kab]}`;
  if (kab === "3101") return "Kab. Adm. Kepulauan Seribu";
  const upper = namaKab.trim().toUpperCase();
  const t = titleCase(namaKab);
  if (upper.startsWith("KOTA") || upper.startsWith("KAB")) return t;
  return regionLabel(t, bpsRegencyStatus(code));
}

// Label a kecamatan ancestor from a (kec/desa) code + raw nama_kec, using the
// right term per region (Kec./Distrik/Kapanewon/Kemantren) and stripping any
// prefix already present in the source name.
function kecAncestorLabel(code: string, namaKec: string): string {
  const status = districtStatusFromCode(code.slice(0, 6));
  const t = titleCase(namaKec).replace(/^(Kecamatan|Kec\.?|Distrik|Kapanewon|Kemantren)\s+/i, "");
  return `${KEC_PREFIX[status]} ${t}`;
}

// The administrative ancestry of a ranked/mapped Dukcapil region, most-specific
// first: kab -> "Provinsi"; kec -> "Kab. X · Provinsi"; desa -> "Kec. Y · Kab. X
// · Provinsi". The code (digits 3-4 for kab, 5-6 for kec) gives the right
// Kota/Kab./Distrik label even from a kec/desa code. "" for provinces.
export function dukcapilAncestry(
  level: DukcapilLevel,
  row: { domain_id: string; nama_prop?: string; nama_kab?: string; nama_kec?: string }
): string {
  const prov = row.nama_prop ? titleCase(row.nama_prop) : "";
  const kab = row.nama_kab ? kabAncestorLabel(row.domain_id, row.nama_kab) : "";
  const kec = row.nama_kec ? kecAncestorLabel(row.domain_id, row.nama_kec) : "";
  const parts =
    level === "regency" ? [prov] : level === "district" ? [kab, prov] : level === "village" ? [kec, kab, prov] : [];
  return parts.filter(Boolean).join(" · ");
}

export const dukcapilApi = {
  summary: () => get<DukcapilSummary>("/dukcapil/summary/"),
  regencyBridge: (domainId: string) => get<DukcapilBridge>(`/dukcapil/regency-bridge/${domainId}/`),
  regencyCrosswalk: () =>
    get<{ count: number; results: RegencyCrosswalk[] }>("/dukcapil/regency-crosswalk/"),
  indicators: () => get<DukcapilIndicatorGroups>("/dukcapil/indicators/"),
  regions: (params: Record<string, string> = {}) => {
    const q = new URLSearchParams(params).toString();
    return get<DukcapilRegionRow[]>(`/dukcapil/regions/${q ? `?${q}` : ""}`);
  },
  regionDetail: (code: string) => get<DukcapilRegionDetail>(`/dukcapil/regions/${code}/`),
  // Same profile for a BPS regency, resolved server-side (no bridge hop first).
  regionDetailByBps: (bpsDomainId: string) =>
    get<DukcapilRegionDetail & { bps_domain_id: string }>(`/dukcapil/regions/bps/${bpsDomainId}/`),
  rank: (params: Record<string, string> = {}) => {
    const q = new URLSearchParams(params).toString();
    return get<DukcapilRank>(`/dukcapil/rank/${q ? `?${q}` : ""}`);
  },
  correlate: (params: Record<string, string>) => {
    const q = new URLSearchParams(params).toString();
    return get<DukcapilCorrelation>(`/dukcapil/correlate/?${q}`);
  },
};

// --- DJPK / SIKD source (regional finance: APBD / PAD) --------------------
//
// Kept under its own `djpkApi` object and `/api/djpk/` paths, source-separated
// from BPS and Dukcapil. DJPK numbers regions with its own codes (djpk_code);
// `kemendagri_code` on each row bridges to the Dukcapil/BPS geography.

export type DjpkMeasure = "realisasi" | "anggaran" | "persentase";
export type DjpkReportType = "apbd" | "realisasi";
export type DjpkRegionLevel = "province" | "regency";

export const DJPK_LEVELS: { v: DjpkRegionLevel; label: string }[] = [
  { v: "province", label: "Provinsi" },
  { v: "regency", label: "Kabupaten/Kota" },
];

export type DjpkScope = { tahun: number; type: DjpkReportType; periode: number };

export type DjpkSummary = {
  source: string;
  scope: DjpkScope;
  years: number[];
  types: DjpkReportType[];
  scopes: { tahun: number; report_type: DjpkReportType; periode: number }[];
  by_level: { level: DjpkRegionLevel; label: string; regions: number }[];
  national_totals: Record<string, number>;
  last_fetched_at: string | null;
};

export type DjpkAccount = {
  akun_key: string;
  label_id: string;
  group: string;
  parent_key: string;
  sort?: number;
  unit?: string;
  desc?: string;
  derived?: boolean;
};

export type DjpkAccountGroups = {
  count: number;
  groups: { group: string; accounts: DjpkAccount[] }[];
};

export type DjpkRegionRow = {
  djpk_code: string;
  djpk_prov: string;
  djpk_pemda: string;
  level: DjpkRegionLevel;
  name: string;
  prov_name: string;
  kemendagri_code: string;
  match_method: string;
};

export type DjpkRankRow = {
  domain_id: string;
  domain_name: string;
  kemendagri_code?: string;
  value: number;
  rank: number;
};

export type DjpkRank = {
  account: DjpkAccount;
  measure: DjpkMeasure;
  level: DjpkRegionLevel;
  prov: string | null;
  scope: DjpkScope;
  order: string;
  unit: string;
  stats: { count: number; min: number | null; max: number | null; mean: number | null; median: number | null };
  total: number;
  offset: number;
  results: DjpkRankRow[];
};

export type DjpkGrowthRow = {
  domain_id: string;
  domain_name: string;
  value_from: number;
  value_to: number;
  change: number;
  change_pct: number | null;
  rank: number;
};

export type DjpkGrowth = {
  account: DjpkAccount;
  measure: DjpkMeasure;
  level: DjpkRegionLevel;
  unit?: string;
  from: number;
  to: number;
  total: number;
  results: DjpkGrowthRow[];
};

export type DjpkRatio = {
  akun_key: string;
  label_id: string;
  unit: string;
  desc: string;
  value: number;
  rank: number | null;
  of: number | null;
  percentile: number | null;
};

export type DjpkLine = {
  line_index: number;
  akun: string;
  akun_key: string;
  label_id: string;
  parent_key: string;
  anggaran: number | null;
  realisasi: number | null;
  persentase: number | null;
  rank: number | null;
  of: number | null;
  percentile: number | null;
};

export type DjpkRegionDetail = {
  region: DjpkRegionRow;
  scope: DjpkScope;
  peer_scope: string;
  fetched_at: string;
  groups: { group: string; lines: DjpkLine[] }[];
  ratios: DjpkRatio[];
};

// Typed rather than Record<string,string>: the scope param is `tahun`, and an
// unrecognized key (e.g. `year`) is silently DROPPED by the endpoint, which
// falls back to the latest scope. That failure is invisible — it returns a
// full, plausible payload for the wrong year — so the param names are pinned
// here to make a typo a compile error instead.
export type DjpkRankParams = {
  akun: string;
  level?: DjpkRegionLevel;
  measure?: DjpkMeasure;
  prov?: string;
  // Kemendagri province code; the API maps it to DJPK's numbering.
  kemendagri_prov?: string;
  tahun?: string;
  type?: DjpkReportType;
  periode?: string;
  order?: "asc" | "desc";
  limit?: string;
  offset?: string;
};

export const djpkApi = {
  summary: (params: Record<string, string> = {}) => {
    const q = new URLSearchParams(params).toString();
    return get<DjpkSummary>(`/djpk/summary/${q ? `?${q}` : ""}`);
  },
  accounts: () => get<DjpkAccountGroups>("/djpk/accounts/"),
  regions: (params: Record<string, string> = {}) => {
    const q = new URLSearchParams(params).toString();
    return get<DjpkRegionRow[]>(`/djpk/regions/${q ? `?${q}` : ""}`);
  },
  regionDetail: (code: string, params: Record<string, string> = {}) => {
    const q = new URLSearchParams(params).toString();
    return get<DjpkRegionDetail>(`/djpk/regions/${code}/${q ? `?${q}` : ""}`);
  },
  rank: (params: DjpkRankParams) => {
    const q = new URLSearchParams(params as Record<string, string>).toString();
    return get<DjpkRank>(`/djpk/rank/${q ? `?${q}` : ""}`);
  },
  correlate: (params: Record<string, string>) => {
    const q = new URLSearchParams(params).toString();
    return get<{ x: DjpkAccount; y: DjpkAccount; x_unit: string; y_unit: string; n: number; r: number | null; results: { domain_id: string; domain_name: string; x: number; y: number }[] }>(`/djpk/correlate/?${q}`);
  },
  growth: (params: Record<string, string> = {}) => {
    const q = new URLSearchParams(params).toString();
    return get<DjpkGrowth>(`/djpk/growth/${q ? `?${q}` : ""}`);
  },
};

export function formatNumber(n: number | null | undefined): string {
  if (n === null || n === undefined) return "–";
  return n.toLocaleString("id-ID");
}

/** Indonesian decimal formatting: fixed `digits` decimals with a comma (1,5 not 1.5). */
export function formatDecimal(n: number | null | undefined, digits = 1): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "–";
  return n.toLocaleString("id-ID", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/** Compact Indonesian magnitude for tiles and chart labels: 284,97 juta · 1,2 rb. */
export function formatCompact(n: number | null | undefined): string {
  if (n === null || n === undefined) return "–";
  const a = Math.abs(n);
  const f = (v: number, d: number) => v.toLocaleString("id-ID", { maximumFractionDigits: d });
  if (a >= 1e12) return `${f(n / 1e12, 2)} T`;
  if (a >= 1e9) return `${f(n / 1e9, 2)} M`;
  if (a >= 1e6) return `${f(n / 1e6, 2)} juta`;
  if (a >= 1e4) return `${f(n / 1e3, 1)} rb`;
  return f(n, 2);
}

// Compact rupiah for finance figures: triliun / miliar / juta. DJPK values are
// in whole rupiah, so most regional totals land in the miliar–triliun range.
export function formatRupiah(n: number | null | undefined): string {
  if (n === null || n === undefined) return "–";
  const abs = Math.abs(n);
  if (abs >= 1e12) return `Rp ${(n / 1e12).toLocaleString("id-ID", { maximumFractionDigits: 2 })} T`;
  if (abs >= 1e9) return `Rp ${(n / 1e9).toLocaleString("id-ID", { maximumFractionDigits: 2 })} M`;
  if (abs >= 1e6) return `Rp ${(n / 1e6).toLocaleString("id-ID", { maximumFractionDigits: 1 })} jt`;
  return `Rp ${n.toLocaleString("id-ID")}`;
}

// Format a DJPK value by its response unit: "%" for ratios / % serapan, else
// compact rupiah. Keeps derived ratios and rupiah accounts rendering correctly
// from a single source of truth (the endpoint's `unit`).
export function formatByUnit(n: number | null | undefined, unit: string | undefined): string {
  if (n === null || n === undefined) return "–";
  if (unit === "%") return `${n.toLocaleString("id-ID", { maximumFractionDigits: 1 })}%`;
  return formatRupiah(n);
}

// Categorical palette for chart series — sea-blue-led. Slot 1 is a CSS variable
// so it lightens on the dark theme; the rest are mid-tones that clear 3:1 on both
// the cream panel and the dark sea panel. Fixed slot order is the CVD-safety
// mechanism: assign in sequence, never cycle past 8 — fold extras into "Lainnya".
export const SERIES_COLORS = [
  "rgb(var(--series-1))", // sea blue (brand)
  "#B98222", // kunyit (turmeric)
  "#0C8FA6", // teal
  "#C0392B", // red
  "#7C3AED", // purple
  "#15803D", // green
  "#5B8DEF", // light sea blue
  "#92400E", // brown
];

// Recharts props can't read Tailwind classes, but SVG attributes and inline
// styles do resolve CSS variables — so charts follow the theme (incl. dark).
export const CHART = {
  axisTick: "rgb(var(--ink-muted))",
  axisLine: "rgb(var(--ink-border-strong))",
  grid: "rgb(var(--ink-panel3))",
  cursor: "rgb(var(--ink-panel2))",
  tooltipBg: "rgb(var(--ink-panel))",
  tooltipBorder: "rgb(var(--ink-border))",
  text: "rgb(var(--ink-text))",
  accent: "rgb(var(--series-1))", // series slot 1 — single-series marks match the palette
  neutral: "rgb(var(--ink-faint))", // the "Lainnya"/other bucket, never a series slot
  good: "rgb(var(--ink-good))",
  bad: "rgb(var(--ink-bad))",
};

// Rank/percentile colour ramp: green (high) → amber (mid) → red (low).
export const PCT_COLOR = (p: number): string => (p >= 66 ? CHART.good : p >= 33 ? "rgb(var(--ink-warn))" : CHART.bad);

// --- global search (⌘K palette) ----------------------------------------------

export type SearchRegionHit = {
  source: "bps" | "dukcapil";
  code: string;
  name: string;
  level: string;
  label: string; // Provinsi / Kota / Kabupaten / Kecamatan / Desa / Kelurahan …
  context: string; // parent chain, e.g. "Jakarta Timur · DKI Jakarta"
};
export type SearchVariableHit = {
  source: "bps";
  code: string;
  name: string;
  unit: string;
  context: string; // BPS subject category
  years: [number | null, number | null];
};
export type SearchResults = {
  q: string;
  regions: SearchRegionHit[];
  subregions: SearchRegionHit[];
  variables: SearchVariableHit[];
};

export const searchApi = {
  search: (q: string) => get<SearchResults>(`/search/?q=${encodeURIComponent(q)}`),
};

// --- Peta Wilayah (terrain & land cover, Kemendagri-keyed) -------------------

export type PetaIndicatorRank = {
  key: string;
  label: string;
  group: string;
  unit: string;
  value: number;
  rank: number | null;
  of: number;
  percentile: number | null;
};

export type PetaRegionRanks = {
  region: { code: string; level: string; name: string; prov_code: string; parent_code: string };
  peer_scope: string;
  indicators: PetaIndicatorRank[];
};

export const petaApi = {
  region: (code: string) => get<PetaRegionRanks>(`/peta/regions/${code}/`),
};

// --- carousel packs (api.carousel) -------------------------------------------

export type CarouselMapValue = {
  geo: string; // Kemendagri code
  code: string; // the source's own code
  label: string;
  value: number;
  display: string; // formatted by the backend, same string the deck uses
  rank: number; // 1 = highest
};

export type CarouselPackResult = {
  pack: {
    format: "carousel-data/1";
    id: string;
    metric: string;
    unit: string;
    period: string;
    level: "provinsi" | "kabupaten" | "kecamatan";
    source: string;
    notes: string;
    rows: { label: string; code: string; value: number }[];
  };
  provenance: { source: "bps" | "dukcapil" | "djpk" } & Record<string, unknown>;
  map: {
    level: "provinsi" | "kabupaten" | "kecamatan";
    prov: string;
    prov_name: string;
    title: string;
    kicker: string;
    period_label: string;
    n: number;
    expected: number;
    min: number;
    max: number;
    values: CarouselMapValue[];
    unmatched: { code: string; label: string }[];
  };
};

export type CarouselDeckResult = CarouselPackResult & {
  deck: string;
  readme: string;
  cards: { file: string; path: string }[];
  warnings: string[];
  carousel_press_url: string; // opens the deck in Carousel Press (#deck=base64url)
};

/** Pack/deck requests. A refusal (422) rejects with the backend's reason. */
async function carouselGet<T>(path: string, query: string): Promise<T> {
  const res = await fetch(`${API_BASE}/api/carousel/${path}/?${query}`);
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error ?? `API carousel/${path} -> ${res.status}`);
  return body as T;
}

export const carouselApi = {
  pack: (query: string) => carouselGet<CarouselPackResult>("pack", query),
  deck: (query: string) => carouselGet<CarouselDeckResult>("deck", query),
};
