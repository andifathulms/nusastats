import Link from "next/link";
import { Logo } from "@/components/Topbar";
import { ThemeToggle } from "@/components/ThemeToggle";
import { routes } from "@/lib/routes";

const SOURCES = [
  { name: "Badan Pusat Statistik", note: "BPS WebAPI — indikator nasional, provinsi, kab/kota", href: "https://webapi.bps.go.id" },
  { name: "Ditjen Dukcapil, Kemendagri", note: "Administrasi kependudukan hingga desa/kelurahan", href: "https://gis.dukcapil.kemendagri.go.id" },
  { name: "Ditjen Perimbangan Keuangan, Kemenkeu", note: "Realisasi APBD & PAD (SIKD)", href: "https://djpk.kemenkeu.go.id" },
];

/** Deep-sea footer: sources and the provenance promise, shown on every page. */
export function Footer() {
  return (
    <footer className="mt-16 bg-coal-bg text-coal-muted">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-5 md:grid-cols-[1.1fr_1.6fr_0.8fr] lg:px-8">
        <div>
          <Logo onDark wordmark="always" />
          <p className="mt-4 max-w-sm text-sm leading-relaxed">
            Statistik Indonesia dari sumber resminya. Setiap angka menyimpan URL sumber, waktu pengambilan, dan sidik jari
            (SHA-256) respons aslinya.
          </p>
          <div className="mt-5 flex items-center gap-3 text-xs">
            <span>Tema</span>
            <ThemeToggle className="!border-coal-border !bg-coal-bg2" />
          </div>
        </div>
        <div>
          <div className="font-mono text-[11px] uppercase tracking-[0.1em] text-ink-gold">Sumber data</div>
          <ul className="mt-3 space-y-3">
            {SOURCES.map((s) => (
              <li key={s.name}>
                <a href={s.href} target="_blank" rel="noreferrer" className="font-semibold text-coal-text hover:underline">
                  {s.name}
                </a>
                <div className="text-sm">{s.note}</div>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <div className="font-mono text-[11px] uppercase tracking-[0.1em] text-ink-gold">Jelajahi</div>
          <ul className="mt-3 space-y-2 text-sm">
            <li><Link className="hover:text-coal-text" href={routes.explore}>Wilayah</Link></li>
            <li><Link className="hover:text-coal-text" href={routes.sorotan}>Sorotan</Link></li>
            <li><Link className="hover:text-coal-text" href={routes.variables}>Indikator BPS</Link></li>
            <li><Link className="hover:text-coal-text" href={routes.dukcapil}>Kependudukan</Link></li>
            <li><Link className="hover:text-coal-text" href={routes.keuangan}>Keuangan daerah</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-coal-border/60">
        {/* Extra bottom padding on phones clears the fixed tab bar. */}
        <div className="mx-auto max-w-7xl px-4 pb-24 pt-4 text-xs sm:px-5 md:pb-4 lg:px-8">
          NusaStats · data dibaca langsung dari API resmi, tanpa estimasi atau pengisian otomatis.
        </div>
      </div>
    </footer>
  );
}
