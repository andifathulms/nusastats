import Link from "next/link";
import { notFound } from "next/navigation";
import { getPost, postNote, POSTS } from "@/lib/posts";
import { routes } from "@/lib/routes";
import { ArticleIndex, CopyLink, ReadingProgress } from "@/components/sorotan/ArticleChrome";
import { PostCard } from "@/components/sorotan/SorotanIndex";
import { CompositionPost } from "@/components/CompositionPost";
import { PovertyPost } from "@/components/PovertyPost";
import { ExpenditurePost } from "@/components/ExpenditurePost";
import { HdiPost } from "@/components/HdiPost";
import { DemographyPost } from "@/components/DemographyPost";
import { GenderPost } from "@/components/GenderPost";
import { ProsperityPost } from "@/components/ProsperityPost";
import { FiscalPost } from "@/components/FiscalPost";
import { DiversityPost } from "@/components/DiversityPost";
import { GiniPost } from "@/components/GiniPost";
import { BelanjaPost } from "@/components/BelanjaPost";
import { LaborPost } from "@/components/LaborPost";
import { CrossDevPost } from "@/components/CrossDevPost";

export function generateStaticParams() {
  return POSTS.map((p) => ({ slug: p.slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }) {
  const post = getPost(params.slug);
  return { title: post ? `${post.title} — NusaStats` : "Sorotan — NusaStats" };
}

export default function PostPage({ params }: { params: { slug: string } }) {
  const post = getPost(params.slug);
  if (!post) notFound();
  const note = postNote(post);
  const related = POSTS.filter((p) => p.slug !== post.slug)
    .sort((a, b) => Number(b.tag === post.tag) - Number(a.tag === post.tag))
    .slice(0, 3);

  return (
    <div>
      <ReadingProgress />
      <div className="grid gap-10 lg:grid-cols-[190px_minmax(0,1fr)] xl:grid-cols-[190px_minmax(0,680px)_minmax(0,1fr)]">
        <aside className="hidden lg:block">
          <div className="sticky top-28">
            <ArticleIndex
              sections={[
                ["ringkasan", "Ringkasan"],
                ["analisis", "Analisis interaktif"],
                ["sumber", "Sumber & metode"],
                ["lainnya", "Sorotan lainnya"],
              ]}
            />
          </div>
        </aside>

        <article id="ringkasan" className="min-w-0 scroll-mt-28">
          <nav aria-label="Lokasi" className="flex items-center gap-1.5 text-[13.5px] text-ink-muted">
            <Link href={routes.sorotan} className="hover:text-ink-accent">Sorotan</Link>
            <span className="text-ink-faint">›</span>
            <Link href={`${routes.sorotan}?tema=${encodeURIComponent(post.tag)}`} className="hover:text-ink-accent">{post.tag}</Link>
          </nav>
          <h1 className="mt-4 font-display text-[44px] font-medium leading-[1.0] tracking-[-0.025em] text-ink-text sm:text-[64px]">
            {post.title}
          </h1>
          <p className="mt-4 font-display text-[22px] italic leading-snug text-ink-muted sm:text-2xl">{post.subtitle}</p>
          <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 border-y border-ink-border py-3.5 text-[13px] text-ink-muted">
            <span>
              Sumber: <b className="font-semibold text-ink-text">{post.source}</b>
            </span>
            <span>Tema: {post.tag}</span>
            <span className="ml-auto">
              <CopyLink />
            </span>
          </div>

          <div className="prose-read mt-7 space-y-5 text-ink-text [&>p:first-child]:first-letter:float-left [&>p:first-child]:first-letter:pr-2.5 [&>p:first-child]:first-letter:pt-1.5 [&>p:first-child]:first-letter:font-display [&>p:first-child]:first-letter:text-[64px] [&>p:first-child]:first-letter:leading-[0.8] [&>p:first-child]:first-letter:text-ink-accent">
            {post.intro.map((para, i) => (
              <p key={i}>{para}</p>
            ))}
          </div>
        </article>

        {note && (
          <aside className="hidden xl:block">
            <div className="sticky top-28 mt-56 border-l-2 border-kunyit pl-4 text-[13px] leading-relaxed text-ink-muted">
              <div className="mb-1 font-semibold text-ink-text">Catatan metode</div>
              {note}
            </div>
          </aside>
        )}
      </div>

      <section id="analisis" className="mt-12 scroll-mt-28">
        {post.kind === "composition" && post.composition && <CompositionPost config={post.composition} />}
        {post.kind === "poverty" && post.poverty && <PovertyPost config={post.poverty} />}
        {post.kind === "expenditure" && post.expenditure && <ExpenditurePost config={post.expenditure} />}
        {post.kind === "hdi" && post.hdi && <HdiPost config={post.hdi} />}
        {post.kind === "demography" && post.demography && <DemographyPost config={post.demography} />}
        {post.kind === "gender" && post.gender && <GenderPost config={post.gender} />}
        {post.kind === "prosperity" && post.prosperity && <ProsperityPost config={post.prosperity} />}
        {post.kind === "fiscal" && post.fiscal && <FiscalPost config={post.fiscal} />}
        {post.kind === "diversity" && post.diversity && <DiversityPost config={post.diversity} />}
        {post.kind === "inequality" && post.inequality && <GiniPost config={post.inequality} />}
        {post.kind === "spending" && post.spending && <BelanjaPost config={post.spending} />}
        {post.kind === "labor" && post.labor && <LaborPost config={post.labor} />}
        {post.kind === "crossdev" && post.crossdev && <CrossDevPost config={post.crossdev} />}
      </section>

      <section id="sumber" className="mt-12 scroll-mt-28 rounded-[20px] bg-ink-bg2 p-6 sm:p-8">
        <div className="flex items-start gap-4">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="mt-0.5 h-7 w-7 shrink-0 text-ink-accent" aria-hidden>
            <path d="M12 3 4 6v6c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6z" />
            <path d="m9 12 2 2 4-4" />
          </svg>
          <div className="min-w-0">
            <h2 className="font-display text-2xl font-medium text-ink-text">Dari mana angka ini?</h2>
            <p className="mt-2 text-[15px] leading-relaxed text-ink-muted">
              Sumber: <b className="text-ink-text">{post.source}</b>. Semua nilai dibaca langsung dari API resmi; setiap respons
              tersimpan bersama URL permintaan, waktu pengambilan, dan sidik jari SHA-256-nya. Tidak ada nilai yang diestimasi
              atau diisi otomatis.
            </p>
            {note && <p className="mt-3 text-sm leading-relaxed text-ink-muted xl:hidden">{note}</p>}
          </div>
        </div>
      </section>

      <section id="lainnya" className="mt-14 scroll-mt-28">
        <div className="mb-5 flex items-end justify-between gap-3">
          <h2 className="font-display text-3xl font-medium text-ink-text">Sorotan lainnya</h2>
          <Link href={routes.sorotan} className="text-sm font-bold text-ink-accent hover:underline">
            Semua analisis →
          </Link>
        </div>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {related.map((p) => (
            <PostCard key={p.slug} post={p} />
          ))}
        </div>
      </section>
    </div>
  );
}
