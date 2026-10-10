import { Archivo } from "next/font/google";

// The /card/* routes are Nusantara Mapper's TikTok cards, with their own look
// ("Atlas Malam", see globals.css .nm-card): Archivo with its width axis, so
// titles and numbers can run narrow and sentences normal from one family.
const archivo = Archivo({ subsets: ["latin"], axes: ["wdth"], variable: "--font-archivo", display: "block" });

export default function CardLayout({ children }: { children: React.ReactNode }) {
  return <div className={archivo.variable}>{children}</div>;
}
