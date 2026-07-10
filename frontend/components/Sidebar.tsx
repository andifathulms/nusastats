"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { NavLink } from "@/components/ui";

const NAV = [
  { href: "/", label: "Overview", icon: HomeIcon },
  { href: "/variables", label: "Variables", icon: LayersIcon },
  { href: "/regions", label: "Regions", icon: MapPinIcon },
  { href: "/analytics", label: "Analytics", icon: ChartIcon },
  { href: "/dukcapil", label: "Dukcapil", icon: UsersIcon },
];

const STORAGE_KEY = "nusastats.sidebar.collapsed";

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setCollapsed(localStorage.getItem(STORAGE_KEY) === "1");
    setReady(true);
  }, []);

  const toggle = () => {
    setCollapsed((c) => {
      const next = !c;
      localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      return next;
    });
  };

  return (
    <aside
      className={`sticky top-0 z-20 flex h-screen shrink-0 flex-col overflow-y-auto border-r border-coal-border bg-coal-bg ${
        ready ? "transition-[width] duration-200" : ""
      } ${collapsed ? "w-[68px]" : "w-60"}`}
    >
      <div className={`flex h-16 items-center gap-2 ${collapsed ? "justify-center px-2" : "px-6"}`}>
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-gradient text-sm font-bold text-white shadow-glow">
          N
        </span>
        {!collapsed && (
          <Link href="/" className="text-[15px] font-semibold tracking-tight text-coal-text">
            Nusa<span className="bg-brand-gradient-onDark bg-clip-text text-transparent">Stats</span>
          </Link>
        )}
      </div>
      <nav className={`flex-1 space-y-1 py-2 ${collapsed ? "px-2" : "px-3"}`}>
        {NAV.map((item) => (
          <NavLink key={item.href} href={item.href} collapsed={collapsed} title={item.label}>
            <item.icon className="h-4 w-4 shrink-0" />
            {!collapsed && item.label}
          </NavLink>
        ))}
      </nav>

      {!collapsed && (
        <div className="mx-3 mb-3 rounded-xl border border-coal-border bg-coal-bg2 p-3 text-xs leading-relaxed text-coal-muted">
          <div className="mb-1 flex items-center gap-1.5 font-medium text-coal-text">
            <span className="h-1.5 w-1.5 rounded-full bg-ink-good shadow-[0_0_8px_2px] shadow-ink-good/60" />
            Evidence-backed data
          </div>
          National + 34 provinces + 514 kabupaten/kota, fetched from the BPS WebAPI.
        </div>
      )}

      <button
        onClick={toggle}
        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        className="mx-3 mb-4 flex items-center justify-center gap-2 rounded-lg border border-coal-border bg-coal-bg2 py-2 text-coal-muted transition-colors hover:border-coal-muted/50 hover:text-coal-text"
      >
        <ChevronIcon className={`h-4 w-4 transition-transform ${collapsed ? "rotate-180" : ""}`} />
        {!collapsed && <span className="text-xs">Collapse</span>}
      </button>
    </aside>
  );
}

function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M14 6 8 12l6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
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

function ChartIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M4 20V10M11 20V4M18 20v-7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
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
