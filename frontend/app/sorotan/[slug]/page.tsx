import Link from "next/link";
import { notFound } from "next/navigation";
import { getPost, POSTS } from "@/lib/posts";
import { Badge } from "@/components/ui";
import { CompositionPost } from "@/components/CompositionPost";
import { PovertyPost } from "@/components/PovertyPost";
import { ExpenditurePost } from "@/components/ExpenditurePost";
import { HdiPost } from "@/components/HdiPost";
import { DemographyPost } from "@/components/DemographyPost";
import { GenderPost } from "@/components/GenderPost";
import { ProsperityPost } from "@/components/ProsperityPost";

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

  return (
    <div className="mx-auto max-w-5xl px-5 py-8 lg:px-8">
      <Link href="/sorotan" className="text-sm text-ink-muted hover:text-ink-text">
        ← Sorotan
      </Link>

      <div className="mt-3 flex items-center gap-2">
        <Badge tone="accent">{post.tag}</Badge>
        <Badge tone="muted">Sumber: {post.source}</Badge>
      </div>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-ink-text">{post.title}</h1>
      <p className="mt-1 text-base text-ink-muted">{post.subtitle}</p>

      <div className="mt-5 max-w-2xl space-y-3 text-[15px] leading-relaxed text-ink-text/90">
        {post.intro.map((para, i) => (
          <p key={i}>{para}</p>
        ))}
      </div>

      <div className="mt-8">
        {post.kind === "composition" && post.composition && <CompositionPost config={post.composition} />}
        {post.kind === "poverty" && post.poverty && <PovertyPost config={post.poverty} />}
        {post.kind === "expenditure" && post.expenditure && <ExpenditurePost config={post.expenditure} />}
        {post.kind === "hdi" && post.hdi && <HdiPost config={post.hdi} />}
        {post.kind === "demography" && post.demography && <DemographyPost config={post.demography} />}
        {post.kind === "gender" && post.gender && <GenderPost config={post.gender} />}
        {post.kind === "prosperity" && post.prosperity && <ProsperityPost config={post.prosperity} />}
      </div>
    </div>
  );
}
