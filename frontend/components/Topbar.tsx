"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = { href: string; label: string };
type NavSection = {
  key: string;
  label: string;
  icon: (p: { className?: string }) => JSX.Element;
  home: string;
  match: (path: string) => boolean;
  items: NavItem[];
};

const NAV: NavSection[] = [
  {
    key: "beranda",
    label: "Beranda",
    icon: HomeIcon,
    home: "/",
    match: (p) => p === "/",
    items: [],
  },
  {
    key: "wilayah",
    label: "Wilayah",
    icon: MapPinIcon,
    home: "/regions",
    match: (p) => p === "/regions" || p.startsWith("/regions/"),
    items: [],
  },
  {
    key: "bps",
    label: "BPS",
    icon: LayersIcon,
    home: "/variables",
    match: (p) => /^\/(variables|analytics)(\/|$)/.test(p),
    items: [
      { href: "/variables", label: "Variabel" },
      { href: "/analytics", label: "Analitik" },
    ],
  },
  {
    key: "dukcapil",
    label: "Dukcapil",
    icon: UsersIcon,
    home: "/dukcapil",
    match: (p) => p === "/dukcapil" || p.startsWith("/dukcapil/"),
    items: [
      { href: "/dukcapil", label: "Ringkasan" },
      { href: "/dukcapil/analytics", label: "Analitik" },
    ],
  },
];

function isItemActive(href: string, pathname: string): boolean {
  // Section-root items (exact match) vs deeper items (prefix match).
  if (href === "/dukcapil" || href === "/variables" || href === "/analytics") {
    return pathname === href;
  }
  return pathname === href || pathname.startsWith(href + "/");
}

export function Topbar() {
  const pathname = usePathname() || "/";
  const active = NAV.find((s) => s.match(pathname)) ?? NAV[0];

  return (
    <header className="sticky top-0 z-30 shadow-header">
      {/* Row 1 — dark royal navy: brand + source switcher */}
      <div className="relative border-b border-coal-border/70 bg-coal-bg">
        <div className="pointer-events-none absolute inset-0 bg-royal-weave opacity-70" />
        <div className="relative mx-auto flex h-16 max-w-7xl items-center gap-4 px-5 lg:px-8">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-gradient text-sm font-bold text-white shadow-glow ring-1 ring-white/10">
              N
            </span>
            <span className="hidden text-[16px] font-semibold tracking-tight text-coal-text sm:inline">
              Nusa<span className="bg-brand-gradient-onDark bg-clip-text text-transparent">Stats</span>
            </span>
          </Link>

          <div className="mx-1 hidden h-6 w-px bg-coal-border/60 sm:block" />

          <nav className="flex items-center gap-1 overflow-x-auto scroll-thin">
            {NAV.map((s) => {
              const on = s.key === active.key;
              return (
                <Link
                  key={s.key}
                  href={s.home}
                  className={`flex shrink-0 items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors ${
                    on
                      ? "bg-brand-gradient text-white shadow-glow ring-1 ring-white/10"
                      : "text-coal-muted hover:bg-coal-hover/60 hover:text-coal-text"
                  }`}
                >
                  <s.icon className="h-4 w-4 shrink-0" />
                  {s.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Row 2 — light strip: sub-nav for the active section (hidden when none) */}
      {active.items.length > 0 && (
        <div className="border-b border-ink-border bg-ink-panel/95 backdrop-blur">
          <div className="mx-auto flex max-w-7xl items-center gap-1 overflow-x-auto scroll-thin px-5 lg:px-8">
            {active.items.map((item) => {
              const on = isItemActive(item.href, pathname);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`-mb-px shrink-0 border-b-2 px-3.5 py-3 text-sm font-medium transition-colors ${
                    on
                      ? "border-ink-accent text-ink-accent"
                      : "border-transparent text-ink-muted hover:text-ink-text"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </header>
  );
}

function HomeIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M4 11.5 12 4l8 7.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6 10v9a1 1 0 0 0 1 1h3v-6h4v6h3a1 1 0 0 0 1-1v-9" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function LayersIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M12 3 3 8l9 5 9-5-9-5Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="m3 12 9 5 9-5M3 16l9 5 9-5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function MapPinIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path
        d="M12 21s7-6.1 7-11.5A7 7 0 0 0 5 9.5C5 14.9 12 21 12 21Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="9.5" r="2.4" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

function UsersIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="9" cy="8" r="3" stroke="currentColor" strokeWidth="1.7" />
      <path d="M3.5 19a5.5 5.5 0 0 1 11 0" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M16 6.2a3 3 0 0 1 0 5.6M17.5 19a5.5 5.5 0 0 0-2.7-4.7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}
