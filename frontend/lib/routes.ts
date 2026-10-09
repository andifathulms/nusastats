import { kemendagriProvinceToBps } from "./provinces";

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
  carousel: "/carousel",
};

// Dukcapil province code (2-digit, 38 provinces) -> the region page. All 38
// now have a BPS domain, including the four 2022 Papua provinces, but Papua's
// codes differ between the systems (see lib/provinces).
export function provinceHref(dukCode: string): string {
  return routes.region(kemendagriProvinceToBps(dukCode));
}
