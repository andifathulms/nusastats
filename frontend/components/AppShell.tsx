"use client";

import { usePathname } from "next/navigation";
import { MobileNav, Topbar } from "@/components/Topbar";
import { Footer } from "@/components/Footer";
import { CommandPalette } from "@/components/CommandPalette";

/**
 * The site chrome (top bar, footer, mobile nav, ⌘K) around every page — except
 * the share cards under /card/*, which must render as a bare, exact-size canvas
 * for the PNG exporter (scripts/card).
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const bare = usePathname()?.startsWith("/card/");
  if (bare) return <>{children}</>;
  return (
    <>
      {/* Offscreen until focused: otherwise every page costs a keyboard user
          8+ tabs through the nav before reaching the content. */}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-ink-accent focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-ink-onAccent"
      >
        Lewati ke konten
      </a>
      <div className="flex min-h-screen flex-col">
        <Topbar />
        <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-5 lg:px-8">
          {children}
        </main>
        <Footer />
      </div>
      <MobileNav />
      <CommandPalette />
    </>
  );
}
