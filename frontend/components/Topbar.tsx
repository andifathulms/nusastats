"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { openSearch, SearchIcon } from "@/components/CommandPalette";
import { ThemeToggle } from "@/components/ThemeToggle";

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
    key: "sorotan",
    label: "Sorotan",
    icon: SparkIcon,
    home: "/sorotan",
    match: (p) => p === "/sorotan" || p.startsWith("/sorotan/"),
    items: [],
  },
  {
    key: "wilayah",
    label: "Jelajahi",
    icon: MapPinIcon,
    home: "/jelajahi",
    match: (p) => p === "/jelajahi" || p.startsWith("/jelajahi/"),
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
  {
    key: "keuangan",
    label: "Keuangan",
    icon: WalletIcon,
    home: "/keuangan",
    match: (p) => p === "/keuangan" || p.startsWith("/keuangan/"),
    items: [
      { href: "/keuangan", label: "Ringkasan" },
      { href: "/keuangan/analytics", label: "Analitik" },
    ],
  },
];

function isItemActive(href: string, pathname: string): boolean {
  // Section-root items (exact match) vs deeper items (prefix match).
  if (href === "/dukcapil" || href === "/keuangan" || href === "/variables" || href === "/analytics") {
    return pathname === href;
  }
  return pathname === href || pathname.startsWith(href + "/");
}

export function Topbar() {
  const pathname = usePathname() || "/";
  const active = NAV.find((s) => s.match(pathname)) ?? NAV[0];

  return (
    <header className="sticky top-0 z-30">
      {/* Row 1 — cream paper bar: brand, sections, search, theme */}
      <div className="border-b border-ink-border bg-ink-bg/85 backdrop-blur-md supports-[backdrop-filter]:bg-ink-bg/75">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:px-5 lg:gap-5 lg:px-8">
          <Link href="/" aria-label="NusaStats — beranda" className="shrink-0">
            <Logo />
          </Link>

          <nav aria-label="Bagian utama" className="hidden items-center gap-0.5 md:flex">
            {NAV.map((s) => {
              const on = s.key === active.key;
              return (
                <Link
                  key={s.key}
                  href={s.home}
                  aria-current={on ? "page" : undefined}
                  className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[13.5px] font-semibold transition-colors lg:px-3.5 ${
                    on ? "bg-laut-950 text-kertas-200 dark:bg-ink-accent dark:text-ink-onAccent" : "text-ink-muted hover:bg-ink-panel2 hover:text-ink-text"
                  }`}
                >
                  <s.icon className="hidden h-4 w-4 shrink-0 xl:block" />
                  {s.label}
                </Link>
              );
            })}
          </nav>

          <button
            onClick={() => openSearch()}
            className="ml-auto flex h-10 min-w-0 items-center gap-2.5 rounded-full border border-ink-border bg-ink-panel px-3.5 text-sm text-ink-faint transition-colors hover:border-ink-borderStrong sm:w-64 lg:w-72"
            aria-label="Cari wilayah, indikator, atau analisis (⌘K)"
          >
            <SearchIcon className="h-4 w-4 shrink-0 text-ink-muted" />
            <span className="hidden truncate sm:inline">Cari wilayah, indikator…</span>
            <kbd className="ml-auto hidden rounded-md border border-ink-border bg-ink-panel2 px-1.5 py-0.5 font-mono text-[10.5px] text-ink-muted sm:block">
              ⌘K
            </kbd>
          </button>
          <ThemeToggle className="hidden sm:flex" />
        </div>
      </div>

      {/* Row 2 — sub-nav for the active section (hidden when none) */}
      {active.items.length > 0 && (
        <div className="border-b border-ink-border bg-ink-panel/90 backdrop-blur">
          {/* No overflow-x-auto here. Setting one axis to a non-visible value makes
              the other compute to `auto`, and the tabs' -mb-px (which laps the
              active underline over the divider) leaves the content 1px taller than
              the box — so the row grew a vertical scrollbar. This strip only ever
              holds two short items, so it never needs to scroll anyway. */}
          <div className="mx-auto flex max-w-7xl items-center gap-1 px-4 sm:px-5 lg:px-8">
            {active.items.map((item) => {
              const on = isItemActive(item.href, pathname);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={on ? "page" : undefined}
                  className={`-mb-px shrink-0 border-b-2 px-3.5 py-2.5 text-sm font-semibold transition-colors ${
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

/** Mark: three islands (one kunyit) on a sea-blue tile, plus the wordmark. */
export function Logo({ onDark = false, wordmark = "sm" }: { onDark?: boolean; wordmark?: "sm" | "always" }) {
  return (
    <span className="flex items-center gap-2.5">
      <span className="relative block h-9 w-9 shrink-0 rounded-[11px] bg-laut-700 shadow-glow ring-1 ring-white/10">
        <span className="absolute left-[7px] top-[19px] h-[9px] w-[9px] rounded-full bg-kertas-200" />
        <span className="absolute left-[16px] top-[13px] h-[7px] w-[7px] rounded-full bg-kunyit-light" />
        <span className="absolute left-[25px] top-[20px] h-[5px] w-[5px] rounded-full bg-kertas-200" />
      </span>
      <span className={`${wordmark === "always" ? "inline" : "hidden sm:inline"} text-[18px] font-extrabold tracking-[-0.02em] ${onDark ? "text-kertas-200" : "text-ink-text"}`}>
        Nusa<span className={onDark ? "text-laut-300" : "text-ink-accent"}>Stats</span>
      </span>
    </span>
  );
}

/** Bottom tab bar for phones — the four places people reach for with a thumb. */
export function MobileNav() {
  const pathname = usePathname() || "/";
  const active = NAV.find((s) => s.match(pathname)) ?? NAV[0];
  const tabs = [
    { key: "beranda", label: "Beranda", href: "/", icon: HomeIcon },
    { key: "wilayah", label: NAV.find((n) => n.key === "wilayah")!.label, href: NAV.find((n) => n.key === "wilayah")!.home, icon: MapPinIcon },
    { key: "sorotan", label: "Sorotan", href: "/sorotan", icon: SparkIcon },
    { key: "data", label: "Data", href: "/variables", icon: LayersIcon },
  ];
  const isOn = (k: string) => (k === "data" ? ["bps", "dukcapil", "keuangan"].includes(active.key) : active.key === k);
  return (
    <nav
      aria-label="Navigasi bawah"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-ink-border bg-ink-panel/95 backdrop-blur md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <div className="mx-auto grid h-16 max-w-md grid-cols-5">
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={t.href}
            aria-current={isOn(t.key) ? "page" : undefined}
            className={`flex flex-col items-center justify-center gap-1 text-[11px] font-semibold ${isOn(t.key) ? "text-ink-accent" : "text-ink-muted"}`}
          >
            <t.icon className="h-5 w-5" />
            {t.label}
          </Link>
        ))}
        <button onClick={() => openSearch()} className="flex flex-col items-center justify-center gap-1 text-[11px] font-semibold text-ink-muted">
          <SearchIcon className="h-5 w-5" />
          Cari
        </button>
      </div>
    </nav>
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

function SparkIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path
        d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path d="M18.5 15.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7.7-1.8Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
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

function WalletIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H17a2 2 0 0 1 2 2v0H5.5A2.5 2.5 0 0 1 3 4.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3 6v11a2 2 0 0 0 2 2h14a1 1 0 0 0 1-1V9a1 1 0 0 0-1-1H5" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <circle cx="16.5" cy="13" r="1.3" fill="currentColor" />
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
