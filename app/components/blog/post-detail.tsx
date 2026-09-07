import { CalendarIcon, EyeIcon, UserIcon } from "lucide-react";
import Image from "next/image";

import CategoryPill from "@/app/components/blog/category-pill";
import TagPill from "@/app/components/blog/tag-pill";
import type { PostWithRelations } from "@/app/lib/posts/definitions";
import { formatFullDate } from "@/app/lib/formatters";
import { postAuthorName } from "@/app/lib/posts/helpers";
import AudienceBadge from "@/app/components/blog/audience-badge";
import PostGate from "@/app/components/blog/post-gate";

type Props = {
  post: PostWithRelations;
  previewBanner?: boolean;
  /** Set when the viewer may not read the body; renders the gate instead. */
  gateReason?: "anonymous" | "unverified" | null;
};

export default function PostDetail({ post, previewBanner, gateReason }: Props) {
  return (
    <article className="mx-auto max-w-3xl px-4 py-8">
      {previewBanner && (
        <div className="mb-6 flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <EyeIcon className="h-4 w-4" />
          <span>Vista previa — estos cambios aún no se han publicado.</span>
        </div>
      )}
      <header className="space-y-4 mb-8">
        <div className="flex flex-wrap items-center gap-2">
          <AudienceBadge audience={post.audience} />
        </div>
        {post.categories.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {post.categories.map((c) => (
              <CategoryPill key={c.id} category={c} />
            ))}
          </div>
        )}
        <h1 className="text-3xl md:text-4xl font-bold leading-tight">
          {post.title}
        </h1>
        {post.excerpt && (
          <p className="text-lg text-muted-foreground">{post.excerpt}</p>
        )}
        <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <UserIcon className="h-4 w-4" />
            {postAuthorName(post.author)}
          </span>
          {post.publishedAt && (
            <span className="inline-flex items-center gap-1.5">
              <CalendarIcon className="h-4 w-4" />
              {formatFullDate(post.publishedAt)}
            </span>
          )}
        </div>
      </header>

      {post.coverImageUrl && (
        <div className="relative aspect-[16/9] w-full overflow-hidden rounded-lg mb-8 bg-muted">
          <Image
            src={post.coverImageUrl}
            alt={post.title}
            fill
            priority
            className="object-cover"
            sizes="(max-width: 768px) 100vw, 768px"
          />
        </div>
      )}

      {gateReason ? (
        <PostGate reason={gateReason} slug={post.slug} />
      ) : (
        <div
          className="blog-article"
          // biome-ignore lint/security/noDangerouslySetInnerHtml: rendered from the stored blocks and sanitized server-side in app/lib/posts/render.ts — never accepted from the client
          dangerouslySetInnerHTML={{ __html: post.contentHtml }}
        />
      )}

      {post.tags.length > 0 && (
        <footer className="mt-12 pt-6 border-t flex flex-wrap gap-2">
          {post.tags.map((t) => (
            <TagPill key={t.id} tag={t} />
          ))}
        </footer>
      )}
    </article>
  );
}
