import Link from "next/link";
import { POSTS } from "@/lib/posts";
import { Badge } from "@/components/ui";

export const metadata = { title: "Sorotan — NusaStats" };

export default function SorotanPage() {
  return (
    <div className="mx-auto max-w-5xl px-5 py-8 lg:px-8">
      <h1 className="text-2xl font-semibold text-ink-text">Sorotan</h1>
      <p className="mt-1 max-w-2xl text-sm text-ink-muted">
        Analisis pilihan atas data BPS — bukan sekadar angka mentah, tapi cerita di baliknya.
      </p>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {POSTS.map((p) => (
          <Link
            key={p.slug}
            href={`/sorotan/${p.slug}`}
            className="group rounded-2xl border border-ink-border bg-ink-panel p-5 transition-colors hover:border-ink-accent/60"
          >
            <div className="flex items-center gap-2">
              <Badge tone="accent">{p.tag}</Badge>
              <Badge tone="muted">Sumber: {p.source}</Badge>
            </div>
            <h2 className="mt-3 text-lg font-semibold text-ink-text group-hover:text-ink-accent">{p.title}</h2>
            <p className="mt-1 text-sm text-ink-muted">{p.subtitle}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
