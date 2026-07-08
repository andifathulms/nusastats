import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "NusaStats — BPS Data Explorer",
  description: "Browse and analyze Indonesian statistics collected from the BPS WebAPI.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen font-sans antialiased">
        <header className="border-b border-ink-border bg-ink-panel/70 backdrop-blur sticky top-0 z-10">
          <div className="mx-auto max-w-7xl px-5 h-14 flex items-center gap-6">
            <Link href="/" className="font-semibold tracking-tight text-ink-text">
              Nusa<span className="text-ink-accent">Stats</span>
            </Link>
            <nav className="flex items-center gap-5 text-sm text-ink-muted">
              <Link href="/" className="hover:text-ink-text transition-colors">
                Overview
              </Link>
              <Link href="/variables" className="hover:text-ink-text transition-colors">
                Variables
              </Link>
              <Link href="/regions" className="hover:text-ink-text transition-colors">
                Regions
              </Link>
            </nav>
            <div className="ml-auto text-xs text-ink-muted">
              Data: BPS WebAPI · national + 34 provinces + 514 kabupaten/kota
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-5 py-8">{children}</main>
      </body>
    </html>
  );
}
