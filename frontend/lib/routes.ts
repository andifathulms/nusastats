// Single source of truth for in-app URLs, so a route rename touches one file.
export const routes = {
  home: "/",
  explore: "/jelajahi",
  region: (code: string) => `/jelajahi/${code}`,
  sorotan: "/sorotan",
  post: (slug: string) => `/sorotan/${slug}`,
  variables: "/variables",
  variable: (id: string) => `/variables/${id}`,
  dukcapil: "/dukcapil",
  keuangan: "/keuangan",
};

// Dukcapil province code (2-digit, 38 provinces) -> the region page. BPS still
// publishes the pre-2022 Papua split (9100 Papua Barat, 9400 Papua), so those
// two map to their BPS domain; the four newer Papua provinces exist only in
// Dukcapil and open the Dukcapil-only profile.
const BPS_PROVINCE_OVERRIDE: Record<string, string> = { "91": "9400", "92": "9100" };
const DUKCAPIL_ONLY_PROVINCES = new Set(["93", "94", "95", "96"]);

export function provinceHref(dukCode: string): string {
  if (DUKCAPIL_ONLY_PROVINCES.has(dukCode)) return routes.region(dukCode);
  return routes.region(BPS_PROVINCE_OVERRIDE[dukCode] ?? `${dukCode}00`);
}
