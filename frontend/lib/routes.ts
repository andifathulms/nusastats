// Single source of truth for in-app URLs, so a route rename touches one file.
export const routes = {
  home: "/",
  explore: "/regions",
  region: (code: string) => `/regions/${code}`,
  sorotan: "/sorotan",
  post: (slug: string) => `/sorotan/${slug}`,
  variables: "/variables",
  variable: (id: string) => `/variables/${id}`,
  dukcapil: "/dukcapil",
  keuangan: "/keuangan",
};
