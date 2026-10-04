import type { Metadata } from "next";
import { JetBrains_Mono, Newsreader, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { MobileNav, Topbar } from "@/components/Topbar";
import { Footer } from "@/components/Footer";
import { CommandPalette } from "@/components/CommandPalette";

import { THEME_BOOT_SCRIPT } from "@/lib/theme";

// UI + numbers: Plus Jakarta Sans (Tokotype, designed for Jakarta's identity).
const sans = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
// Headlines + Sorotan reading body: Newsreader, a news serif with an optical-size
// axis (sharp at 64px, open at 19px). Variable: weights come from CSS.
const display = Newsreader({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
  style: ["normal", "italic"],
  axes: ["opsz"],
  // next/font ships no fallback metrics for Newsreader; skip the (failing)
  // size-adjusted fallback instead of logging an error on every build.
  adjustFontFallback: false,
});
// Region codes, source URLs, hashes, eyebrow labels.
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" });

export const metadata: Metadata = {
  title: "NusaStats — Penjelajah Data BPS & Dukcapil",
  description: "Jelajahi dan analisis statistik Indonesia dari BPS WebAPI dan data administrasi kependudukan Dukcapil.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" className={`${sans.variable} ${display.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body className="min-h-screen bg-noise font-sans antialiased">
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
      </body>
    </html>
  );
}
