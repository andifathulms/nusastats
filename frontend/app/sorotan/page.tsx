import Link from "next/link";
import { POSTS } from "@/lib/posts";
import { Badge } from "@/components/ui";

export const metadata = { title: "Sorotan — NusaStats" };

export default function SorotanPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="border-b border-ink-border pb-5">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-ink-accent">
          <span className="h-1.5 w-1.5 rounded-full bg-ink-accent" />
          Analisis pilihan
        </div>
        <h1 className="mt-2 font-display text-3xl font-medium tracking-tight text-ink-text sm:text-4xl">Sorotan</h1>
        <p className="mt-2 max-w-2xl text-sm text-ink-muted">
          Analisis pilihan atas data BPS — bukan sekadar angka mentah, tapi cerita di baliknya.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {POSTS.map((p) => (
          <Link
            key={p.slug}
            href={`/sorotan/${p.slug}`}
            className="group flex flex-col rounded-2xl border border-ink-border bg-ink-panel p-5 shadow-tile transition-all hover:-translate-y-0.5 hover:border-ink-accent/50 hover:shadow-panel"
          >
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="accent">{p.tag}</Badge>
              <Badge tone="muted">Sumber: {p.source}</Badge>
            </div>
            <h2 className="mt-3 text-lg font-semibold leading-snug text-ink-text transition-colors group-hover:text-ink-accent">
              {p.title}
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-ink-muted">{p.subtitle}</p>
            <span className="mt-auto pt-3 text-sm font-medium text-ink-accent opacity-0 transition-opacity group-hover:opacity-100">
              Baca analisis →
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
