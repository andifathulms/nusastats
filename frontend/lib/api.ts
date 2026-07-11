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

export type Series = { variable_id: string; name: string; unit: string; count: number; results: DataPoint[] };

export type Ranking = {
  variable_id: string;
  name: string;
  unit: string;
  admin_level: string;
  year: number | null;
  turvar_id: string | null;
  stats: { count: number; min: number | null; max: number | null; mean: number | null; median: number | null };
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

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}/api${path}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`API ${path} -> ${res.status}`);
  return res.json();
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
  if (status === "Kelurahan") return `Kel. ${name}`;
  if (status === "Desa") return `Desa ${name}`;
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

// Label a kabupaten/kota ancestor. Source `nama_kab` is inconsistent — some
// already carry the "KOTA"/"KABUPATEN" prefix ("KOTA LANGSA"), others don't
// ("JAKARTA TIMUR"). Only add a Kota/Kab. prefix (derived from the kab-number
// in the code) when it isn't already there, to avoid "Kota Kota Langsa".
function kabAncestorLabel(code: string, namaKab: string): string {
  const upper = namaKab.trim().toUpperCase();
  const t = titleCase(namaKab);
  if (upper.startsWith("KOTA") || upper.startsWith("KAB")) return t;
  return regionLabel(t, bpsRegencyStatus(code));
}

// The administrative ancestry of a ranked/mapped Dukcapil region, most-specific
// first: kab -> "Provinsi"; kec -> "Kab. X · Provinsi"; desa -> "Kec. Y · Kab. X
// · Provinsi". The kab-number in the code (digits 3-4) gives the Kota/Kab. label
// even from a kec/desa code. Returns "" for provinces (no ancestry).
export function dukcapilAncestry(
  level: DukcapilLevel,
  row: { domain_id: string; nama_prop?: string; nama_kab?: string; nama_kec?: string }
): string {
  const prov = row.nama_prop ? titleCase(row.nama_prop) : "";
  const kab = row.nama_kab ? kabAncestorLabel(row.domain_id, row.nama_kab) : "";
  const kec = row.nama_kec ? (/^KEC/i.test(row.nama_kec.trim()) ? titleCase(row.nama_kec) : `Kec. ${titleCase(row.nama_kec)}`) : "";
  const parts =
    level === "regency" ? [prov] : level === "district" ? [kab, prov] : level === "village" ? [kec, kab, prov] : [];
  return parts.filter(Boolean).join(" · ");
}

export const dukcapilApi = {
  summary: () => get<DukcapilSummary>("/dukcapil/summary/"),
  regencyBridge: (domainId: string) => get<DukcapilBridge>(`/dukcapil/regency-bridge/${domainId}/`),
  indicators: () => get<DukcapilIndicatorGroups>("/dukcapil/indicators/"),
  regions: (params: Record<string, string> = {}) => {
    const q = new URLSearchParams(params).toString();
    return get<DukcapilRegionRow[]>(`/dukcapil/regions/${q ? `?${q}` : ""}`);
  },
  regionDetail: (code: string) => get<DukcapilRegionDetail>(`/dukcapil/regions/${code}/`),
  rank: (params: Record<string, string> = {}) => {
    const q = new URLSearchParams(params).toString();
    return get<DukcapilRank>(`/dukcapil/rank/${q ? `?${q}` : ""}`);
  },
  correlate: (params: Record<string, string>) => {
    const q = new URLSearchParams(params).toString();
    return get<DukcapilCorrelation>(`/dukcapil/correlate/?${q}`);
  },
};

export function formatNumber(n: number | null | undefined): string {
  if (n === null || n === undefined) return "–";
  return n.toLocaleString("en-US");
}

// Categorical palette for chart series — royal-blue-led, CVD-safe adjacency on the white panel surface.
export const SERIES_COLORS = [
  "#1E4585", // royal navy blue (brand)
  "#C49A48", // royal gold
  "#0E8F9C", // teal
  "#C0392B", // red
  "#7C3AED", // purple
  "#15803D", // green
  "#5B8DEF", // light royal blue (pair with a label/legend)
  "#92400E", // brown
];

// Central hex constants for Recharts (which can't read Tailwind tokens). Mirror the `ink.*`
// tokens — keep these in sync with tailwind.config.ts so charts never re-inline stray hexes.
export const CHART = {
  axisTick: "#5B6B8A", // ink.muted
  axisLine: "#AEB9D2", // ink.borderStrong
  grid: "#E4EAF4", // ink.panel3
  cursor: "#EEF2F9", // ink.panel2
  tooltipBg: "#FFFFFF", // ink.panel
  tooltipBorder: "#DBE1EE", // ink.border
  text: "#0D1B36", // ink.text
  accent: "#1E4585", // ink.accent (royal navy blue)
  good: "#15803D", // ink.good
  bad: "#DC2626", // ink.bad
};

// Rank/percentile colour ramp: green (high) → amber (mid) → red (low).
export const PCT_COLOR = (p: number): string => (p >= 66 ? CHART.good : p >= 33 ? "#B45309" : CHART.bad);
