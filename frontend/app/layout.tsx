import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: "NusaStats — BPS Data Explorer",
  description: "Browse and analyze Indonesian statistics collected from the BPS WebAPI.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-screen bg-noise font-sans antialiased">
        <div className="flex min-h-screen">
          <Sidebar />
          <main className="mx-auto w-full max-w-7xl flex-1 px-5 py-8 lg:px-8">{children}</main>
        </div>
      </body>
    </html>
  );
}
