import type { Metadata } from "next";
import { Inter, Fraunces } from "next/font/google";
import "./globals.css";
import { Topbar } from "@/components/Topbar";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
// Elegant modern serif for major headings — a controlled editorial accent.
// Variable font: weights come from CSS (font-medium/semibold), so no `weight` pin.
const display = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

export const metadata: Metadata = {
  title: "NusaStats — Penjelajah Data BPS & Dukcapil",
  description: "Jelajahi dan analisis statistik Indonesia dari BPS WebAPI dan data administrasi kependudukan Dukcapil.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" className={`${inter.variable} ${display.variable}`}>
      <body className="min-h-screen bg-noise font-sans antialiased">
        <div className="flex min-h-screen flex-col">
          <Topbar />
          <main className="mx-auto w-full max-w-7xl flex-1 px-5 py-8 lg:px-8">{children}</main>
        </div>
      </body>
    </html>
  );
}
