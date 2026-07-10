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
  return name;
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
  results: { domain_id: string; domain_name: string; status: string; value: number; rank: number }[];
};

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

export const dukcapilApi = {
  summary: () => get<DukcapilSummary>("/dukcapil/summary/"),
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

// Categorical palette for chart series — validated for CVD-safe adjacency on the dark panel surface.
export const SERIES_COLORS = [
  "#a8602e", // brown (brand)
  "#2f5fa8", // steel blue (brand navy family)
  "#3f7d34", // sage
  "#b9860b", // gold
  "#8b3fa3", // plum
  "#00897b", // teal
  "#b6473f", // rust red
  "#b23e72", // rose
];
