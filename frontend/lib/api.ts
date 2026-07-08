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
  ranking: (variableId: string, params: Record<string, string> = {}) => {
    const q = new URLSearchParams(params).toString();
    return get<Ranking>(`/stats/variables/${variableId}/ranking/${q ? `?${q}` : ""}`);
  },
  growth: (variableId: string, params: Record<string, string> = {}) => {
    const q = new URLSearchParams(params).toString();
    return get<Growth>(`/stats/variables/${variableId}/growth/${q ? `?${q}` : ""}`);
  },
};

export function formatNumber(n: number | null | undefined): string {
  if (n === null || n === undefined) return "–";
  return n.toLocaleString("en-US");
}

// Categorical palette for chart series — distinguishable in dark mode.
export const SERIES_COLORS = [
  "#5b8cff",
  "#4dd0a7",
  "#f2b34e",
  "#e5686f",
  "#a98bf0",
  "#4bb6d6",
  "#e089c4",
  "#8bc34a",
];
