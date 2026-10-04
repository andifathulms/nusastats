"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { POSTS, postSources, type Post } from "@/lib/posts";
import { routes } from "@/lib/routes";
import { StoryCover } from "@/components/StoryCover";
import { Eyebrow } from "@/components/ui";

const SOURCES = ["BPS", "Dukcapil", "DJPK"] as const;

/** Magazine front page: lead story, then a 3-column grid; topic + source filters in the URL. */
export function SorotanIndex() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [tema, setTema] = useState(params.get("tema") ?? "");
  const [sumber, setSumber] = useState(params.get("sumber") ?? "");

  useEffect(() => {
    const q = new URLSearchParams();
    if (tema) q.set("tema", tema);
    if (sumber) q.set("sumber", sumber);
    const s = q.toString();
    router.replace(s ? `${pathname}?${s}` : pathname, { scroll: false });
  }, [tema, sumber, pathname, router]);

  const tags = useMemo(() => [...new Set(POSTS.map((p) => p.tag))], []);
  const posts = POSTS.filter(
    (p) => (!tema || p.tag === tema) && (!sumber || postSources(p).includes(sumber as (typeof SOURCES)[number])),
  );
  const [lead, ...rest] = posts;

  return (
    <div className="space-y-10">
      <header className="grid items-end gap-6 border-b border-ink-border pb-7 lg:grid-cols-[1fr_auto]">
        <div>
          <Eyebrow>Analisis pilihan · {POSTS.length} cerita data</Eyebrow>
          <h1 className="mt-3 font-display text-6xl font-medium leading-[0.9] tracking-[-0.03em] text-ink-text sm:text-[88px]">Sorotan</h1>
          <p className="mt-3 font-display text-xl italic text-ink-muted sm:text-[22px]">Bukan sekadar angka mentah, tapi cerita di baliknya.</p>
        </div>
        <div className="flex flex-col gap-2 lg:items-end">
          <ChipRow label="Tema">
            <Chip on={!tema} onClick={() => setTema("")} count={POSTS.length}>Semua</Chip>
            {tags.map((t) => (
              <Chip key={t} on={tema === t} onClick={() => setTema(tema === t ? "" : t)} count={POSTS.filter((p) => p.tag === t).length}>
                {t}
              </Chip>
            ))}
          </ChipRow>
          <ChipRow label="Sumber">
            {SOURCES.map((s) => (
              <Chip key={s} on={sumber === s} onClick={() => setSumber(sumber === s ? "" : s)} count={POSTS.filter((p) => postSources(p).includes(s)).length}>
                {s}
              </Chip>
            ))}
          </ChipRow>
        </div>
      </header>

      {!lead ? (
        <div className="py-16 text-center text-ink-muted">Belum ada analisis untuk kombinasi filter ini.</div>
      ) : (
        <>
          <Link href={routes.post(lead.slug)} className="group grid items-center gap-8 lg:grid-cols-[1.15fr_1fr]">
            <StoryCover
              dark
              highlight={lead.cover?.prov}
              label={lead.cover?.label ?? "Nasional"}
              className="aspect-[16/10] rounded-[24px] shadow-lift transition-transform duration-300 group-hover:-translate-y-1"
            />
            <div>
              <span className="inline-flex rounded-full bg-ink-accent/10 px-3 py-1 text-xs font-semibold text-ink-accent">
                {lead.tag} · {lead.source}
              </span>
              <h2 className="mt-4 font-display text-[40px] font-medium leading-[1.02] tracking-[-0.02em] text-ink-text transition-colors group-hover:text-ink-accent sm:text-[52px]">
                {lead.title}
              </h2>
              <p className="mt-4 text-lg leading-relaxed text-ink-muted">{lead.subtitle}</p>
              <span className="mt-6 inline-flex h-12 items-center rounded-full bg-brand-gradient px-6 font-bold text-white shadow-glow">
                Baca analisis →
              </span>
            </div>
          </Link>

          {rest.length > 0 && (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {rest.map((p) => (
                <PostCard key={p.slug} post={p} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function PostCard({ post }: { post: Post }) {
  return (
    <Link
      href={routes.post(post.slug)}
      className="group flex flex-col overflow-hidden rounded-[20px] border border-ink-border bg-ink-panel shadow-tile transition-all hover:-translate-y-1 hover:shadow-lift"
    >
      <StoryCover highlight={post.cover?.prov} label={post.cover?.label ?? "Nasional"} className="aspect-[16/9]" />
      <div className="flex flex-1 flex-col gap-2 p-5">
        <Eyebrow>
          {post.tag} · {post.source}
        </Eyebrow>
        <h3 className="font-display text-2xl font-medium leading-[1.12] tracking-[-0.01em] text-ink-text group-hover:text-ink-accent">{post.title}</h3>
        <p className="text-sm leading-relaxed text-ink-muted">{post.subtitle}</p>
      </div>
    </Link>
  );
}

function ChipRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-14 text-xs font-semibold text-ink-faint lg:w-auto">{label}</span>
      {children}
    </div>
  );
}

function Chip({ on, onClick, count, children }: { on: boolean; onClick: () => void; count: number; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      className={`rounded-full border px-3.5 py-1.5 text-[13.5px] font-semibold transition-colors ${
        on ? "border-laut-950 bg-laut-950 text-kertas-200 dark:border-ink-accent dark:bg-ink-accent dark:text-ink-onAccent" : "border-ink-borderStrong text-ink-text hover:border-ink-accent/60"
      }`}
    >
      {children}
      <span className={`ml-1.5 font-medium ${on ? "opacity-70" : "text-ink-faint"}`}>{count}</span>
    </button>
  );
}
